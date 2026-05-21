CREATE OR REPLACE FUNCTION public.lojinha_validate_qr(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o public.lojinha_orders;
  u public.lojinha_order_units;
  caller_name text;
  units_count int;
BEGIN
  -- 1) Tenta como pickup_token do pedido inteiro
  SELECT * INTO o FROM public.lojinha_orders WHERE pickup_token = _token FOR UPDATE;

  IF o.id IS NOT NULL THEN
    IF NOT has_permission(auth.uid(), o.user_id, 'lojinha') THEN
      RAISE EXCEPTION 'Sem permissão';
    END IF;

    IF o.status = 'delivered' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_delivered',
        'customer_name', o.customer_name,
        'delivered_at', o.delivered_at);
    END IF;

    IF o.status <> 'paid' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_paid',
        'customer_name', o.customer_name);
    END IF;

    SELECT display_name INTO caller_name FROM public.user_roles
      WHERE user_id = auth.uid() AND owner_id = o.user_id LIMIT 1;

    UPDATE public.lojinha_order_units
      SET status = 'delivered', delivered_at = now(),
          delivered_by = auth.uid(), delivered_by_name = caller_name
      WHERE order_id = o.id AND status <> 'delivered';

    SELECT count(*) INTO units_count FROM public.lojinha_order_units WHERE order_id = o.id;

    UPDATE public.lojinha_orders
      SET status = 'delivered', delivered_at = now(), pickup_token = NULL
      WHERE id = o.id;

    RETURN jsonb_build_object('ok', true,
      'customer_name', o.customer_name,
      'product_name', units_count::text || ' ' || CASE WHEN units_count = 1 THEN 'item' ELSE 'itens' END,
      'order_total', o.total);
  END IF;

  -- 2) Fallback: token de unidade (compat)
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
      'customer_name', o.customer_name,
      'delivered_at', u.delivered_at);
  END IF;

  SELECT display_name INTO caller_name FROM public.user_roles
    WHERE user_id = auth.uid() AND owner_id = u.user_id LIMIT 1;

  UPDATE public.lojinha_order_units
    SET status = 'delivered', delivered_at = now(),
        delivered_by = auth.uid(), delivered_by_name = caller_name
    WHERE id = u.id;

  IF NOT EXISTS (SELECT 1 FROM public.lojinha_order_units WHERE order_id = o.id AND status <> 'delivered') THEN
    UPDATE public.lojinha_orders SET status = 'delivered', delivered_at = now(), pickup_token = NULL WHERE id = o.id;
  END IF;

  RETURN jsonb_build_object('ok', true,
    'product_name', u.product_name_snapshot,
    'customer_name', o.customer_name);
END;
$function$;