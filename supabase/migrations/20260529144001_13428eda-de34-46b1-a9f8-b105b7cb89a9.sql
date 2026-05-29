
-- ============================================================
-- STOCK LEDGER + UNIFIED SOURCE OF TRUTH
-- ============================================================

-- 1) Tabela de extrato (append-only)
CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name_snapshot text NOT NULL,
  location_id uuid NOT NULL,
  location_name_snapshot text,
  delta integer NOT NULL,
  qty_before integer NOT NULL,
  qty_after integer NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  source_id uuid,
  reason text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_user_created ON public.stock_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_product ON public.stock_ledger (product_id, created_at DESC);

GRANT SELECT ON public.stock_ledger TO authenticated;
GRANT ALL ON public.stock_ledger TO service_role;

ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View stock_ledger" ON public.stock_ledger;
CREATE POLICY "View stock_ledger" ON public.stock_ledger
  FOR SELECT TO authenticated
  USING (user_id = get_owner_id(auth.uid()) AND has_permission(auth.uid(), user_id, 'estoque'));

-- 2) Trigger que escreve no ledger a cada mudança em product_stock
CREATE OR REPLACE FUNCTION public.log_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _src text := COALESCE(current_setting('app.stock_source', true), 'manual');
  _src_id uuid;
  _reason text := NULLIF(current_setting('app.stock_reason', true), '');
  _delta int;
  _before int;
  _after int;
  _pname text;
  _lname text;
  _uid uuid := auth.uid();
  _uname text;
BEGIN
  BEGIN _src_id := NULLIF(current_setting('app.stock_source_id', true), '')::uuid; EXCEPTION WHEN others THEN _src_id := NULL; END;

  IF TG_OP = 'INSERT' THEN
    _before := 0; _after := NEW.quantity; _delta := NEW.quantity;
  ELSIF TG_OP = 'UPDATE' THEN
    _before := OLD.quantity; _after := NEW.quantity; _delta := NEW.quantity - OLD.quantity;
    IF _delta = 0 THEN RETURN NEW; END IF;
  ELSE
    _before := OLD.quantity; _after := 0; _delta := -OLD.quantity;
  END IF;

  SELECT name INTO _pname FROM public.products WHERE id = COALESCE(NEW.product_id, OLD.product_id);
  SELECT name INTO _lname FROM public.stock_locations WHERE id = COALESCE(NEW.location_id, OLD.location_id);
  SELECT COALESCE(display_name, email, 'Sistema') INTO _uname FROM public.user_roles WHERE user_id = _uid LIMIT 1;

  INSERT INTO public.stock_ledger (
    user_id, product_id, product_name_snapshot, location_id, location_name_snapshot,
    delta, qty_before, qty_after, source, source_id, reason, created_by, created_by_name
  ) VALUES (
    COALESCE(NEW.user_id, OLD.user_id),
    COALESCE(NEW.product_id, OLD.product_id),
    COALESCE(_pname, '?'),
    COALESCE(NEW.location_id, OLD.location_id),
    _lname,
    _delta, _before, _after, _src, _src_id, _reason, _uid, _uname
  );

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_log_stock_movement ON public.product_stock;
CREATE TRIGGER trg_log_stock_movement
  AFTER INSERT OR UPDATE OF quantity OR DELETE ON public.product_stock
  FOR EACH ROW EXECUTE FUNCTION public.log_stock_movement();

-- 3) Marcar contexto nas funções existentes
CREATE OR REPLACE FUNCTION public.decrement_product_stock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _type text; _track boolean; _loc uuid;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  SELECT s.location_id INTO _loc FROM public.sales s WHERE s.id = NEW.sale_id;
  IF _loc IS NULL THEN
    SELECT id INTO _loc FROM public.stock_locations
    WHERE user_id = NEW.user_id AND is_default = true LIMIT 1;
  END IF;
  SELECT product_type, track_stock INTO _type, _track FROM public.products WHERE id = NEW.product_id;

  PERFORM set_config('app.stock_source', 'sale', true);
  PERFORM set_config('app.stock_source_id', COALESCE(NEW.sale_id::text, ''), true);
  PERFORM set_config('app.stock_reason', 'Venda', true);

  IF _type = 'combo' THEN
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

  PERFORM set_config('app.stock_source', '', true);
  PERFORM set_config('app.stock_source_id', '', true);
  PERFORM set_config('app.stock_reason', '', true);

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.close_inventory(_inventory_id uuid, _adjust_stock boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid; _loc uuid; _surplus numeric := 0; _shortage numeric := 0;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), _owner, 'estoque') THEN
    RAISE EXCEPTION 'Sem permissão de estoque';
  END IF;
  SELECT location_id INTO _loc FROM public.stock_inventories
   WHERE id = _inventory_id AND user_id = _owner;
  IF _loc IS NULL THEN RAISE EXCEPTION 'Inventário não encontrado'; END IF;

  UPDATE public.stock_inventory_items
  SET diff_value = (COALESCE(counted_qty, 0) - system_qty) * cost_price
  WHERE inventory_id = _inventory_id;

  SELECT
    COALESCE(SUM(CASE WHEN diff_value > 0 THEN diff_value ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN diff_value < 0 THEN -diff_value ELSE 0 END), 0)
  INTO _surplus, _shortage
  FROM public.stock_inventory_items WHERE inventory_id = _inventory_id;

  IF _adjust_stock THEN
    PERFORM set_config('app.stock_source', 'inventory', true);
    PERFORM set_config('app.stock_source_id', _inventory_id::text, true);
    PERFORM set_config('app.stock_reason', 'Inventário aprovado', true);

    INSERT INTO public.product_stock (user_id, product_id, location_id, quantity)
    SELECT _owner, i.product_id, _loc, COALESCE(i.counted_qty, i.system_qty)
    FROM public.stock_inventory_items i
    WHERE i.inventory_id = _inventory_id AND i.counted_qty IS NOT NULL
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = EXCLUDED.quantity;

    PERFORM set_config('app.stock_source', '', true);
    PERFORM set_config('app.stock_source_id', '', true);
    PERFORM set_config('app.stock_reason', '', true);
  END IF;

  UPDATE public.stock_inventories
  SET status = 'closed', closed_at = now(),
      total_surplus_value = _surplus, total_shortage_value = _shortage,
      net_value = _surplus - _shortage
  WHERE id = _inventory_id;
END $$;

-- 4) RPC: ajuste manual com PIN (usado pelo modal do produto)
CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  _product_id uuid,
  _location_id uuid,
  _delta integer,
  _reason text,
  _grant_token text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _owner uuid := public.get_owner_id(auth.uid());
  _current int;
  _new int;
  _grant record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF _delta = 0 THEN RAISE EXCEPTION 'Variação não pode ser zero'; END IF;

  -- Valida e consome o grant via consume_grant
  PERFORM public.consume_grant(_grant_token, 'operation');

  -- Garante a linha de product_stock
  INSERT INTO public.product_stock (user_id, product_id, location_id, quantity)
  VALUES (_owner, _product_id, _location_id, 0)
  ON CONFLICT (product_id, location_id) DO NOTHING;

  SELECT quantity INTO _current FROM public.product_stock
   WHERE product_id = _product_id AND location_id = _location_id FOR UPDATE;

  _new := GREATEST(_current + _delta, 0);

  PERFORM set_config('app.stock_source', 'manual', true);
  PERFORM set_config('app.stock_source_id', '', true);
  PERFORM set_config('app.stock_reason', COALESCE(_reason, 'Ajuste manual'), true);

  UPDATE public.product_stock SET quantity = _new
   WHERE product_id = _product_id AND location_id = _location_id;

  PERFORM set_config('app.stock_source', '', true);
  PERFORM set_config('app.stock_reason', '', true);

  RETURN jsonb_build_object('ok', true, 'qty_before', _current, 'qty_after', _new);
END $$;

GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, uuid, integer, text, text) TO authenticated;

-- 5) Backfill: marca o ponto zero do extrato com saldos atuais
INSERT INTO public.stock_ledger (
  user_id, product_id, product_name_snapshot, location_id, location_name_snapshot,
  delta, qty_before, qty_after, source, reason, created_by, created_by_name
)
SELECT ps.user_id, ps.product_id, p.name, ps.location_id, sl.name,
       ps.quantity, 0, ps.quantity, 'backfill', 'Saldo inicial do extrato', NULL, 'Sistema'
FROM public.product_stock ps
LEFT JOIN public.products p ON p.id = ps.product_id
LEFT JOIN public.stock_locations sl ON sl.id = ps.location_id
WHERE ps.quantity <> 0
  AND NOT EXISTS (SELECT 1 FROM public.stock_ledger l WHERE l.user_id = ps.user_id);

-- 6) Garante que products.stock_quantity reflita a soma real (uma vez, na migration)
UPDATE public.products p
SET stock_quantity = COALESCE((SELECT SUM(quantity) FROM public.product_stock ps WHERE ps.product_id = p.id), 0)
WHERE p.product_type = 'simple';
