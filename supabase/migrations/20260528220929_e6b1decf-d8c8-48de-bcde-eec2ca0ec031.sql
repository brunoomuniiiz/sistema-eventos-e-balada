CREATE OR REPLACE FUNCTION public.order_lookup_by_token(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
 DECLARE
   v_owner uuid;
   v_source text;
   v_id uuid;
   v_daily integer;
   v_status text;
   v_total numeric;
   v_customer text;
   v_phone text;
   v_released boolean;
   v_released_at timestamptz;
   v_released_by_name text;
   v_delivered_at timestamptz;
   v_delivered_by_name text;
   v_items jsonb;
   v_token text := upper(trim(_token));
 BEGIN
   -- 1) Tenta Venda (Sales) por token
   -- Note: sales table only has pickup_token, no pickup_code
   SELECT s.id, s.user_id, s.daily_number, s.total,
          s.released_at IS NOT NULL, s.released_at, s.released_by_name
     INTO v_id, v_owner, v_daily, v_total, v_released, v_released_at, v_released_by_name
   FROM public.sales s
   WHERE s.pickup_token = _token
   LIMIT 1;

   IF v_id IS NOT NULL THEN
     v_source := 'sale';
     v_status := CASE WHEN v_released THEN 'delivered' ELSE 'paid' END;
     v_customer := 'Balcão';
     v_delivered_at := v_released_at;
     v_delivered_by_name := v_released_by_name;

     IF NOT (has_permission(auth.uid(), v_owner, 'vendas') OR has_permission(auth.uid(), v_owner, 'lojinha')) THEN
       RAISE EXCEPTION 'no_permission';
     END IF;

     SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'id', si.id,
       'product_id', si.product_id,
       'product_name', si.product_name,
       'quantity', si.quantity,
       'unit_price', si.unit_price,
       'product_type', COALESCE(p.product_type, 'simple'),
       'category_id', p.category_id
     ) ORDER BY si.created_at), '[]'::jsonb) INTO v_items
     FROM public.sale_items si
     LEFT JOIN public.products p ON p.id = si.product_id
     WHERE si.sale_id = v_id;
   ELSE
     -- 2) Tenta Pedido (Lojinha) por token ou código curto
     SELECT o.id, o.user_id, o.daily_number, o.total, o.customer_name, o.customer_phone,
            o.status, o.delivered_at, o.delivered_by_name
       INTO v_id, v_owner, v_daily, v_total, v_customer, v_phone,
            v_status, v_delivered_at, v_delivered_by_name
     FROM public.lojinha_orders o
     WHERE o.pickup_token = _token OR o.pickup_code = v_token
     LIMIT 1;

     IF v_id IS NULL THEN
       RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
     END IF;

     v_source := 'order';

     IF NOT (has_permission(auth.uid(), v_owner, 'vendas') OR has_permission(auth.uid(), v_owner, 'lojinha')) THEN
       RAISE EXCEPTION 'no_permission';
     END IF;

     SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'id', oi.id,
       'product_id', oi.product_id,
       'product_name', oi.product_name_snapshot,
       'quantity', oi.quantity,
       'unit_price', oi.unit_price,
       'product_type', COALESCE(p.product_type, 'simple'),
       'category_id', p.category_id
     ) ORDER BY oi.created_at), '[]'::jsonb) INTO v_items
     FROM public.lojinha_order_items oi
     LEFT JOIN public.products p ON p.id = oi.product_id
     WHERE oi.order_id = v_id;
   END IF;

   RETURN jsonb_build_object(
     'ok', true,
     'source', v_source,
     'id', v_id,
     'daily_number', v_daily,
     'status', v_status,
     'total', v_total,
     'customer_name', v_customer,
     'customer_phone', v_phone,
     'delivered_at', v_delivered_at,
     'delivered_by_name', v_delivered_by_name,
     'items', v_items
   );
 END;
$function$;

CREATE OR REPLACE FUNCTION public.order_release(_source text, _id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_owner uuid;
  v_daily integer;
  v_bar_name text;
  v_caller text;
  v_slips jsonb := '[]'::jsonb;
  v_item record;
  v_components jsonb;
  i integer;
BEGIN
  IF _source = 'sale' THEN
    SELECT user_id, daily_number INTO v_owner, v_daily FROM public.sales WHERE id = _id;
  ELSIF _source = 'order' THEN
    SELECT user_id, daily_number INTO v_owner, v_daily FROM public.lojinha_orders WHERE id = _id;
  ELSE
    RAISE EXCEPTION 'invalid_source';
  END IF;

  IF v_owner IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  IF NOT (has_permission(auth.uid(), v_owner, 'vendas') OR has_permission(auth.uid(), v_owner, 'lojinha')) THEN
    RAISE EXCEPTION 'no_permission';
  END IF;

  SELECT bar_name INTO v_bar_name FROM public.bar_settings WHERE user_id = v_owner LIMIT 1;
  SELECT display_name INTO v_caller FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = v_owner LIMIT 1;
  IF v_caller IS NULL THEN
    SELECT display_name INTO v_caller FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  END IF;

  IF _source = 'sale' THEN
    FOR v_item IN
      SELECT si.product_id, si.product_name, si.quantity,
             COALESCE(p.product_type, 'simple') AS product_type,
             p.category_id
      FROM public.sale_items si
      LEFT JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = _id
      ORDER BY si.created_at
    LOOP
      IF v_item.product_type = 'combo' THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object('name', cp.name, 'qty', ci.quantity)), '[]'::jsonb)
          INTO v_components
        FROM public.combo_items ci
        JOIN public.products cp ON cp.id = ci.component_product_id
        WHERE ci.combo_product_id = v_item.product_id;

        FOR i IN 1..v_item.quantity LOOP
          v_slips := v_slips || jsonb_build_array(jsonb_build_object(
            'daily_number', v_daily, 'bar_name', v_bar_name,
            'item_name', v_item.product_name, 'unit_index', i, 'unit_total', v_item.quantity,
            'components', v_components, 'waiter', v_caller, 'created_at', now(),
            'category_id', v_item.category_id
          ));
        END LOOP;
      END IF;
    END LOOP;

    UPDATE public.sales
      SET released_at = COALESCE(released_at, now()),
          released_by = COALESCE(released_by, auth.uid()),
          released_by_name = COALESCE(released_by_name, v_caller)
      WHERE id = _id;
  ELSE
    FOR v_item IN
      SELECT oi.product_id, oi.product_name_snapshot AS product_name, oi.quantity,
             COALESCE(p.product_type, 'simple') AS product_type,
             p.category_id
      FROM public.lojinha_order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = _id
      ORDER BY oi.created_at
    LOOP
      IF v_item.product_type = 'combo' THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object('name', cp.name, 'qty', ci.quantity)), '[]'::jsonb)
          INTO v_components
        FROM public.combo_items ci
        JOIN public.products cp ON cp.id = ci.component_product_id
        WHERE ci.combo_product_id = v_item.product_id;

        FOR i IN 1..v_item.quantity LOOP
          v_slips := v_slips || jsonb_build_array(jsonb_build_object(
            'daily_number', v_daily, 'bar_name', v_bar_name,
            'item_name', v_item.product_name, 'unit_index', i, 'unit_total', v_item.quantity,
            'components', v_components, 'waiter', v_caller, 'created_at', now(),
            'category_id', v_item.category_id
          ));
        END LOOP;
      END IF;
    END LOOP;

    -- Marcamos como entregue e limpamos o token de retirada para o QR sumir do celular do cliente
    UPDATE public.lojinha_orders
      SET status = 'delivered',
          delivered_at = COALESCE(delivered_at, now()),
          delivered_by = COALESCE(delivered_by, auth.uid()),
          delivered_by_name = COALESCE(delivered_by_name, v_caller),
          pickup_token = NULL,
          pickup_code = NULL
      WHERE id = _id;

    -- Também marca todas as unidades individuais como entregues (se existirem)
    UPDATE public.lojinha_order_units
      SET status = 'delivered',
          delivered_at = COALESCE(delivered_at, now()),
          delivered_by = COALESCE(delivered_by, auth.uid()),
          delivered_by_name = COALESCE(delivered_by_name, v_caller)
      WHERE order_id = _id AND status <> 'delivered';

  END IF;

  RETURN jsonb_build_object('ok', true, 'daily_number', v_daily, 'prep_slips', v_slips);
END;
$function$;
