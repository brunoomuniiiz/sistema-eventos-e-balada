
-- =========================================================
-- Lojinha online: detectar pedido pendente do mesmo cliente
-- + abandono imediato pelo cliente (delete, não vai p/ abandonados)
-- + bumpar expires_at do create_order para 10 minutos
-- =========================================================

-- 1) Bump expires_at para 10 min (consistência com PDV)
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
    0, 0, 'pending', now() + interval '10 minutes', v_code,
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

GRANT EXECUTE ON FUNCTION public.lojinha_create_order(text, text, text, text, text, jsonb) TO anon, authenticated;

-- 2) Localizar pedido pendente do cliente (por telefone normalizado) na mesma loja
CREATE OR REPLACE FUNCTION public.lojinha_find_pending_for_customer(
  _slug text, _customer_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.lojinha_settings;
  o public.lojinha_orders;
  v_phone text;
BEGIN
  IF _customer_phone IS NULL OR length(trim(_customer_phone)) < 6 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_phone := regexp_replace(_customer_phone, '[^0-9]', '', 'g');

  SELECT * INTO s FROM public.lojinha_settings WHERE slug = _slug AND enabled = true;
  IF s.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO o
  FROM public.lojinha_orders
  WHERE user_id = s.user_id
    AND channel = 'online'
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
    AND regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g') = v_phone
  ORDER BY created_at DESC
  LIMIT 1;

  IF o.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'order_id', o.id,
    'total', o.total,
    'expires_at', o.expires_at,
    'created_at', o.created_at,
    'customer_name', o.customer_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lojinha_find_pending_for_customer(text, text) TO anon, authenticated;

-- 3) Cliente abandona pedido na hora → DELETA (não vai para "abandonados")
-- Autorização: precisa bater telefone (normalizado) do pedido.
CREATE OR REPLACE FUNCTION public.lojinha_customer_abandon_order(
  _order_id uuid, _customer_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o public.lojinha_orders;
  v_phone text;
BEGIN
  IF _customer_phone IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_required');
  END IF;

  v_phone := regexp_replace(_customer_phone, '[^0-9]', '', 'g');

  SELECT * INTO o FROM public.lojinha_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF o.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending');
  END IF;

  IF regexp_replace(COALESCE(o.customer_phone, ''), '[^0-9]', '', 'g') <> v_phone THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_mismatch');
  END IF;

  -- libera reservas vinculadas
  PERFORM public.lojinha_release_order_reservations(o.id);

  -- DELETE total
  DELETE FROM public.lojinha_order_items WHERE order_id = o.id;
  DELETE FROM public.lojinha_order_units WHERE order_id = o.id;
  DELETE FROM public.pix_charges WHERE order_id = o.id;
  DELETE FROM public.lojinha_orders WHERE id = o.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lojinha_customer_abandon_order(uuid, text) TO anon, authenticated;
