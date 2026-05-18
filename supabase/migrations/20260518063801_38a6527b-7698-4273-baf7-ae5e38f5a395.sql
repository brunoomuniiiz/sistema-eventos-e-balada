
-- 1) user_roles: flags do modo caixa
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS lojinha_can_sell boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lojinha_payment_methods text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS lojinha_point_device_id text;

-- 2) lojinha_orders: campos do canal POS
ALTER TABLE public.lojinha_orders
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS seller_user_id uuid,
  ADD COLUMN IF NOT EXISTS seller_name text,
  ADD COLUMN IF NOT EXISTS mp_point_intent_id text,
  ADD COLUMN IF NOT EXISTS point_device_id text;

-- 3) tabela de maquininhas Point
CREATE TABLE IF NOT EXISTS public.lojinha_point_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mp_device_id text NOT NULL,
  label text NOT NULL,
  assigned_to_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mp_device_id)
);

ALTER TABLE public.lojinha_point_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lojinha_point_devices owner all"
  ON public.lojinha_point_devices
  FOR ALL
  USING ((user_id = get_owner_id(auth.uid())) AND is_owner_of(auth.uid(), user_id))
  WITH CHECK ((user_id = get_owner_id(auth.uid())) AND is_owner_of(auth.uid(), user_id));

CREATE POLICY "lojinha_point_devices staff view"
  ON public.lojinha_point_devices
  FOR SELECT
  USING ((user_id = get_owner_id(auth.uid())) AND has_permission(auth.uid(), user_id, 'lojinha'));

CREATE TRIGGER trg_lojinha_point_devices_updated
  BEFORE UPDATE ON public.lojinha_point_devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4) RPC: criar pedido POS com reserva de estoque
CREATE OR REPLACE FUNCTION public.lojinha_create_pos_order(
  _items jsonb,         -- [{product_id, quantity}]
  _payment_method text, -- 'pix' | 'card'
  _device_id text       -- mp_device_id, opcional
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := get_owner_id(auth.uid());
  v_can_sell boolean;
  v_methods text[];
  v_seller_name text;
  v_order_id uuid := gen_random_uuid();
  v_subtotal numeric := 0;
  v_item jsonb;
  v_product record;
  v_unit_price numeric;
  v_location uuid;
  v_available integer;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT lojinha_can_sell, lojinha_payment_methods, display_name
    INTO v_can_sell, v_methods, v_seller_name
  FROM user_roles
  WHERE user_id = auth.uid() AND owner_id = v_owner;

  IF NOT COALESCE(v_can_sell, false) THEN
    RAISE EXCEPTION 'no_permission';
  END IF;

  IF NOT (_payment_method = ANY(v_methods)) THEN
    RAISE EXCEPTION 'payment_method_not_allowed';
  END IF;

  SELECT stock_location_id INTO v_location
  FROM lojinha_settings
  WHERE user_id = v_owner
  LIMIT 1;

  IF v_location IS NULL THEN
    SELECT id INTO v_location FROM stock_locations
    WHERE user_id = v_owner ORDER BY is_default DESC, created_at LIMIT 1;
  END IF;

  -- cria pedido pending
  INSERT INTO lojinha_orders (
    id, user_id, customer_name, status, channel,
    seller_user_id, seller_name, point_device_id, subtotal, total
  ) VALUES (
    v_order_id, v_owner, COALESCE(v_seller_name, 'Balcão'), 'pending', 'pos',
    auth.uid(), v_seller_name, _device_id, 0, 0
  );

  -- itera itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    SELECT id, name, COALESCE(online_price, price) AS unit_price, sell_online
      INTO v_product
    FROM products
    WHERE id = (v_item->>'product_id')::uuid AND user_id = v_owner;

    IF NOT FOUND OR NOT v_product.sell_online THEN
      RAISE EXCEPTION 'product_unavailable';
    END IF;

    v_unit_price := v_product.unit_price;
    v_subtotal := v_subtotal + v_unit_price * (v_item->>'quantity')::integer;

    INSERT INTO lojinha_order_items (
      user_id, order_id, product_id, product_name_snapshot, unit_price, quantity
    ) VALUES (
      v_owner, v_order_id, v_product.id, v_product.name,
      v_unit_price, (v_item->>'quantity')::integer
    );
  END LOOP;

  UPDATE lojinha_orders SET subtotal = v_subtotal, total = v_subtotal
  WHERE id = v_order_id;

  RETURN jsonb_build_object('order_id', v_order_id, 'total', v_subtotal);
END;
$$;

-- 5) RPC: confirmar entrega POS (baixa estoque + registra venda)
CREATE OR REPLACE FUNCTION public.lojinha_confirm_delivery_pos(
  _order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := get_owner_id(auth.uid());
  v_order record;
  v_sale_id uuid := gen_random_uuid();
  v_item record;
  v_location uuid;
BEGIN
  SELECT * INTO v_order FROM lojinha_orders
  WHERE id = _order_id AND user_id = v_owner;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.channel <> 'pos' THEN
    RAISE EXCEPTION 'not_pos_order';
  END IF;

  IF v_order.status NOT IN ('paid', 'pending') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  SELECT stock_location_id INTO v_location FROM lojinha_settings
  WHERE user_id = v_owner LIMIT 1;

  IF v_location IS NULL THEN
    SELECT id INTO v_location FROM stock_locations
    WHERE user_id = v_owner ORDER BY is_default DESC, created_at LIMIT 1;
  END IF;

  -- cria venda
  INSERT INTO sales (
    id, user_id, total, payment_method, category, session_id,
    employee_id, employee_name, location_id
  ) VALUES (
    v_sale_id, v_owner, v_order.total,
    CASE WHEN v_order.mp_point_intent_id IS NOT NULL THEN 'cartao_point' ELSE 'pix_online' END,
    'online', NULL, NULL, v_order.seller_name, v_location
  );

  -- baixa estoque + cria sale_items + cria order_units
  FOR v_item IN
    SELECT oi.*, p.product_type
    FROM lojinha_order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = _order_id
  LOOP
    INSERT INTO sale_items (
      user_id, sale_id, product_id, product_name, unit_price, quantity, subtotal
    ) VALUES (
      v_owner, v_sale_id, v_item.product_id, v_item.product_name_snapshot,
      v_item.unit_price, v_item.quantity, v_item.unit_price * v_item.quantity
    );

    -- baixa estoque (combos explodem)
    IF v_item.product_type = 'combo' THEN
      UPDATE product_stock ps SET quantity = ps.quantity - (ci.quantity * v_item.quantity)
      FROM combo_items ci
      WHERE ci.combo_product_id = v_item.product_id
        AND ps.product_id = ci.component_product_id
        AND ps.user_id = v_owner
        AND ps.location_id = v_location;
    ELSE
      UPDATE product_stock SET quantity = quantity - v_item.quantity
      WHERE product_id = v_item.product_id
        AND user_id = v_owner
        AND location_id = v_location;
    END IF;

    -- cria units como já entregues
    FOR i IN 1..v_item.quantity LOOP
      INSERT INTO lojinha_order_units (
        user_id, order_id, order_item_id, product_id, product_name_snapshot,
        qr_token, status, delivered_at, delivered_by, delivered_by_name
      ) VALUES (
        v_owner, _order_id, v_item.id, v_item.product_id, v_item.product_name_snapshot,
        encode(gen_random_bytes(16), 'hex'), 'delivered', now(), auth.uid(), v_order.seller_name
      );
    END LOOP;
  END LOOP;

  UPDATE lojinha_orders
  SET status = 'delivered', delivered_at = now(),
      paid_at = COALESCE(paid_at, now())
  WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'sale_id', v_sale_id);
END;
$$;

-- 6) RPC: marcar pedido POS como pago (chamada pelo webhook/confirmação manual)
CREATE OR REPLACE FUNCTION public.lojinha_mark_pos_paid(
  _order_id uuid,
  _payment_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := get_owner_id(auth.uid());
BEGIN
  UPDATE lojinha_orders
  SET status = 'paid', paid_at = now(), mp_payment_id = _payment_id
  WHERE id = _order_id AND user_id = v_owner AND channel = 'pos' AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_pending';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
