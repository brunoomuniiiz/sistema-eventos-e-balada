-- Permitir métodos de pagamento usados pela lojinha (online/POS) na tabela sales
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method = ANY (ARRAY[
    'debito','credito','pix','dinheiro',
    'pix_online','cartao_point','online'
  ]));

-- Corrige lojinha_confirm_payment para usar extensions.gen_random_bytes
CREATE OR REPLACE FUNCTION public.lojinha_confirm_payment(_order_id uuid, _mp_payment_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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

  FOR it IN SELECT * FROM public.lojinha_order_items WHERE order_id = o.id LOOP
    UPDATE public.product_stock
      SET quantity = GREATEST(0, quantity - it.quantity)
      WHERE product_id = it.product_id AND location_id = s.stock_location_id;

    FOR i IN 1..it.quantity LOOP
      new_token := encode(extensions.gen_random_bytes(18), 'hex');
      INSERT INTO public.lojinha_order_units(user_id, order_id, order_item_id, product_id, product_name_snapshot, qr_token)
      VALUES (o.user_id, o.id, it.id, it.product_id, it.product_name_snapshot, new_token);
    END LOOP;
  END LOOP;

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
$function$;