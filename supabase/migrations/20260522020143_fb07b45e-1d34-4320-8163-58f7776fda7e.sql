
-- =========================================================================
-- 1) Sangria remota: dono autoriza sangria sobre qualquer sessão aberta
-- =========================================================================
CREATE OR REPLACE FUNCTION public.register_withdrawal_for_session(
  _session_id uuid,
  _amount numeric,
  _reason text,
  _grant_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _owner uuid;
  _name text;
  _session_owner uuid;
  _grant jsonb;
  _id uuid;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT public.is_owner_of(auth.uid(), _owner) THEN
    RAISE EXCEPTION 'Apenas o dono pode fazer sangria remota';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  SELECT user_id INTO _session_owner FROM public.cash_sessions
    WHERE id = _session_id AND status = 'open' LIMIT 1;
  IF _session_owner IS NULL THEN
    RAISE EXCEPTION 'Sessão não está aberta';
  END IF;
  IF _session_owner <> _owner THEN
    RAISE EXCEPTION 'Sessão pertence a outro estabelecimento';
  END IF;

  _grant := public.consume_grant(_grant_token, 'withdrawal');

  SELECT COALESCE(display_name, email) INTO _name
    FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.cash_withdrawals
    (user_id, session_id, amount, reason, created_by, created_by_name, authorized_by, authorized_by_name)
  VALUES
    (_owner, _session_id, _amount, _reason, auth.uid(), _name,
     (_grant->>'authorized_by')::uuid, _grant->>'authorized_by_name')
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- =========================================================================
-- 2) Painel ao vivo: faturamento bruto, mix, ranking, top produtos, sangrias
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_live_dashboard(
  _from timestamptz,
  _to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _owner uuid;
  _result jsonb;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT (public.is_owner_of(auth.uid(), _owner)
          OR public.has_permission(auth.uid(), _owner, 'financeiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  WITH
  -- Vendas presenciais (PDV / Garçom) — paga em sale_payments OU payment_method único
  sales_in_range AS (
    SELECT s.id, s.user_id, s.total, s.payment_method, s.created_at,
           s.employee_id AS seller_user_id,
           COALESCE(s.employee_name, 'PDV') AS seller_name,
           CASE
             WHEN s.payment_method = 'online' THEN 'pos'
             ELSE 'presencial'
           END AS channel
    FROM public.sales s
    WHERE s.user_id = _owner
      AND s.created_at >= _from AND s.created_at < _to
      AND s.status NOT IN ('cancelled', 'refunded')
  ),
  -- Decompor pagamentos: cada venda pode ter múltiplos métodos
  sales_payments_expanded AS (
    SELECT s.id, s.user_id, s.seller_user_id, s.seller_name, s.channel,
           s.created_at,
           COALESCE(sp.method, s.payment_method) AS method,
           COALESCE(sp.amount, s.total) AS amount
    FROM sales_in_range s
    LEFT JOIN public.sale_payments sp ON sp.sale_id = s.id
  ),
  -- Lojinha (delivered = pago)
  lojinha_in_range AS (
    SELECT o.id, o.user_id, o.total, o.created_at,
           o.seller_user_id,
           COALESCE(o.seller_name, 'Lojinha online') AS seller_name,
           CASE
             WHEN o.channel = 'pos' THEN 'pos'
             ELSE 'lojinha'
           END AS channel,
           CASE
             WHEN o.channel = 'pos' THEN 'cartao_point'
             ELSE 'pix'
           END AS method
    FROM public.lojinha_orders o
    WHERE o.user_id = _owner
      AND (o.paid_at IS NOT NULL OR o.delivered_at IS NOT NULL)
      AND COALESCE(o.paid_at, o.delivered_at, o.created_at) >= _from
      AND COALESCE(o.paid_at, o.delivered_at, o.created_at) < _to
      AND o.status NOT IN ('cancelled', 'refunded', 'abandoned', 'pending')
  ),
  -- Portaria
  portaria_in_range AS (
    SELECT e.id, e.user_id, e.amount_paid AS total, e.created_at,
           e.created_by AS seller_user_id,
           COALESCE(e.created_by_name, 'Portaria') AS seller_name,
           'portaria'::text AS channel,
           COALESCE(NULLIF(e.payment_method, ''), 'dinheiro') AS method,
           e.amount_paid AS amount
    FROM public.event_entries e
    WHERE e.user_id = _owner
      AND e.created_at >= _from AND e.created_at < _to
  ),
  -- União normalizada (id, seller, channel, method, amount)
  unified AS (
    SELECT seller_user_id, seller_name, channel, method, amount, id, created_at
    FROM sales_payments_expanded
    UNION ALL
    SELECT seller_user_id, seller_name, channel, method, total AS amount, id, created_at
    FROM lojinha_in_range
    UNION ALL
    SELECT seller_user_id, seller_name, channel, method, amount, id, created_at
    FROM portaria_in_range
  ),
  -- Normaliza método de pagamento em 4 buckets
  unified_norm AS (
    SELECT
      seller_user_id, seller_name, channel, id, created_at, amount,
      CASE
        WHEN method ILIKE '%dinheiro%' OR method ILIKE '%cash%' THEN 'dinheiro'
        WHEN method ILIKE '%pix%' THEN 'pix'
        WHEN method ILIKE '%debito%' OR method = 'cartao_point' THEN 'debito'
        WHEN method ILIKE '%credito%' OR method ILIKE '%maquininha%' THEN 'credito'
        ELSE 'outros'
      END AS method_bucket
    FROM unified
  ),
  -- Totais por forma de pagamento
  by_method AS (
    SELECT method_bucket, SUM(amount) AS total
    FROM unified_norm GROUP BY method_bucket
  ),
  -- Totais por canal
  by_channel AS (
    SELECT channel, SUM(amount) AS total, COUNT(DISTINCT id) AS n_sales
    FROM unified_norm GROUP BY channel
  ),
  -- Totais por funcionário (com quebra de método)
  by_seller AS (
    SELECT
      seller_user_id,
      COALESCE(MAX(seller_name), '—') AS seller_name,
      array_agg(DISTINCT channel) AS channels,
      COUNT(DISTINCT id) AS n_sales,
      SUM(amount) AS total,
      SUM(amount) FILTER (WHERE method_bucket = 'dinheiro') AS dinheiro,
      SUM(amount) FILTER (WHERE method_bucket = 'pix') AS pix,
      SUM(amount) FILTER (WHERE method_bucket = 'debito') AS debito,
      SUM(amount) FILTER (WHERE method_bucket = 'credito') AS credito
    FROM unified_norm
    GROUP BY seller_user_id
  ),
  -- Top produtos (PDV + Lojinha)
  product_units AS (
    SELECT si.product_name AS name, si.quantity AS qty, si.subtotal AS total
    FROM public.sale_items si
    JOIN sales_in_range s ON s.id = si.sale_id
    UNION ALL
    SELECT li.product_name_snapshot AS name, li.quantity AS qty, (li.quantity * li.unit_price) AS total
    FROM public.lojinha_order_items li
    JOIN lojinha_in_range l ON l.id = li.order_id
  ),
  top_products AS (
    SELECT name, SUM(qty) AS qty, SUM(total) AS total
    FROM product_units GROUP BY name
    ORDER BY total DESC LIMIT 10
  ),
  -- Sangrias do período
  withdrawals AS (
    SELECT id, amount, reason, created_at, created_by_name, authorized_by_name
    FROM public.cash_withdrawals
    WHERE user_id = _owner
      AND created_at >= _from AND created_at < _to
    ORDER BY created_at DESC
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', _from, 'to', _to),
    'totals', (SELECT jsonb_build_object(
        'total', COALESCE(SUM(total), 0),
        'dinheiro', COALESCE(SUM(total) FILTER (WHERE method_bucket='dinheiro'), 0),
        'pix', COALESCE(SUM(total) FILTER (WHERE method_bucket='pix'), 0),
        'debito', COALESCE(SUM(total) FILTER (WHERE method_bucket='debito'), 0),
        'credito', COALESCE(SUM(total) FILTER (WHERE method_bucket='credito'), 0),
        'outros', COALESCE(SUM(total) FILTER (WHERE method_bucket='outros'), 0),
        'n_sales', COUNT(DISTINCT id)
      ) FROM unified_norm),
    'by_method', (SELECT COALESCE(jsonb_agg(jsonb_build_object('method', method_bucket, 'total', total)
                  ORDER BY total DESC), '[]'::jsonb) FROM by_method),
    'by_channel', (SELECT COALESCE(jsonb_agg(jsonb_build_object('channel', channel, 'total', total, 'n_sales', n_sales)
                   ORDER BY total DESC), '[]'::jsonb) FROM by_channel),
    'by_seller', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'seller_user_id', seller_user_id,
                    'seller_name', seller_name,
                    'channels', to_jsonb(channels),
                    'n_sales', n_sales,
                    'total', total,
                    'dinheiro', COALESCE(dinheiro, 0),
                    'pix', COALESCE(pix, 0),
                    'debito', COALESCE(debito, 0),
                    'credito', COALESCE(credito, 0)
                  ) ORDER BY total DESC), '[]'::jsonb) FROM by_seller),
    'top_products', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'total', total)
                     ORDER BY total DESC), '[]'::jsonb) FROM top_products),
    'withdrawals', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', id, 'amount', amount, 'reason', reason,
                      'created_at', created_at, 'created_by_name', created_by_name,
                      'authorized_by_name', authorized_by_name
                    ) ORDER BY created_at DESC), '[]'::jsonb) FROM withdrawals),
    'withdrawals_total', (SELECT COALESCE(SUM(amount), 0) FROM withdrawals)
  )
  INTO _result;

  RETURN _result;
END $$;

GRANT EXECUTE ON FUNCTION public.get_live_dashboard(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_withdrawal_for_session(uuid, numeric, text, text) TO authenticated;
