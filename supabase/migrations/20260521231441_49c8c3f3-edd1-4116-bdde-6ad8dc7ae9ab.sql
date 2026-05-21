-- Hotfix: usar extensions.gen_random_bytes nas RPCs da lojinha

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
    encode(extensions.gen_random_bytes(18), 'hex')
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

  DELETE FROM public.lojinha_stock_reservations WHERE cart_token = _cart_token;

  UPDATE public.product_stock ps
  SET lojinha_reserved_qty = COALESCE((
    SELECT SUM(r.quantity) FROM public.lojinha_stock_reservations r
    WHERE r.product_id = ps.product_id AND r.location_id = ps.location_id AND r.expires_at > now()
  ), 0)
  WHERE ps.location_id = s.stock_location_id;

  RETURN jsonb_build_object('order_id', new_order.id, 'total', v_subtotal);
END;
$$;


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
    now() + interval '5 minutes', v_code, encode(extensions.gen_random_bytes(18), 'hex')
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

  UPDATE public.product_stock ps
  SET lojinha_reserved_qty = COALESCE((
    SELECT SUM(r.quantity) FROM public.lojinha_stock_reservations r
    WHERE r.product_id = ps.product_id AND r.location_id = ps.location_id AND r.expires_at > now()
  ), 0)
  WHERE ps.location_id = v_location;

  RETURN jsonb_build_object('order_id', v_order_id, 'total', v_subtotal);
END;
$$;