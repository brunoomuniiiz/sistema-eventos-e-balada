-- Drop old overload of open_cash_session that causes ambiguity
DROP FUNCTION IF EXISTS public.open_cash_session(numeric, text);

-- Read-only RPC to compute expected totals for the current open session
CREATE OR REPLACE FUNCTION public.get_session_expected_totals()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _session record;
  _exp_din numeric := 0;
  _exp_deb numeric := 0;
  _exp_cre numeric := 0;
  _exp_pix numeric := 0;
  _sales_total numeric := 0;
  _count integer := 0;
  _wd numeric := 0;
BEGIN
  SELECT * INTO _session FROM public.cash_sessions
   WHERE opened_by = auth.uid() AND status = 'open' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum caixa aberto'; END IF;

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

  SELECT COUNT(*), COALESCE(SUM(total),0) INTO _count, _sales_total
    FROM public.sales WHERE session_id = _session.id;
  SELECT COALESCE(SUM(amount),0) INTO _wd
    FROM public.cash_withdrawals WHERE session_id = _session.id;

  RETURN jsonb_build_object(
    'session_id', _session.id,
    'opening_amount', _session.opening_amount,
    'withdrawals_total', _wd,
    'sales_count', _count,
    'sales_total', _sales_total,
    'expected_dinheiro', _session.opening_amount + _exp_din - _wd,
    'expected_debito', _exp_deb,
    'expected_credito', _exp_cre,
    'expected_pix', _exp_pix
  );
END $$;