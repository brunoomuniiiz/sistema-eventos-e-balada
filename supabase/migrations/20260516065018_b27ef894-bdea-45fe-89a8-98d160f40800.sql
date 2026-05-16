
-- 1. products.is_available
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;

-- 2. Combos no longer track own stock
UPDATE public.products SET track_stock = false WHERE product_type = 'combo';

-- 3. sale_payments table for split payments
CREATE TABLE IF NOT EXISTS public.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON public.sale_payments(sale_id);
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View sale_payments" ON public.sale_payments;
CREATE POLICY "View sale_payments" ON public.sale_payments FOR SELECT
  USING (user_id = get_owner_id(auth.uid()) AND has_permission(auth.uid(), user_id, 'vendas'));
DROP POLICY IF EXISTS "Insert sale_payments" ON public.sale_payments;
CREATE POLICY "Insert sale_payments" ON public.sale_payments FOR INSERT
  WITH CHECK (user_id = get_owner_id(auth.uid()) AND has_permission(auth.uid(), user_id, 'vendas'));
DROP POLICY IF EXISTS "Update sale_payments" ON public.sale_payments;
CREATE POLICY "Update sale_payments" ON public.sale_payments FOR UPDATE
  USING (user_id = get_owner_id(auth.uid()) AND has_permission(auth.uid(), user_id, 'vendas'));
DROP POLICY IF EXISTS "Delete sale_payments" ON public.sale_payments;
CREATE POLICY "Delete sale_payments" ON public.sale_payments FOR DELETE
  USING (user_id = get_owner_id(auth.uid()) AND has_permission(auth.uid(), user_id, 'vendas'));

-- 4. decrement_product_stock: never decrement combo's own row
CREATE OR REPLACE FUNCTION public.decrement_product_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _type text;
  _track boolean;
  _loc uuid;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.location_id INTO _loc FROM public.sales s WHERE s.id = NEW.sale_id;

  IF _loc IS NULL THEN
    SELECT id INTO _loc FROM public.stock_locations
    WHERE user_id = NEW.user_id AND is_default = true LIMIT 1;
  END IF;

  SELECT product_type, track_stock INTO _type, _track
  FROM public.products WHERE id = NEW.product_id;

  IF _type = 'combo' THEN
    -- Explode combo into components; never touch the combo's own product_stock row
    UPDATE public.product_stock ps
    SET quantity = GREATEST(ps.quantity - (ci.quantity * NEW.quantity)::int, 0)
    FROM public.combo_items ci, public.products p
    WHERE ci.combo_product_id = NEW.product_id
      AND p.id = ci.component_product_id
      AND p.track_stock = true
      AND ps.product_id = ci.component_product_id
      AND ps.location_id = _loc;
  ELSE
    IF COALESCE(_track, true) AND _loc IS NOT NULL THEN
      UPDATE public.product_stock
      SET quantity = GREATEST(quantity - NEW.quantity, 0)
      WHERE product_id = NEW.product_id AND location_id = _loc;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. close_cash_blind: use sale_payments when present (split), fallback to sales.payment_method
CREATE OR REPLACE FUNCTION public.close_cash_blind(_declared_dinheiro numeric, _declared_debito numeric, _declared_credito numeric, _declared_pix numeric, _grant_token text, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid;
  _closing_id uuid;
  _exp_din numeric := 0; _exp_deb numeric := 0; _exp_cre numeric := 0; _exp_pix numeric := 0;
  _count integer := 0;
  _name text;
  _session record;
  _wd numeric := 0;
  _grant jsonb;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), _owner, 'vendas') THEN
    RAISE EXCEPTION 'Sem permissão de vendas';
  END IF;

  SELECT * INTO _session FROM public.cash_sessions
   WHERE opened_by = auth.uid() AND status = 'open' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum caixa aberto'; END IF;

  _grant := public.consume_grant(_grant_token, 'closing');

  SELECT COALESCE(display_name, email) INTO _name
  FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  -- Expected per method: prefer sale_payments rows; if a sale has no payments rows fallback to sales.payment_method
  WITH s AS (
    SELECT id, total, payment_method FROM public.sales WHERE session_id = _session.id
  ),
  pay AS (
    SELECT sp.method, sp.amount, sp.sale_id FROM public.sale_payments sp WHERE sp.sale_id IN (SELECT id FROM s)
  ),
  combined AS (
    SELECT method, SUM(amount) AS amount FROM pay GROUP BY method
    UNION ALL
    SELECT s.payment_method AS method, SUM(s.total) AS amount
    FROM s WHERE NOT EXISTS (SELECT 1 FROM pay WHERE pay.sale_id = s.id)
    GROUP BY s.payment_method
  )
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE method = 'dinheiro'), 0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'debito'), 0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'credito'), 0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'pix'), 0)
  INTO _exp_din, _exp_deb, _exp_cre, _exp_pix
  FROM combined;

  SELECT COUNT(*) INTO _count FROM public.sales WHERE session_id = _session.id;
  SELECT COALESCE(SUM(amount),0) INTO _wd FROM public.cash_withdrawals WHERE session_id = _session.id;

  _exp_din := _session.opening_amount + _exp_din - _wd;

  INSERT INTO public.cash_closings (
    user_id, closed_by, closed_by_name,
    declared_dinheiro, declared_debito, declared_credito, declared_pix,
    expected_dinheiro, expected_debito, expected_credito, expected_pix,
    sales_count, notes, session_id, opening_amount, withdrawals_total,
    authorized_by, authorized_by_name
  ) VALUES (
    _owner, auth.uid(), _name,
    COALESCE(_declared_dinheiro,0), COALESCE(_declared_debito,0),
    COALESCE(_declared_credito,0), COALESCE(_declared_pix,0),
    _exp_din, _exp_deb, _exp_cre, _exp_pix,
    _count, _notes, _session.id, _session.opening_amount, _wd,
    (_grant->>'authorized_by')::uuid, _grant->>'authorized_by_name'
  ) RETURNING id INTO _closing_id;

  UPDATE public.sales SET closing_id = _closing_id WHERE session_id = _session.id AND closing_id IS NULL;
  UPDATE public.cash_sessions SET status = 'closed', closed_at = now(), closing_id = _closing_id
   WHERE id = _session.id;

  RETURN _closing_id;
END $function$;
