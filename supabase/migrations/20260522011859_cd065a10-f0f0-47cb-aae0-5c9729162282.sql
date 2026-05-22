-- 1) Backfill: pendentes antigos sem expires_at
UPDATE public.lojinha_orders
SET expires_at = created_at + interval '10 minutes'
WHERE status = 'pending' AND expires_at IS NULL;

-- 2) Trocar 5 min -> 10 min nas funcoes de criacao
CREATE OR REPLACE FUNCTION public.lojinha_create_pending_order(
  _customer_name text,
  _customer_phone text,
  _customer_email text,
  _cart_token text,
  _items jsonb
)
RETURNS TABLE (id uuid, total numeric, pickup_token text, pickup_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_order public.lojinha_orders%ROWTYPE;
  v_settings public.lojinha_settings%ROWTYPE;
  v_total numeric := 0;
  v_subtotal numeric := 0;
  v_item record;
  v_product public.products%ROWTYPE;
  v_unit_price numeric;
  v_code text;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_no int;
BEGIN
  PERFORM public.lojinha_release_expired_reservations();

  SELECT * INTO v_settings FROM public.lojinha_settings WHERE cart_token_owner(_cart_token) = user_id LIMIT 1;
  IF v_settings.id IS NULL THEN
    SELECT * INTO v_settings FROM public.lojinha_settings WHERE enabled = true LIMIT 1;
  END IF;
  IF v_settings.id IS NULL THEN RAISE EXCEPTION 'Loja indisponivel'; END IF;

  v_code := lpad((floor(random() * 1000000))::text, 6, '0');

  INSERT INTO public.daily_order_counter(user_id, daily_date, last_number)
  VALUES (v_settings.user_id, v_today, 1)
  ON CONFLICT (user_id, daily_date) DO UPDATE SET last_number = daily_order_counter.last_number + 1
  RETURNING last_number INTO v_no;

  INSERT INTO public.lojinha_orders(
    user_id, customer_name, customer_phone, customer_email, channel,
    subtotal, total, status, expires_at, pickup_code, pickup_token,
    daily_date, daily_number
  ) VALUES (
    v_settings.user_id, _customer_name, _customer_phone, _customer_email, 'online',
    0, 0, 'pending', now() + interval '10 minutes', v_code,
    encode(extensions.gen_random_bytes(18), 'hex'),
    v_today, v_no
  ) RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(_items) AS x(product_id uuid, quantity int) LOOP
    SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
    IF v_product.id IS NULL THEN RAISE EXCEPTION 'Produto nao encontrado'; END IF;
    v_unit_price := COALESCE(v_product.online_price, v_product.price);

    INSERT INTO public.lojinha_order_items(user_id, order_id, product_id, product_name_snapshot, quantity, unit_price)
    VALUES (v_settings.user_id, v_order.id, v_product.id, v_product.name, v_item.quantity, v_unit_price);

    INSERT INTO public.lojinha_stock_reservations(user_id, cart_token, product_id, location_id, quantity, expires_at)
    SELECT v_settings.user_id, _cart_token, v_product.id, v_settings.stock_location_id, v_item.quantity,
           v_order.expires_at;

    v_subtotal := v_subtotal + v_unit_price * v_item.quantity;
  END LOOP;

  v_total := v_subtotal;
  UPDATE public.lojinha_orders SET subtotal = v_subtotal, total = v_total WHERE id = v_order.id;

  RETURN QUERY SELECT v_order.id, v_total, v_order.pickup_token, v_order.pickup_code;
END $$;

-- 3) Atualizar lojinha_create_pos_order para 10 min tambem
CREATE OR REPLACE FUNCTION public.lojinha_create_pos_order(
  _customer_name text,
  _items jsonb,
  _seller_name text DEFAULT NULL
)
RETURNS TABLE (id uuid, total numeric, pickup_token text, pickup_code text, daily_number int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_owner uuid;
  v_order public.lojinha_orders%ROWTYPE;
  v_settings public.lojinha_settings%ROWTYPE;
  v_total numeric := 0;
  v_subtotal numeric := 0;
  v_item record;
  v_product public.products%ROWTYPE;
  v_unit_price numeric;
  v_code text;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_no int;
BEGIN
  v_owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), v_owner, 'vendas') THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;

  SELECT * INTO v_settings FROM public.lojinha_settings WHERE user_id = v_owner LIMIT 1;

  v_code := lpad((floor(random() * 1000000))::text, 6, '0');

  INSERT INTO public.daily_order_counter(user_id, daily_date, last_number)
  VALUES (v_owner, v_today, 1)
  ON CONFLICT (user_id, daily_date) DO UPDATE SET last_number = daily_order_counter.last_number + 1
  RETURNING last_number INTO v_no;

  INSERT INTO public.lojinha_orders(
    user_id, customer_name, channel, subtotal, total, status,
    seller_user_id, seller_name,
    expires_at, pickup_code, pickup_token,
    daily_date, daily_number
  ) VALUES (
    v_owner, COALESCE(_customer_name, 'Balcao'), 'pos', 0, 0, 'pending',
    auth.uid(), _seller_name,
    now() + interval '10 minutes', v_code, encode(extensions.gen_random_bytes(18), 'hex'),
    v_today, v_no
  ) RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(_items) AS x(product_id uuid, quantity int) LOOP
    SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
    IF v_product.id IS NULL THEN RAISE EXCEPTION 'Produto nao encontrado'; END IF;
    v_unit_price := COALESCE(v_product.online_price, v_product.price);

    INSERT INTO public.lojinha_order_items(user_id, order_id, product_id, product_name_snapshot, quantity, unit_price)
    VALUES (v_owner, v_order.id, v_product.id, v_product.name, v_item.quantity, v_unit_price);

    IF v_settings.stock_location_id IS NOT NULL THEN
      INSERT INTO public.lojinha_stock_reservations(user_id, cart_token, product_id, location_id, quantity, expires_at)
      VALUES (v_owner, 'pos:' || v_order.id::text, v_product.id, v_settings.stock_location_id, v_item.quantity,
              now() + interval '10 minutes');
    END IF;

    v_subtotal := v_subtotal + v_unit_price * v_item.quantity;
  END LOOP;

  v_total := v_subtotal;
  UPDATE public.lojinha_orders SET subtotal = v_subtotal, total = v_total WHERE id = v_order.id;

  RETURN QUERY SELECT v_order.id, v_total, v_order.pickup_token, v_order.pickup_code, v_order.daily_number;
END $$;

-- 4) Funcao para abandonar pedido manualmente (funcionario aperta "cliente abandonou")
CREATE OR REPLACE FUNCTION public.abandon_lojinha_order(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_order public.lojinha_orders%ROWTYPE;
BEGIN
  v_owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), v_owner, 'vendas') THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;

  SELECT * INTO v_order FROM public.lojinha_orders WHERE id = _order_id AND user_id = v_owner;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido nao encontrado'; END IF;
  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Pedido ja nao esta pendente');
  END IF;

  UPDATE public.lojinha_orders
  SET status = 'abandoned', cancelled_at = now()
  WHERE id = _order_id;

  PERFORM public.lojinha_release_order_reservations(_order_id);

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.abandon_lojinha_order(uuid) TO authenticated;

-- 5) Colunas de estorno/cancelamento em lojinha_orders
ALTER TABLE public.lojinha_orders
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_amount numeric,
  ADD COLUMN IF NOT EXISTS refunded_by uuid,
  ADD COLUMN IF NOT EXISTS refunded_by_name text,
  ADD COLUMN IF NOT EXISTS refunded_reason text,
  ADD COLUMN IF NOT EXISTS mp_refund_id text;

-- 6) Colunas idem em sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_by_name text,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';

-- 7) Funcao para cancelar venda local (dinheiro / cartao fisico)
CREATE OR REPLACE FUNCTION public.cancel_local_sale(_sale_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_sale public.sales%ROWTYPE;
  v_name text;
BEGIN
  v_owner := public.get_owner_id(auth.uid());
  IF NOT public.is_owner_of(auth.uid(), v_owner) THEN
    RAISE EXCEPTION 'Apenas o dono pode cancelar vendas';
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id AND user_id = v_owner;
  IF v_sale.id IS NULL THEN RAISE EXCEPTION 'Venda nao encontrada'; END IF;
  IF v_sale.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Venda ja cancelada');
  END IF;

  SELECT COALESCE(display_name, email) INTO v_name
  FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  UPDATE public.sales
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancelled_by_name = v_name,
      cancelled_reason = _reason
  WHERE id = _sale_id;

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_local_sale(uuid, text) TO authenticated;

-- 8) Atualizar view unificada: excluir estornadas/canceladas
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
  COALESCE(s.status, 'completed')::text AS status
FROM public.sales s
WHERE COALESCE(s.status, 'completed') <> 'cancelled'
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