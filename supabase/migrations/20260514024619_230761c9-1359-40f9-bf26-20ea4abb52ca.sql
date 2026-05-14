
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS closing_id uuid;

CREATE INDEX IF NOT EXISTS idx_sales_closing ON public.sales(closing_id);

CREATE TABLE IF NOT EXISTS public.cash_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  closed_by uuid NOT NULL,
  closed_by_name text,
  declared_dinheiro numeric NOT NULL DEFAULT 0,
  declared_debito numeric NOT NULL DEFAULT 0,
  declared_credito numeric NOT NULL DEFAULT 0,
  declared_pix numeric NOT NULL DEFAULT 0,
  expected_dinheiro numeric NOT NULL DEFAULT 0,
  expected_debito numeric NOT NULL DEFAULT 0,
  expected_credito numeric NOT NULL DEFAULT 0,
  expected_pix numeric NOT NULL DEFAULT 0,
  sales_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View cash_closings" ON public.cash_closings;
DROP POLICY IF EXISTS "Insert cash_closings" ON public.cash_closings;
DROP POLICY IF EXISTS "Delete cash_closings" ON public.cash_closings;

CREATE POLICY "View cash_closings" ON public.cash_closings FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'vendas'));
CREATE POLICY "Insert cash_closings" ON public.cash_closings FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid())
              AND public.has_permission(auth.uid(), user_id, 'vendas')
              AND closed_by = auth.uid());
CREATE POLICY "Delete cash_closings" ON public.cash_closings FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.is_owner_of(auth.uid(), user_id));

-- RPC that closes the cash blindly: caller passes declared values,
-- function computes expected from open sales and links them to the closing.
CREATE OR REPLACE FUNCTION public.close_cash_blind(
  _declared_dinheiro numeric,
  _declared_debito numeric,
  _declared_credito numeric,
  _declared_pix numeric,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _owner uuid;
  _has boolean;
  _closing_id uuid;
  _exp_din numeric := 0;
  _exp_deb numeric := 0;
  _exp_cre numeric := 0;
  _exp_pix numeric := 0;
  _count integer := 0;
  _name text;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  _has := public.has_permission(auth.uid(), _owner, 'vendas');
  IF NOT _has THEN
    RAISE EXCEPTION 'Sem permissão de vendas';
  END IF;

  SELECT COALESCE(display_name, email) INTO _name
  FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  SELECT
    COALESCE(SUM(CASE WHEN payment_method = 'dinheiro' THEN total END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'debito'   THEN total END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'credito'  THEN total END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'pix'      THEN total END), 0),
    COUNT(*)
  INTO _exp_din, _exp_deb, _exp_cre, _exp_pix, _count
  FROM public.sales
  WHERE user_id = _owner AND closing_id IS NULL;

  INSERT INTO public.cash_closings (
    user_id, closed_by, closed_by_name,
    declared_dinheiro, declared_debito, declared_credito, declared_pix,
    expected_dinheiro, expected_debito, expected_credito, expected_pix,
    sales_count, notes
  ) VALUES (
    _owner, auth.uid(), _name,
    COALESCE(_declared_dinheiro,0), COALESCE(_declared_debito,0),
    COALESCE(_declared_credito,0), COALESCE(_declared_pix,0),
    _exp_din, _exp_deb, _exp_cre, _exp_pix,
    _count, _notes
  ) RETURNING id INTO _closing_id;

  UPDATE public.sales SET closing_id = _closing_id
  WHERE user_id = _owner AND closing_id IS NULL;

  RETURN _closing_id;
END;
$$;

REVOKE ALL ON FUNCTION public.close_cash_blind(numeric,numeric,numeric,numeric,text) FROM public;
GRANT EXECUTE ON FUNCTION public.close_cash_blind(numeric,numeric,numeric,numeric,text) TO authenticated;
