CREATE OR REPLACE FUNCTION public.lojinha_reserve_for_checkout(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o public.lojinha_orders;
  s public.lojinha_settings;
  it RECORD;
  available int;
  v_cart_token text;
BEGIN
  DELETE FROM public.lojinha_stock_reservations WHERE expires_at < now();

  SELECT * INTO o FROM public.lojinha_orders WHERE id = _order_id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  SELECT * INTO s FROM public.lojinha_settings WHERE user_id = o.user_id LIMIT 1;
  IF s.id IS NULL OR s.stock_location_id IS NULL THEN
    RAISE EXCEPTION 'Lojinha não configurada';
  END IF;

  v_cart_token := 'pix-' || _order_id::text;

  DELETE FROM public.lojinha_stock_reservations WHERE cart_token = v_cart_token;

  FOR it IN
    SELECT oi.product_id, oi.quantity, oi.product_name_snapshot, p.product_type, p.track_stock
      FROM public.lojinha_order_items oi
      JOIN public.products p ON p.id = oi.product_id
     WHERE oi.order_id = _order_id
  LOOP
    IF it.product_type = 'combo' OR it.track_stock = false THEN
      CONTINUE;
    END IF;

    SELECT GREATEST(0,
      COALESCE(ps.quantity, 0)
      - COALESCE((
          SELECT SUM(r.quantity) FROM public.lojinha_stock_reservations r
           WHERE r.product_id = it.product_id
             AND r.location_id = s.stock_location_id
             AND r.expires_at > now()
        ), 0)
    ) INTO available
    FROM public.product_stock ps
    WHERE ps.product_id = it.product_id AND ps.location_id = s.stock_location_id;

    IF available < it.quantity THEN
      RAISE EXCEPTION 'Produto % esgotado, atualize o carrinho', it.product_name_snapshot;
    END IF;

    IF available = it.quantity THEN
      INSERT INTO public.lojinha_stock_reservations(user_id, cart_token, product_id, location_id, quantity, expires_at)
      VALUES (o.user_id, v_cart_token, it.product_id, s.stock_location_id, it.quantity, now() + interval '5 minutes');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$function$;