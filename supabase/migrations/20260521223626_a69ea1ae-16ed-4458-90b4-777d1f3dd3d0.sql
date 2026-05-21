
-- =========================================================
-- 1) Schema: lojinha_orders novos campos
-- =========================================================
ALTER TABLE public.lojinha_orders
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_by uuid,
  ADD COLUMN IF NOT EXISTS reconciled_note text,
  ADD COLUMN IF NOT EXISTS pickup_code text;

CREATE INDEX IF NOT EXISTS idx_lojinha_orders_status_expires
  ON public.lojinha_orders(status, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_lojinha_orders_pickup_code
  ON public.lojinha_orders(pickup_code) WHERE pickup_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lojinha_orders_abandoned
  ON public.lojinha_orders(user_id, created_at)
  WHERE status = 'abandoned';

-- Owner pode UPDATE para conciliar abandonados
DROP POLICY IF EXISTS "lojinha_orders owner update" ON public.lojinha_orders;
CREATE POLICY "lojinha_orders owner update"
ON public.lojinha_orders
FOR UPDATE
USING ((user_id = get_owner_id(auth.uid())) AND is_owner_of(auth.uid(), user_id))
WITH CHECK ((user_id = get_owner_id(auth.uid())) AND is_owner_of(auth.uid(), user_id));

-- =========================================================
-- 2) Helper: gera um pickup_code curto legível (6 chars A-Z2-9)
-- =========================================================
CREATE OR REPLACE FUNCTION public.lojinha_generate_pickup_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  attempts int := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.lojinha_orders WHERE pickup_code = code);
    attempts := attempts + 1;
    IF attempts > 20 THEN EXIT; END IF;
  END LOOP;
  RETURN code;
END;
$$;

-- =========================================================
-- 3) Helper: libera reservas associadas a um pedido
-- =========================================================
CREATE OR REPLACE FUNCTION public.lojinha_release_order_reservations(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  WITH del AS (
    DELETE FROM public.lojinha_stock_reservations
    WHERE cart_token = _order_id::text
    RETURNING product_id, location_id
  ),
  affected AS (
    SELECT DISTINCT product_id, location_id FROM del
  )
  UPDATE public.product_stock ps
  SET lojinha_reserved_qty = COALESCE((
    SELECT SUM(r.quantity) FROM public.lojinha_stock_reservations r
    WHERE r.product_id = ps.product_id
      AND r.location_id = ps.location_id
      AND r.expires_at > now()
  ), 0)
  FROM affected a
  WHERE ps.product_id = a.product_id AND ps.location_id = a.location_id;
END;
$$;

-- =========================================================
-- 4) lojinha_reserve_cart_item — combos + apenas últimos 5
-- =========================================================
CREATE OR REPLACE FUNCTION public.lojinha_reserve_cart_item(
  _slug text, _cart_token text, _product_id uuid, _qty integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.lojinha_settings;
  v_product record;
  v_low boolean := false;
  v_min_remaining int := 9999;
  v_comp record;
  v_other_reserved int;
  v_stock int;
  v_required int;
  v_available_for_us int;
  v_blocked_name text := NULL;
BEGIN
  PERFORM public.lojinha_release_expired_reservations();

  SELECT * INTO s FROM public.lojinha_settings WHERE slug = _slug AND enabled = true;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;

  IF _qty < 0 THEN _qty := 0; END IF;

  SELECT id, name, product_type, track_stock INTO v_product
  FROM public.products
  WHERE id = _product_id AND user_id = s.user_id AND ativo_geral = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto indisponível'; END IF;

  -- Lista de (component_id, qty_each) — para simples é [(id,1)]
  FOR v_comp IN
    SELECT CASE WHEN v_product.product_type = 'combo' THEN ci.component_product_id ELSE v_product.id END AS component_id,
           CASE WHEN v_product.product_type = 'combo' THEN ci.quantity::int ELSE 1 END AS qty_each,
           cp.name AS component_name,
           cp.track_stock AS comp_track
    FROM (SELECT 1) dummy
    LEFT JOIN public.combo_items ci
      ON v_product.product_type = 'combo' AND ci.combo_product_id = v_product.id
    LEFT JOIN public.products cp
      ON cp.id = COALESCE(ci.component_product_id, v_product.id)
    WHERE v_product.product_type <> 'combo' OR ci.id IS NOT NULL
  LOOP
    IF v_comp.comp_track = false THEN
      CONTINUE;
    END IF;

    v_required := _qty * v_comp.qty_each;

    SELECT COALESCE(quantity, 0) INTO v_stock
    FROM public.product_stock
    WHERE product_id = v_comp.component_id AND location_id = s.stock_location_id;
    v_stock := COALESCE(v_stock, 0);

    SELECT COALESCE(SUM(quantity), 0) INTO v_other_reserved
    FROM public.lojinha_stock_reservations
    WHERE product_id = v_comp.component_id
      AND location_id = s.stock_location_id
      AND cart_token <> _cart_token
      AND expires_at > now();

    v_available_for_us := v_stock - v_other_reserved;

    IF v_available_for_us < v_required THEN
      v_blocked_name := v_comp.component_name;
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'sem_estoque',
        'blocked_by', v_blocked_name,
        'available', GREATEST(0, FLOOR(v_available_for_us / NULLIF(v_comp.qty_each,0))::int)
      );
    END IF;

    -- após a nossa reserva, quanto ainda sobra para outros
    IF (v_available_for_us - v_required) / NULLIF(v_comp.qty_each, 0) < v_min_remaining THEN
      v_min_remaining := GREATEST(0, FLOOR((v_available_for_us - v_required) / NULLIF(v_comp.qty_each, 0))::int);
    END IF;

    -- precisa reservar se a quantidade disponível ANTES da nossa retirada já estava em ≤5
    IF v_available_for_us <= 5 THEN
      v_low := true;
    END IF;
  END LOOP;

  -- Apaga reservas anteriores desse cart para esse produto OU seus componentes
  DELETE FROM public.lojinha_stock_reservations
  WHERE cart_token = _cart_token
    AND product_id IN (
      SELECT CASE WHEN v_product.product_type = 'combo' THEN ci.component_product_id ELSE v_product.id END
      FROM (SELECT 1) d
      LEFT JOIN public.combo_items ci ON v_product.product_type='combo' AND ci.combo_product_id = v_product.id
      WHERE v_product.product_type <> 'combo' OR ci.id IS NOT NULL
    );

  -- Se baixo estoque e ainda há qty, cria/refresca reservas por componente
  IF v_low AND _qty > 0 THEN
    INSERT INTO public.lojinha_stock_reservations(user_id, cart_token, product_id, location_id, quantity, expires_at)
    SELECT s.user_id, _cart_token,
           CASE WHEN v_product.product_type='combo' THEN ci.component_product_id ELSE v_product.id END,
           s.stock_location_id,
           _qty * CASE WHEN v_product.product_type='combo' THEN ci.quantity::int ELSE 1 END,
           now() + interval '5 minutes'
    FROM (SELECT 1) d
    LEFT JOIN public.combo_items ci ON v_product.product_type='combo' AND ci.combo_product_id = v_product.id
    LEFT JOIN public.products cp ON cp.id = COALESCE(ci.component_product_id, v_product.id)
    WHERE (v_product.product_type <> 'combo' OR ci.id IS NOT NULL)
      AND COALESCE(cp.track_stock, true) = true;
  END IF;

  -- Recomputa lojinha_reserved_qty agregado dos componentes envolvidos
  UPDATE public.product_stock ps
  SET lojinha_reserved_qty = COALESCE((
    SELECT SUM(r.quantity) FROM public.lojinha_stock_reservations r
    WHERE r.product_id = ps.product_id
      AND r.location_id = ps.location_id
      AND r.expires_at > now()
  ), 0)
  WHERE ps.location_id = s.stock_location_id
    AND ps.product_id IN (
      SELECT CASE WHEN v_product.product_type='combo' THEN ci.component_product_id ELSE v_product.id END
      FROM (SELECT 1) d
      LEFT JOIN public.combo_items ci ON v_product.product_type='combo' AND ci.combo_product_id = v_product.id
      WHERE v_product.product_type <> 'combo' OR ci.id IS NOT NULL
    );

  RETURN jsonb_build_object(
    'ok', true,
    'quantity', _qty,
    'low_stock', v_low,
    'remaining', CASE WHEN v_min_remaining = 9999 THEN NULL ELSE v_min_remaining END
  );
END;
$$;

-- =========================================================
-- 5) lojinha_create_order — agora gera expires_at, pickup_code, e reservas vinculadas
-- =========================================================
CREATE OR REPLACE FUNCTION public.lojinha_create_order(
  _slug text, _cart_token text, _customer_name text, _customer_email text, _customer_phone text, _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.lojinha_settings;
  new_order public.lojinha_orders;
  v_subtotal numeric := 0;
  v_item jsonb;
  v_product record;
  v_qty integer;
  v_code text;
BEGIN
  PERFORM public.lojinha_release_expired_reservations();

  SELECT * INTO s FROM public.lojinha_settings WHERE slug = _slug AND enabled = true;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;

  v_code := public.lojinha_generate_pickup_code();

  INSERT INTO public.lojinha_orders(
    user_id, customer_name, customer_email, customer_phone,
    subtotal, total, status, expires_at, pickup_code, pickup_token
  )
  VALUES (
    s.user_id, _customer_name, _customer_email, _customer_phone,
    0, 0, 'pending', now() + interval '5 minutes', v_code,
    encode(gen_random_bytes(18), 'hex')
  )
  RETURNING * INTO new_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::integer, 1));

    SELECT id, name, COALESCE(online_price, price) AS unit_price,
           ativo_geral, visivel_lojinha_cliente, product_type
      INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND user_id = s.user_id;

    IF NOT FOUND OR NOT v_product.ativo_geral OR NOT v_product.visivel_lojinha_cliente THEN
      RAISE EXCEPTION 'Produto indisponível';
    END IF;

    v_subtotal := v_subtotal + v_product.unit_price * v_qty;

    INSERT INTO public.lojinha_order_items(user_id, order_id, product_id, product_name_snapshot, unit_price, quantity)
    VALUES (s.user_id, new_order.id, v_product.id, v_product.name, v_product.unit_price, v_qty);

    -- Cria reservas a nível de componente vinculadas ao pedido (5 min, expira junto)
    INSERT INTO public.lojinha_stock_reservations(user_id, cart_token, product_id, location_id, quantity, expires_at)
    SELECT s.user_id, new_order.id::text,
           CASE WHEN v_product.product_type='combo' THEN ci.component_product_id ELSE v_product.id END,
           s.stock_location_id,
           v_qty * CASE WHEN v_product.product_type='combo' THEN ci.quantity::int ELSE 1 END,
           new_order.expires_at
    FROM (SELECT 1) d
    LEFT JOIN public.combo_items ci ON v_product.product_type='combo' AND ci.combo_product_id = v_product.id
    LEFT JOIN public.products cp ON cp.id = COALESCE(ci.component_product_id, v_product.id)
    WHERE (v_product.product_type <> 'combo' OR ci.id IS NOT NULL)
      AND COALESCE(cp.track_stock, true) = true;
  END LOOP;

  UPDATE public.lojinha_orders SET subtotal = v_subtotal, total = v_subtotal WHERE id = new_order.id;

  -- Limpa reservas do cart_token original (usuário pode ter ainda outras antigas)
  DELETE FROM public.lojinha_stock_reservations WHERE cart_token = _cart_token;

  -- Recomputa agregados de todos produtos envolvidos
  UPDATE public.product_stock ps
  SET lojinha_reserved_qty = COALESCE((
    SELECT SUM(r.quantity) FROM public.lojinha_stock_reservations r
    WHERE r.product_id = ps.product_id AND r.location_id = ps.location_id AND r.expires_at > now()
  ), 0)
  WHERE ps.location_id = s.stock_location_id;

  RETURN jsonb_build_object('order_id', new_order.id, 'total', v_subtotal);
END;
$$;

-- =========================================================
-- 6) lojinha_create_pos_order — mesma lógica
-- =========================================================
CREATE OR REPLACE FUNCTION public.lojinha_create_pos_order(
  _items jsonb, _payment_method text, _device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid := get_owner_id(auth.uid());
  v_role text;
  v_can_sell boolean;
  v_methods text[];
  v_seller_name text;
  v_order_id uuid := gen_random_uuid();
  v_subtotal numeric := 0;
  v_item jsonb;
  v_product record;
  v_unit_price numeric;
  v_qty integer;
  v_location uuid;
  v_code text;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  PERFORM public.lojinha_release_expired_reservations();

  SELECT role, lojinha_can_sell, lojinha_payment_methods, display_name
    INTO v_role, v_can_sell, v_methods, v_seller_name
  FROM user_roles
  WHERE user_id = auth.uid() AND owner_id = v_owner
  LIMIT 1;

  IF v_role <> 'owner' AND NOT COALESCE(v_can_sell, false) THEN
    RAISE EXCEPTION 'no_permission';
  END IF;

  IF v_role <> 'owner'
     AND v_methods IS NOT NULL
     AND array_length(v_methods, 1) > 0
     AND NOT (_payment_method = ANY(v_methods)) THEN
    RAISE EXCEPTION 'payment_method_not_allowed';
  END IF;

  SELECT stock_location_id INTO v_location FROM lojinha_settings WHERE user_id = v_owner LIMIT 1;
  IF v_location IS NULL THEN
    SELECT id INTO v_location FROM stock_locations
    WHERE user_id = v_owner ORDER BY is_default DESC, created_at LIMIT 1;
  END IF;

  v_code := public.lojinha_generate_pickup_code();

  INSERT INTO lojinha_orders (
    id, user_id, customer_name, status, channel,
    seller_user_id, seller_name, point_device_id, subtotal, total,
    expires_at, pickup_code, pickup_token
  ) VALUES (
    v_order_id, v_owner, COALESCE(v_seller_name, 'Balcão'), 'pending', 'pos',
    auth.uid(), v_seller_name, _device_id, 0, 0,
    now() + interval '5 minutes', v_code, encode(gen_random_bytes(18), 'hex')
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::integer, 1));

    SELECT id, name, COALESCE(online_price, price) AS unit_price, ativo_geral,
           visivel_mobile_garcom, product_type
      INTO v_product
    FROM products
    WHERE id = (v_item->>'product_id')::uuid AND user_id = v_owner;

    IF NOT FOUND OR NOT v_product.ativo_geral OR NOT v_product.visivel_mobile_garcom THEN
      RAISE EXCEPTION 'product_unavailable';
    END IF;

    v_unit_price := v_product.unit_price;
    v_subtotal := v_subtotal + v_unit_price * v_qty;

    INSERT INTO lojinha_order_items (
      user_id, order_id, product_id, product_name_snapshot, unit_price, quantity
    ) VALUES (
      v_owner, v_order_id, v_product.id, v_product.name, v_unit_price, v_qty
    );

    INSERT INTO public.lojinha_stock_reservations(user_id, cart_token, product_id, location_id, quantity, expires_at)
    SELECT v_owner, v_order_id::text,
           CASE WHEN v_product.product_type='combo' THEN ci.component_product_id ELSE v_product.id END,
           v_location,
           v_qty * CASE WHEN v_product.product_type='combo' THEN ci.quantity::int ELSE 1 END,
           now() + interval '5 minutes'
    FROM (SELECT 1) d
    LEFT JOIN public.combo_items ci ON v_product.product_type='combo' AND ci.combo_product_id = v_product.id
    LEFT JOIN public.products cp ON cp.id = COALESCE(ci.component_product_id, v_product.id)
    WHERE (v_product.product_type <> 'combo' OR ci.id IS NOT NULL)
      AND COALESCE(cp.track_stock, true) = true;
  END LOOP;

  UPDATE lojinha_orders SET subtotal = v_subtotal, total = v_subtotal WHERE id = v_order_id;

  -- Atualiza agregado
  UPDATE public.product_stock ps
  SET lojinha_reserved_qty = COALESCE((
    SELECT SUM(r.quantity) FROM public.lojinha_stock_reservations r
    WHERE r.product_id = ps.product_id AND r.location_id = ps.location_id AND r.expires_at > now()
  ), 0)
  WHERE ps.location_id = v_location;

  RETURN jsonb_build_object('order_id', v_order_id, 'total', v_subtotal);
END;
$$;

-- =========================================================
-- 7) mark_pos_paid — limpa reservas (estoque será consumido na entrega)
-- =========================================================
CREATE OR REPLACE FUNCTION public.lojinha_mark_pos_paid(_order_id uuid, _payment_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid := get_owner_id(auth.uid());
BEGIN
  UPDATE lojinha_orders
  SET status = 'paid', paid_at = now(), mp_payment_id = _payment_id, expires_at = NULL
  WHERE id = _order_id AND user_id = v_owner AND channel = 'pos' AND status = 'pending';

  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_pending'; END IF;

  -- Mantém as reservas até a entrega (estoque continua bloqueado)
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- =========================================================
-- 8) Cron: expira pendentes em 'abandoned' + libera + limpa 7d
-- =========================================================
CREATE OR REPLACE FUNCTION public.expire_pending_lojinha_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.lojinha_release_expired_reservations();

  FOR v_id IN
    SELECT id FROM public.lojinha_orders
    WHERE status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < now()
  LOOP
    UPDATE public.lojinha_orders
    SET status = 'abandoned', cancelled_at = now()
    WHERE id = v_id;
    PERFORM public.lojinha_release_order_reservations(v_id);
  END LOOP;

  -- Limpeza: deleta abandonados com mais de 7 dias
  DELETE FROM public.lojinha_order_items
  WHERE order_id IN (
    SELECT id FROM public.lojinha_orders
    WHERE status = 'abandoned' AND created_at < now() - interval '7 days'
  );
  DELETE FROM public.lojinha_order_units
  WHERE order_id IN (
    SELECT id FROM public.lojinha_orders
    WHERE status = 'abandoned' AND created_at < now() - interval '7 days'
  );
  DELETE FROM public.lojinha_orders
  WHERE status = 'abandoned' AND created_at < now() - interval '7 days';
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-pending-lojinha-orders') THEN
    PERFORM cron.unschedule('expire-pending-lojinha-orders');
  END IF;
  PERFORM cron.schedule(
    'expire-pending-lojinha-orders',
    '* * * * *',
    $cron$ SELECT public.expire_pending_lojinha_orders(); $cron$
  );
END $$;

-- =========================================================
-- 9) lojinha_validate_qr — aceita pickup_code curto
-- =========================================================
CREATE OR REPLACE FUNCTION public.lojinha_validate_qr(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o public.lojinha_orders;
  u public.lojinha_order_units;
  caller_name text;
  units_count int;
  v_token text := upper(trim(_token));
BEGIN
  -- 1) Tenta como pickup_token
  SELECT * INTO o FROM public.lojinha_orders WHERE pickup_token = _token FOR UPDATE;

  -- 1b) Tenta como pickup_code curto
  IF o.id IS NULL THEN
    SELECT * INTO o FROM public.lojinha_orders WHERE pickup_code = v_token FOR UPDATE;
  END IF;

  IF o.id IS NOT NULL THEN
    IF NOT has_permission(auth.uid(), o.user_id, 'lojinha') THEN
      RAISE EXCEPTION 'Sem permissão';
    END IF;

    IF o.status = 'delivered' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_delivered',
        'customer_name', o.customer_name, 'delivered_at', o.delivered_at);
    END IF;

    IF o.status <> 'paid' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_paid', 'customer_name', o.customer_name);
    END IF;

    SELECT display_name INTO caller_name FROM public.user_roles
      WHERE user_id = auth.uid() AND owner_id = o.user_id LIMIT 1;

    UPDATE public.lojinha_order_units
      SET status = 'delivered', delivered_at = now(),
          delivered_by = auth.uid(), delivered_by_name = caller_name
      WHERE order_id = o.id AND status <> 'delivered';

    SELECT count(*) INTO units_count FROM public.lojinha_order_units WHERE order_id = o.id;

    UPDATE public.lojinha_orders
      SET status = 'delivered', delivered_at = now(),
          pickup_token = NULL, pickup_code = NULL
      WHERE id = o.id;

    PERFORM public.lojinha_release_order_reservations(o.id);

    RETURN jsonb_build_object('ok', true,
      'customer_name', o.customer_name,
      'product_name', COALESCE(units_count, 0)::text || ' itens',
      'order_total', o.total);
  END IF;

  -- 2) Fallback unidade
  SELECT * INTO u FROM public.lojinha_order_units WHERE qr_token = _token FOR UPDATE;
  IF u.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF NOT has_permission(auth.uid(), u.user_id, 'lojinha') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO o FROM public.lojinha_orders WHERE id = u.order_id;

  IF u.status = 'delivered' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_delivered',
      'product_name', u.product_name_snapshot,
      'customer_name', o.customer_name, 'delivered_at', u.delivered_at);
  END IF;

  SELECT display_name INTO caller_name FROM public.user_roles
    WHERE user_id = auth.uid() AND owner_id = u.user_id LIMIT 1;

  UPDATE public.lojinha_order_units
    SET status = 'delivered', delivered_at = now(),
        delivered_by = auth.uid(), delivered_by_name = caller_name
    WHERE id = u.id;

  IF NOT EXISTS (SELECT 1 FROM public.lojinha_order_units WHERE order_id = o.id AND status <> 'delivered') THEN
    UPDATE public.lojinha_orders SET status = 'delivered', delivered_at = now(),
      pickup_token = NULL, pickup_code = NULL WHERE id = o.id;
    PERFORM public.lojinha_release_order_reservations(o.id);
  END IF;

  RETURN jsonb_build_object('ok', true,
    'product_name', u.product_name_snapshot,
    'customer_name', o.customer_name);
END;
$$;

-- =========================================================
-- 10) Fix accent_color inválido
-- =========================================================
UPDATE public.lojinha_settings
SET accent_color = '#e94560'
WHERE accent_color IS NULL
   OR accent_color !~ '^#[0-9a-fA-F]{6}$';
