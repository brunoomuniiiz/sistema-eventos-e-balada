
-- 1. Garantir que quem tem 'lojinha' tambem tenha 'vendas' (transicao)
UPDATE public.user_roles
SET permissions = (
  SELECT array_agg(DISTINCT p) FROM unnest(permissions || ARRAY['vendas']::text[]) p
)
WHERE 'lojinha' = ANY(permissions) AND NOT ('vendas' = ANY(permissions));

-- 2. Atualizar politicas das tabelas lojinha_* para aceitar vendas tambem
DROP POLICY IF EXISTS "lojinha_orders staff view" ON public.lojinha_orders;
CREATE POLICY "lojinha_orders staff view"
ON public.lojinha_orders FOR SELECT
USING (
  user_id = get_owner_id(auth.uid())
  AND (has_permission(auth.uid(), user_id, 'lojinha') OR has_permission(auth.uid(), user_id, 'vendas'))
);

DROP POLICY IF EXISTS "lojinha_order_items staff view" ON public.lojinha_order_items;
CREATE POLICY "lojinha_order_items staff view"
ON public.lojinha_order_items FOR SELECT
USING (
  user_id = get_owner_id(auth.uid())
  AND (has_permission(auth.uid(), user_id, 'lojinha') OR has_permission(auth.uid(), user_id, 'vendas'))
);

DROP POLICY IF EXISTS "lojinha_order_units staff view" ON public.lojinha_order_units;
CREATE POLICY "lojinha_order_units staff view"
ON public.lojinha_order_units FOR SELECT
USING (
  user_id = get_owner_id(auth.uid())
  AND (has_permission(auth.uid(), user_id, 'lojinha') OR has_permission(auth.uid(), user_id, 'vendas'))
);

DROP POLICY IF EXISTS "lojinha_point_devices staff view" ON public.lojinha_point_devices;
CREATE POLICY "lojinha_point_devices staff view"
ON public.lojinha_point_devices FOR SELECT
USING (
  user_id = get_owner_id(auth.uid())
  AND (has_permission(auth.uid(), user_id, 'lojinha') OR has_permission(auth.uid(), user_id, 'vendas'))
);

DROP POLICY IF EXISTS "lojinha_settings staff view" ON public.lojinha_settings;
CREATE POLICY "lojinha_settings staff view"
ON public.lojinha_settings FOR SELECT
USING (
  user_id = get_owner_id(auth.uid())
  AND (has_permission(auth.uid(), user_id, 'lojinha') OR has_permission(auth.uid(), user_id, 'vendas'))
);

-- products precisa estar visivel pra quem so tem vendas (ja esta), garantir combo_items tambem
DROP POLICY IF EXISTS "View combo_items" ON public.combo_items;
CREATE POLICY "View combo_items"
ON public.combo_items FOR SELECT
USING (
  user_id = get_owner_id(auth.uid())
  AND (
    has_permission(auth.uid(), user_id, 'estoque')
    OR has_permission(auth.uid(), user_id, 'vendas')
    OR has_permission(auth.uid(), user_id, 'lojinha')
  )
);

-- 3. Atualizar open_cash_session para exigir grant token
CREATE OR REPLACE FUNCTION public.open_cash_session(
  _opening numeric,
  _notes text DEFAULT NULL,
  _event_id uuid DEFAULT NULL,
  _grant_token text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid;
  _name text;
  _existing uuid;
  _id uuid;
  _grant record;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), _owner, 'vendas') THEN
    RAISE EXCEPTION 'Sem permissão de vendas';
  END IF;

  -- Exige autorizacao do owner/gerente
  IF _grant_token IS NULL THEN
    RAISE EXCEPTION 'Autorização do gerente é obrigatória para abrir o caixa';
  END IF;

  SELECT * INTO _grant FROM public.auth_grants
  WHERE token = _grant_token
    AND scope = 'open_cash'
    AND user_id = auth.uid()
    AND used = false
    AND expires_at > now()
  LIMIT 1;

  IF _grant.id IS NULL THEN
    RAISE EXCEPTION 'Token de autorização inválido ou expirado';
  END IF;

  UPDATE public.auth_grants SET used = true WHERE id = _grant.id;

  SELECT id INTO _existing FROM public.cash_sessions
  WHERE opened_by = auth.uid() AND status = 'open' LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT COALESCE(display_name, email) INTO _name
  FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.cash_sessions (user_id, opened_by, opened_by_name, opening_amount, opening_notes, event_id)
  VALUES (_owner, auth.uid(), _name, COALESCE(_opening, 0), _notes, _event_id)
  RETURNING id INTO _id;
  RETURN _id;
END $function$;

-- 4. View unificada de historico (vendas presenciais + pedidos online)
CREATE OR REPLACE VIEW public.unified_sales_history
WITH (security_invoker = true)
AS
SELECT
  s.id,
  s.user_id AS owner_id,
  'presencial'::text AS channel,
  s.daily_number,
  s.employee_id AS seller_user_id,
  s.employee_name AS seller_name,
  NULL::uuid AS delivered_by,
  NULL::text AS delivered_by_name,
  NULL::text AS customer_name,
  s.total,
  s.payment_method,
  s.category,
  s.created_at,
  NULL::timestamptz AS delivered_at,
  'completed'::text AS status
FROM public.sales s
UNION ALL
SELECT
  o.id,
  o.user_id AS owner_id,
  o.channel::text AS channel,
  o.daily_number,
  o.seller_user_id,
  COALESCE(o.seller_name, 'Online') AS seller_name,
  (SELECT u.delivered_by FROM public.lojinha_order_units u WHERE u.order_id = o.id AND u.delivered_by IS NOT NULL LIMIT 1) AS delivered_by,
  (SELECT u.delivered_by_name FROM public.lojinha_order_units u WHERE u.order_id = o.id AND u.delivered_by_name IS NOT NULL LIMIT 1) AS delivered_by_name,
  o.customer_name,
  o.total,
  CASE WHEN o.channel = 'online' THEN 'pix-online' ELSE 'maquininha' END AS payment_method,
  'lojinha'::text AS category,
  COALESCE(o.paid_at, o.created_at) AS created_at,
  o.delivered_at,
  o.status
FROM public.lojinha_orders o
WHERE o.status IN ('paid', 'delivered');

-- Permitir leitura via RPC com filtro de permissao
CREATE OR REPLACE FUNCTION public.list_unified_sales_history(
  _limit int DEFAULT 200,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _seller_user_id uuid DEFAULT NULL,
  _channel text DEFAULT NULL
)
RETURNS SETOF public.unified_sales_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _owner uuid;
  _is_manager boolean;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), _owner, 'vendas') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  -- Owner ou financeiro = ve tudo; senao so o proprio
  _is_manager := public.is_owner_of(auth.uid(), _owner)
              OR public.has_permission(auth.uid(), _owner, 'financeiro');

  RETURN QUERY
  SELECT * FROM public.unified_sales_history h
  WHERE h.owner_id = _owner
    AND (_from IS NULL OR h.created_at >= _from)
    AND (_to IS NULL OR h.created_at <= _to)
    AND (_channel IS NULL OR h.channel = _channel)
    AND (
      _is_manager
      OR h.seller_user_id = auth.uid()
      OR h.delivered_by = auth.uid()
    )
    AND (_seller_user_id IS NULL OR h.seller_user_id = _seller_user_id OR h.delivered_by = _seller_user_id)
  ORDER BY h.created_at DESC
  LIMIT GREATEST(_limit, 1);
END $$;

GRANT EXECUTE ON FUNCTION public.list_unified_sales_history(int, timestamptz, timestamptz, uuid, text) TO authenticated;
