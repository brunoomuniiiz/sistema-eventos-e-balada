-- Bug 2: garçom (com permissão "lojinha") precisa ver as categorias para filtrar produtos
DROP POLICY IF EXISTS "View product_categories" ON public.product_categories;
CREATE POLICY "View product_categories"
ON public.product_categories
FOR SELECT
USING (
  user_id = get_owner_id(auth.uid())
  AND (
    has_permission(auth.uid(), user_id, 'estoque')
    OR has_permission(auth.uid(), user_id, 'vendas')
    OR has_permission(auth.uid(), user_id, 'lojinha')
  )
);

-- Bug 3: vender combo agora gera 1 unidade QR por componente (×qty do combo × qty do item)
-- ao invés de 1 unidade só com o nome do combo
CREATE OR REPLACE FUNCTION public.lojinha_confirm_delivery_pos(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_owner uuid := get_owner_id(auth.uid());
  v_order record;
  v_sale_id uuid := gen_random_uuid();
  v_item record;
  v_component record;
  v_location uuid;
BEGIN
  SELECT * INTO v_order FROM lojinha_orders
  WHERE id = _order_id AND user_id = v_owner;

  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.channel <> 'pos' THEN RAISE EXCEPTION 'not_pos_order'; END IF;
  IF v_order.status NOT IN ('paid', 'pending') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  SELECT stock_location_id INTO v_location FROM lojinha_settings
  WHERE user_id = v_owner LIMIT 1;

  IF v_location IS NULL THEN
    SELECT id INTO v_location FROM stock_locations
    WHERE user_id = v_owner ORDER BY is_default DESC, created_at LIMIT 1;
  END IF;

  INSERT INTO sales (
    id, user_id, total, payment_method, category, session_id,
    employee_id, employee_name, location_id
  ) VALUES (
    v_sale_id, v_owner, v_order.total,
    CASE WHEN v_order.mp_point_intent_id IS NOT NULL THEN 'cartao_point' ELSE 'pix_online' END,
    'online', NULL, NULL, v_order.seller_name, v_location
  );

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

    IF v_item.product_type = 'combo' THEN
      -- baixa estoque dos componentes
      UPDATE product_stock ps SET quantity = ps.quantity - (ci.quantity * v_item.quantity)
      FROM combo_items ci
      WHERE ci.combo_product_id = v_item.product_id
        AND ps.product_id = ci.component_product_id
        AND ps.user_id = v_owner
        AND ps.location_id = v_location;

      -- gera 1 unidade QR por componente (× quantidade do combo × quantidade do item)
      FOR v_component IN
        SELECT ci.component_product_id, ci.quantity AS comp_qty, p.name AS comp_name
        FROM combo_items ci
        JOIN products p ON p.id = ci.component_product_id
        WHERE ci.combo_product_id = v_item.product_id
      LOOP
        FOR i IN 1..(v_item.quantity * v_component.comp_qty) LOOP
          INSERT INTO lojinha_order_units (
            user_id, order_id, order_item_id, product_id, product_name_snapshot,
            qr_token, status, delivered_at, delivered_by, delivered_by_name
          ) VALUES (
            v_owner, _order_id, v_item.id, v_component.component_product_id,
            v_component.comp_name || ' (combo: ' || v_item.product_name_snapshot || ')',
            encode(extensions.gen_random_bytes(16), 'hex'),
            'delivered', now(), auth.uid(), v_order.seller_name
          );
        END LOOP;
      END LOOP;
    ELSE
      UPDATE product_stock SET quantity = quantity - v_item.quantity
      WHERE product_id = v_item.product_id
        AND user_id = v_owner
        AND location_id = v_location;

      FOR i IN 1..v_item.quantity LOOP
        INSERT INTO lojinha_order_units (
          user_id, order_id, order_item_id, product_id, product_name_snapshot,
          qr_token, status, delivered_at, delivered_by, delivered_by_name
        ) VALUES (
          v_owner, _order_id, v_item.id, v_item.product_id, v_item.product_name_snapshot,
          encode(extensions.gen_random_bytes(16), 'hex'),
          'delivered', now(), auth.uid(), v_order.seller_name
        );
      END LOOP;
    END IF;
  END LOOP;

  UPDATE lojinha_orders
  SET status = 'delivered', delivered_at = now(),
      paid_at = COALESCE(paid_at, now())
  WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'sale_id', v_sale_id);
END;
$function$;