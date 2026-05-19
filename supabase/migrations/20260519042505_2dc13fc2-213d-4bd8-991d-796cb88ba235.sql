-- 1) Consolidação por owner: escolhe o local mais antigo como canônico
DO $$
DECLARE
  r RECORD;
  v_canonical UUID;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.stock_locations LOOP
    SELECT id INTO v_canonical
      FROM public.stock_locations
     WHERE user_id = r.user_id
     ORDER BY is_default DESC NULLS LAST, created_at ASC
     LIMIT 1;

    IF v_canonical IS NULL THEN CONTINUE; END IF;

    -- Garante 1 linha por product_id no canônico, somando os demais locais
    INSERT INTO public.product_stock (user_id, product_id, location_id, quantity, lojinha_reserved_qty)
    SELECT r.user_id, ps.product_id, v_canonical,
           SUM(ps.quantity)::int,
           SUM(COALESCE(ps.lojinha_reserved_qty, 0))::int
      FROM public.product_stock ps
      JOIN public.stock_locations sl ON sl.id = ps.location_id
     WHERE sl.user_id = r.user_id
     GROUP BY ps.product_id
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      lojinha_reserved_qty = EXCLUDED.lojinha_reserved_qty;

    -- Apaga linhas de product_stock em locais não-canônicos
    DELETE FROM public.product_stock ps
     USING public.stock_locations sl
     WHERE ps.location_id = sl.id
       AND sl.user_id = r.user_id
       AND ps.location_id <> v_canonical;

    -- Redireciona referências para o canônico
    UPDATE public.sales SET location_id = v_canonical
     WHERE user_id = r.user_id AND location_id IS NOT NULL AND location_id <> v_canonical;

    UPDATE public.lojinha_settings SET stock_location_id = v_canonical
     WHERE user_id = r.user_id;

    UPDATE public.stock_inventories SET location_id = v_canonical
     WHERE user_id = r.user_id AND location_id <> v_canonical;

    UPDATE public.lojinha_stock_reservations SET location_id = v_canonical
     WHERE user_id = r.user_id AND location_id <> v_canonical;

    -- Apaga locais extras
    DELETE FROM public.stock_locations
     WHERE user_id = r.user_id AND id <> v_canonical;

    -- Renomeia o canônico para "Estoque" e marca como default
    UPDATE public.stock_locations
       SET name = 'Estoque', is_default = true
     WHERE id = v_canonical;
  END LOOP;
END $$;

-- 2) Recria storefront: mostra TODOS os produtos sell_online; combos calculados via componentes
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
            SELECT MIN(GREATEST(0, FLOOR(COALESCE(ps2.quantity, 0) / NULLIF(ci.quantity, 0))))::int
              FROM public.combo_items ci
              LEFT JOIN public.product_stock ps2
                ON ps2.product_id = ci.component_product_id
               AND ps2.location_id = s.stock_location_id
             WHERE ci.combo_product_id = p.id
          ), 0)
        WHEN p.track_stock = false THEN 9999
        ELSE GREATEST(0, COALESCE(ps.quantity, 0) - COALESCE(ps.lojinha_reserved_qty, 0))
      END
    ) AS x
    FROM public.products p
    LEFT JOIN public.product_stock ps
      ON ps.product_id = p.id AND ps.location_id = s.stock_location_id
    LEFT JOIN public.product_categories c
      ON c.id = p.category_id
    WHERE p.user_id = s.user_id
      AND p.sell_online = true
      AND p.is_available = true
  ) sub;

  RETURN jsonb_build_object(
    'settings', to_jsonb(s),
    'products', COALESCE(products_json, '[]'::jsonb)
  );
END;
$function$;