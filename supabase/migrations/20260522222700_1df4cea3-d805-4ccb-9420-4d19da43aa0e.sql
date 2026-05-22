
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
            SELECT MIN(
              CASE
                -- Componente sem registro de estoque na location => trata como "ilimitado"
                WHEN ps2.product_id IS NULL THEN 9999
                ELSE GREATEST(0, FLOOR(
                  COALESCE(ps2.quantity, 0)
                  - COALESCE((
                      SELECT SUM(r.quantity) FROM public.lojinha_stock_reservations r
                       WHERE r.product_id = ci.component_product_id
                         AND r.location_id = s.stock_location_id
                         AND r.expires_at > now()
                    ), 0)
                ) / NULLIF(ci.quantity, 0))::int
              END
            )
              FROM public.combo_items ci
              LEFT JOIN public.product_stock ps2
                ON ps2.product_id = ci.component_product_id
               AND ps2.location_id = s.stock_location_id
             WHERE ci.combo_product_id = p.id
          ), 0)
        WHEN p.track_stock = false THEN 9999
        -- Produto simples sem registro de estoque na location => trata como disponível
        WHEN ps.product_id IS NULL THEN 9999
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
