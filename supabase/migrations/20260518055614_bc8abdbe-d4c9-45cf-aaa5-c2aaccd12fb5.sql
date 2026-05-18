
-- ========= Alterações em tabelas existentes =========
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sell_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_price numeric;

ALTER TABLE public.product_stock
  ADD COLUMN IF NOT EXISTS lojinha_reserved_qty integer NOT NULL DEFAULT 0;

-- ========= lojinha_settings =========
CREATE TABLE public.lojinha_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  slug text UNIQUE,
  store_name text,
  stock_location_id uuid,
  pickup_message text DEFAULT 'Retire no balcão apresentando o QR code.',
  accent_color text DEFAULT '#e94560',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lojinha_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lojinha_settings owner all" ON public.lojinha_settings
  FOR ALL USING (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id))
  WITH CHECK (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));

CREATE POLICY "lojinha_settings staff view" ON public.lojinha_settings
  FOR SELECT USING (user_id = get_owner_id(auth.uid()) AND has_permission(auth.uid(), user_id, 'lojinha'));

-- Leitura pública pelo slug (vitrine) — feita via RPC SECURITY DEFINER abaixo
CREATE POLICY "lojinha_settings public by slug" ON public.lojinha_settings
  FOR SELECT USING (enabled = true);

-- ========= lojinha_orders =========
CREATE TABLE public.lojinha_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  subtotal numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending', -- pending|paid|delivered|cancelled|refunded
  mp_preference_id text,
  mp_payment_id text,
  init_point text,
  paid_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lojinha_orders_user_status_idx ON public.lojinha_orders (user_id, status, created_at DESC);

ALTER TABLE public.lojinha_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lojinha_orders staff view" ON public.lojinha_orders
  FOR SELECT USING (user_id = get_owner_id(auth.uid()) AND has_permission(auth.uid(), user_id, 'lojinha'));

-- (inserts/updates via RPC SECURITY DEFINER ou supabaseAdmin)

-- ========= lojinha_order_items =========
CREATE TABLE public.lojinha_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.lojinha_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  product_name_snapshot text NOT NULL,
  unit_price numeric NOT NULL,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lojinha_order_items_order_idx ON public.lojinha_order_items (order_id);

ALTER TABLE public.lojinha_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lojinha_order_items staff view" ON public.lojinha_order_items
  FOR SELECT USING (user_id = get_owner_id(auth.uid()) AND has_permission(auth.uid(), user_id, 'lojinha'));

-- ========= lojinha_order_units =========
CREATE TABLE public.lojinha_order_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.lojinha_orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.lojinha_order_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  product_name_snapshot text NOT NULL,
  qr_token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'valid', -- valid|delivered|cancelled
  delivered_at timestamptz,
  delivered_by uuid,
  delivered_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lojinha_order_units_order_idx ON public.lojinha_order_units (order_id);
CREATE INDEX lojinha_order_units_token_idx ON public.lojinha_order_units (qr_token);

ALTER TABLE public.lojinha_order_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lojinha_order_units staff view" ON public.lojinha_order_units
  FOR SELECT USING (user_id = get_owner_id(auth.uid()) AND has_permission(auth.uid(), user_id, 'lojinha'));

-- ========= lojinha_stock_reservations =========
CREATE TABLE public.lojinha_stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cart_token text NOT NULL,
  product_id uuid NOT NULL,
  location_id uuid NOT NULL,
  quantity integer NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lojinha_reservations_expires_idx ON public.lojinha_stock_reservations (expires_at);
CREATE INDEX lojinha_reservations_cart_idx ON public.lojinha_stock_reservations (cart_token);

ALTER TABLE public.lojinha_stock_reservations ENABLE ROW LEVEL SECURITY;
-- Acesso apenas via RPC

-- ========= update_updated_at triggers =========
CREATE TRIGGER lojinha_settings_set_updated_at BEFORE UPDATE ON public.lojinha_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER lojinha_orders_set_updated_at BEFORE UPDATE ON public.lojinha_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========= RPCs =========

-- Libera reservas expiradas (usada por triggers lazy)
CREATE OR REPLACE FUNCTION public.lojinha_release_expired_reservations()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  WITH expired AS (
    DELETE FROM public.lojinha_stock_reservations
    WHERE expires_at < now()
    RETURNING product_id, user_id, quantity, location_id
  )
  UPDATE public.product_stock ps
  SET lojinha_reserved_qty = GREATEST(0, ps.lojinha_reserved_qty - e.total_qty)
  FROM (
    SELECT product_id, location_id, SUM(quantity) AS total_qty
    FROM expired
    GROUP BY product_id, location_id
  ) e
  WHERE ps.product_id = e.product_id AND ps.location_id = e.location_id;
END;
$$;

-- Vitrine pública: dados da loja + produtos disponíveis
CREATE OR REPLACE FUNCTION public.lojinha_get_storefront(_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
  s public.lojinha_settings;
  products_json jsonb;
BEGIN
  SELECT * INTO s FROM public.lojinha_settings WHERE slug = _slug AND enabled = true;
  IF s.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description', p.description,
    'photo_url', p.photo_url,
    'price', COALESCE(p.online_price, p.price),
    'unit', p.unit,
    'category_id', p.category_id,
    'available_qty', GREATEST(0, COALESCE(ps.quantity, 0) - COALESCE(ps.lojinha_reserved_qty, 0))
  ))
  INTO products_json
  FROM public.products p
  LEFT JOIN public.product_stock ps
    ON ps.product_id = p.id AND ps.location_id = s.stock_location_id
  WHERE p.user_id = s.user_id
    AND p.sell_online = true
    AND p.is_available = true;

  RETURN jsonb_build_object(
    'settings', to_jsonb(s),
    'products', COALESCE(products_json, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lojinha_get_storefront(text) TO anon, authenticated;

-- Reservar item (público)
CREATE OR REPLACE FUNCTION public.lojinha_reserve_cart_item(
  _slug text, _cart_token text, _product_id uuid, _qty integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s public.lojinha_settings;
  available integer;
  existing_qty integer;
  delta integer;
BEGIN
  PERFORM public.lojinha_release_expired_reservations();

  SELECT * INTO s FROM public.lojinha_settings WHERE slug = _slug AND enabled = true;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Loja não encontrada';
  END IF;

  IF _qty < 0 THEN _qty := 0; END IF;

  SELECT COALESCE(SUM(quantity),0) INTO existing_qty
    FROM public.lojinha_stock_reservations
    WHERE cart_token = _cart_token AND product_id = _product_id;

  delta := _qty - existing_qty;

  SELECT GREATEST(0, COALESCE(quantity,0) - COALESCE(lojinha_reserved_qty,0))
    INTO available
    FROM public.product_stock
    WHERE product_id = _product_id AND location_id = s.stock_location_id;

  IF delta > 0 AND COALESCE(available,0) < delta THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sem_estoque', 'available', COALESCE(available,0) + existing_qty);
  END IF;

  -- Remove reservas antigas deste cart+product
  DELETE FROM public.lojinha_stock_reservations
    WHERE cart_token = _cart_token AND product_id = _product_id;

  IF _qty > 0 THEN
    INSERT INTO public.lojinha_stock_reservations(user_id, cart_token, product_id, location_id, quantity, expires_at)
    VALUES (s.user_id, _cart_token, _product_id, s.stock_location_id, _qty, now() + interval '15 minutes');
  END IF;

  -- Atualiza reserved_qty agregado
  UPDATE public.product_stock ps
  SET lojinha_reserved_qty = GREATEST(0, ps.lojinha_reserved_qty + delta)
  WHERE ps.product_id = _product_id AND ps.location_id = s.stock_location_id;

  RETURN jsonb_build_object('ok', true, 'quantity', _qty);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lojinha_reserve_cart_item(text, text, uuid, integer) TO anon, authenticated;

-- Criar pedido (público) — não confirma pagamento, só cria pending
CREATE OR REPLACE FUNCTION public.lojinha_create_order(
  _slug text, _cart_token text,
  _customer_name text, _customer_email text, _customer_phone text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s public.lojinha_settings;
  new_order public.lojinha_orders;
  v_subtotal numeric := 0;
  r RECORD;
  item_total numeric;
BEGIN
  PERFORM public.lojinha_release_expired_reservations();

  SELECT * INTO s FROM public.lojinha_settings WHERE slug = _slug AND enabled = true;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.lojinha_stock_reservations WHERE cart_token = _cart_token) THEN
    RAISE EXCEPTION 'Carrinho vazio ou expirado';
  END IF;

  INSERT INTO public.lojinha_orders(user_id, customer_name, customer_email, customer_phone, subtotal, total, status)
  VALUES (s.user_id, _customer_name, _customer_email, _customer_phone, 0, 0, 'pending')
  RETURNING * INTO new_order;

  FOR r IN
    SELECT res.product_id, res.quantity, p.name, COALESCE(p.online_price, p.price) AS unit_price
    FROM public.lojinha_stock_reservations res
    JOIN public.products p ON p.id = res.product_id
    WHERE res.cart_token = _cart_token
  LOOP
    item_total := r.unit_price * r.quantity;
    v_subtotal := v_subtotal + item_total;
    INSERT INTO public.lojinha_order_items(user_id, order_id, product_id, product_name_snapshot, unit_price, quantity)
    VALUES (s.user_id, new_order.id, r.product_id, r.name, r.unit_price, r.quantity);
  END LOOP;

  UPDATE public.lojinha_orders SET subtotal = v_subtotal, total = v_subtotal WHERE id = new_order.id;

  RETURN jsonb_build_object('order_id', new_order.id, 'total', v_subtotal);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lojinha_create_order(text, text, text, text, text) TO anon, authenticated;

-- Buscar pedido público (cliente vê seu pedido pelo id)
CREATE OR REPLACE FUNCTION public.lojinha_get_order(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
  o public.lojinha_orders;
  items_json jsonb;
  units_json jsonb;
BEGIN
  SELECT * INTO o FROM public.lojinha_orders WHERE id = _order_id;
  IF o.id IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_agg(to_jsonb(i)) INTO items_json
    FROM public.lojinha_order_items i WHERE i.order_id = _order_id;

  SELECT jsonb_agg(jsonb_build_object(
    'id', u.id,
    'product_name', u.product_name_snapshot,
    'qr_token', u.qr_token,
    'status', u.status,
    'delivered_at', u.delivered_at
  )) INTO units_json
  FROM public.lojinha_order_units u WHERE u.order_id = _order_id;

  RETURN jsonb_build_object(
    'order', to_jsonb(o),
    'items', COALESCE(items_json, '[]'::jsonb),
    'units', COALESCE(units_json, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lojinha_get_order(uuid) TO anon, authenticated;

-- Confirma pagamento (chamada pelo webhook MP via supabaseAdmin)
CREATE OR REPLACE FUNCTION public.lojinha_confirm_payment(
  _order_id uuid, _mp_payment_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o public.lojinha_orders;
  s public.lojinha_settings;
  it RECORD;
  i integer;
  new_token text;
  sale_id uuid;
BEGIN
  SELECT * INTO o FROM public.lojinha_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF o.status = 'paid' OR o.status = 'delivered' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  SELECT * INTO s FROM public.lojinha_settings WHERE user_id = o.user_id;

  -- Baixa estoque + libera reservas + cria QRs
  FOR it IN SELECT * FROM public.lojinha_order_items WHERE order_id = o.id LOOP
    -- Baixa estoque (subtrai da quantidade)
    UPDATE public.product_stock
      SET quantity = GREATEST(0, quantity - it.quantity)
      WHERE product_id = it.product_id AND location_id = s.stock_location_id;

    -- Cria 1 unidade com QR por unidade
    FOR i IN 1..it.quantity LOOP
      new_token := encode(gen_random_bytes(18), 'hex');
      INSERT INTO public.lojinha_order_units(user_id, order_id, order_item_id, product_id, product_name_snapshot, qr_token)
      VALUES (o.user_id, o.id, it.id, it.product_id, it.product_name_snapshot, new_token);
    END LOOP;
  END LOOP;

  -- Libera reservas relacionadas a este pedido (best-effort: por agora limpa por usuário antigas)
  -- Como reservations usam cart_token e não order_id, a expiração natural cuida do resto.

  -- Registra venda em sales/sale_items (category='online', session_id NULL)
  INSERT INTO public.sales(user_id, total, payment_method, category, session_id, notes)
  VALUES (o.user_id, o.total, 'online', 'online', NULL, 'Pedido lojinha ' || o.id::text)
  RETURNING id INTO sale_id;

  INSERT INTO public.sale_items(user_id, sale_id, product_id, product_name, unit_price, quantity, subtotal, cost_price_snapshot)
  SELECT o.user_id, sale_id, it.product_id, it.product_name_snapshot, it.unit_price, it.quantity, it.unit_price*it.quantity, COALESCE(p.cost_price,0)
  FROM public.lojinha_order_items it
  LEFT JOIN public.products p ON p.id = it.product_id
  WHERE it.order_id = o.id;

  INSERT INTO public.sale_payments(user_id, sale_id, amount, method)
  VALUES (o.user_id, sale_id, o.total, 'online');

  UPDATE public.lojinha_orders
    SET status = 'paid', paid_at = now(), mp_payment_id = COALESCE(_mp_payment_id, mp_payment_id)
    WHERE id = o.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lojinha_confirm_payment(uuid, text) TO service_role;

-- Validar QR (garçom autenticado)
CREATE OR REPLACE FUNCTION public.lojinha_validate_qr(_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  u public.lojinha_order_units;
  o public.lojinha_orders;
  caller_name text;
BEGIN
  SELECT * INTO u FROM public.lojinha_order_units WHERE qr_token = _token FOR UPDATE;
  IF u.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;

  IF NOT has_permission(auth.uid(), u.user_id, 'lojinha') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO o FROM public.lojinha_orders WHERE id = u.order_id;

  IF u.status = 'delivered' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_delivered',
      'product_name', u.product_name_snapshot,
      'customer_name', o.customer_name,
      'delivered_at', u.delivered_at);
  END IF;

  SELECT display_name INTO caller_name FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = u.user_id LIMIT 1;

  UPDATE public.lojinha_order_units
    SET status = 'delivered', delivered_at = now(), delivered_by = auth.uid(), delivered_by_name = caller_name
    WHERE id = u.id;

  -- Se todas as unidades estão entregues, marca pedido como delivered
  IF NOT EXISTS (SELECT 1 FROM public.lojinha_order_units WHERE order_id = o.id AND status <> 'delivered') THEN
    UPDATE public.lojinha_orders SET status = 'delivered', delivered_at = now() WHERE id = o.id;
  END IF;

  RETURN jsonb_build_object('ok', true,
    'product_name', u.product_name_snapshot,
    'customer_name', o.customer_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lojinha_validate_qr(text) TO authenticated;

-- Habilita realtime para a tela do pedido
ALTER PUBLICATION supabase_realtime ADD TABLE public.lojinha_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lojinha_order_units;
