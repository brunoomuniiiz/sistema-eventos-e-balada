CREATE OR REPLACE FUNCTION public.order_lookup_by_token(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
 BEGIN
   SELECT s.id, s.user_id, s.daily_number, s.total,
          s.released_at IS NOT NULL, s.released_at, s.released_by_name
     INTO v_id, v_owner, v_daily, v_total, v_released, v_released_at, v_released_by_name
   FROM public.sales s
   WHERE s.pickup_token = _token
   LIMIT 1;

   IF v_id IS NOT NULL THEN
     v_source := 'sale';
     v_status := CASE WHEN v_released THEN 'released' ELSE 'paid' END;
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
     SELECT o.id, o.user_id, o.daily_number, o.total, o.customer_name, o.customer_phone,
            o.status, o.delivered_at, o.delivered_by_name
       INTO v_id, v_owner, v_daily, v_total, v_customer, v_phone,
            v_status, v_delivered_at, v_delivered_by_name
     FROM public.lojinha_orders o
     WHERE o.pickup_token = _token
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
