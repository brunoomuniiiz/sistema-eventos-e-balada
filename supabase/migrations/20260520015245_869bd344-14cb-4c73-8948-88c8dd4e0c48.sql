
-- 1) Adicionar colunas de visibilidade por canal
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ativo_geral boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visivel_pdv_caixa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visivel_mobile_garcom boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visivel_lojinha_cliente boolean NOT NULL DEFAULT true;

-- Backfill a partir das colunas legadas
UPDATE public.products
   SET ativo_geral = COALESCE(is_available, true),
       visivel_lojinha_cliente = COALESCE(sell_online, true)
 WHERE ativo_geral IS DISTINCT FROM COALESCE(is_available, true)
    OR visivel_lojinha_cliente IS DISTINCT FROM COALESCE(sell_online, true);

-- 2) Storefront: filtrar pelos novos flags + desconto de reserva só por PIX pendente
CREATE OR REPLACE FUNCTION public.lojinha_get_storefront(_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.lojinha_settings;
  products_json jsonb;
BEGIN
  SELECT * INTO s FROM public.lojinha_settings WHERE slug = _slug AND enabled = true;
  IF s.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(x ORDER BY (x->>'available_qty')::int DESC, x->>'category_name' NULLS LAST, x->>'name')
  INTO products_json
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description', p.description,
      'photo_url', p.photo_url,
      'price', COALESCE(p.online_price, p.price),
      'unit', p.unit,
      'category_id', p.category_id,
      'category_name', c.name,
      'available_qty', CASE
        WHEN p.product_type = 'combo' THEN
          COALESCE((
            SELECT MIN(GREATEST(0, FLOOR(
              COALESCE(ps2.quantity, 0)
              - COALESCE((
                  SELECT SUM(r.quantity) FROM public.lojinha_stock_reservations r
                   WHERE r.product_id = ci.component_product_id
                     AND r.location_id = s.stock_location_id
                     AND r.expires_at > now()
                ), 0)
            ) / NULLIF(ci.quantity, 0)))::int
              FROM public.combo_items ci
              LEFT JOIN public.product_stock ps2
                ON ps2.product_id = ci.component_product_id
               AND ps2.location_id = s.stock_location_id
             WHERE ci.combo_product_id = p.id
          ), 0)
        WHEN p.track_stock = false THEN 9999
        ELSE GREATEST(0,
          COALESCE(ps.quantity, 0)
          - COALESCE((
              SELECT SUM(r.quantity) FROM public.lojinha_stock_reservations r
               WHERE r.product_id = p.id
                 AND r.location_id = s.stock_location_id
                 AND r.expires_at > now()
            ), 0)
        )
      END
    ) AS x
    FROM public.products p
    LEFT JOIN public.product_stock ps
      ON ps.product_id = p.id AND ps.location_id = s.stock_location_id
    LEFT JOIN public.product_categories c
      ON c.id = p.category_id
    WHERE p.user_id = s.user_id
      AND p.ativo_geral = true
      AND p.visivel_lojinha_cliente = true
  ) sub;

  RETURN jsonb_build_object(
    'settings', to_jsonb(s),
    'products', COALESCE(products_json, '[]'::jsonb)
  );
END;
$function$;

-- 3) Reserva no checkout (apenas última unidade, 5 min)
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
  cart_token text;
BEGIN
  -- limpa reservas expiradas
  DELETE FROM public.lojinha_stock_reservations WHERE expires_at < now();

  SELECT * INTO o FROM public.lojinha_orders WHERE id = _order_id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  SELECT * INTO s FROM public.lojinha_settings WHERE user_id = o.user_id LIMIT 1;
  IF s.id IS NULL OR s.stock_location_id IS NULL THEN
    RAISE EXCEPTION 'Lojinha não configurada';
  END IF;

  cart_token := 'pix-' || _order_id::text;

  -- limpa reservas antigas desse pedido (idempotente)
  DELETE FROM public.lojinha_stock_reservations WHERE cart_token = cart_token;

  FOR it IN
    SELECT oi.product_id, oi.quantity, oi.product_name_snapshot, p.product_type, p.track_stock
      FROM public.lojinha_order_items oi
      JOIN public.products p ON p.id = oi.product_id
     WHERE oi.order_id = _order_id
  LOOP
    -- combos não reservam (vide componentes); produtos sem track_stock também não
    IF it.product_type = 'combo' OR it.track_stock = false THEN
      CONTINUE;
    END IF;

    -- calcula disponível agora
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

    -- só reserva se a venda zera o estoque (última unidade / últimas unidades)
    IF available = it.quantity THEN
      INSERT INTO public.lojinha_stock_reservations(user_id, cart_token, product_id, location_id, quantity, expires_at)
      VALUES (o.user_id, cart_token, it.product_id, s.stock_location_id, it.quantity, now() + interval '5 minutes');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 4) Liberar reserva quando a venda é finalizada (PIX aprovado) ou cancelada
CREATE OR REPLACE FUNCTION public.lojinha_release_order_reservation(_order_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.lojinha_stock_reservations
   WHERE cart_token = 'pix-' || _order_id::text;
$function$;

-- 5) Hook no finalize_sale_from_pix (futuro) — por ora, liberamos via webhook chamando explicitamente.
-- Garantir que toggleSellOnline (RPC legada) sincronize as duas flags
CREATE OR REPLACE FUNCTION public.lojinha_toggle_sell_online(_product_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid;
  _new boolean;
BEGIN
  SELECT user_id INTO _owner FROM public.products WHERE id = _product_id;
  IF _owner IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
  IF NOT public.has_permission(auth.uid(), _owner, 'estoque') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  UPDATE public.products
     SET sell_online = NOT sell_online,
         visivel_lojinha_cliente = NOT sell_online
   WHERE id = _product_id
   RETURNING sell_online INTO _new;
  RETURN _new;
END;
$function$;
