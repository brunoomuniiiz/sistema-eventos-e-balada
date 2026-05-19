-- 1. Default sell_online = true + backfill
ALTER TABLE public.products ALTER COLUMN sell_online SET DEFAULT true;
UPDATE public.products SET sell_online = true WHERE sell_online = false;

-- 2. RPC toggle atômico (respeita RLS via WITH CHECK)
CREATE OR REPLACE FUNCTION public.lojinha_toggle_sell_online(_product_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _new boolean;
BEGIN
  SELECT user_id INTO _owner FROM public.products WHERE id = _product_id;
  IF _owner IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
  IF NOT public.has_permission(auth.uid(), _owner, 'estoque') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  UPDATE public.products SET sell_online = NOT COALESCE(sell_online, false)
    WHERE id = _product_id
    RETURNING sell_online INTO _new;
  RETURN _new;
END;
$$;

-- 3. Storefront: incluir category_name + filtrar sem estoque + ordenar
CREATE OR REPLACE FUNCTION public.lojinha_get_storefront(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.lojinha_settings;
  products_json jsonb;
BEGIN
  SELECT * INTO s FROM public.lojinha_settings WHERE slug = _slug AND enabled = true;
  IF s.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(x ORDER BY x->>'category_name' NULLS LAST, x->>'name')
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
      'available_qty', GREATEST(0, COALESCE(ps.quantity, 0) - COALESCE(ps.lojinha_reserved_qty, 0))
    ) AS x
    FROM public.products p
    LEFT JOIN public.product_stock ps
      ON ps.product_id = p.id AND ps.location_id = s.stock_location_id
    LEFT JOIN public.product_categories c
      ON c.id = p.category_id
    WHERE p.user_id = s.user_id
      AND p.sell_online = true
      AND p.is_available = true
      AND GREATEST(0, COALESCE(ps.quantity, 0) - COALESCE(ps.lojinha_reserved_qty, 0)) > 0
  ) sub;

  RETURN jsonb_build_object(
    'settings', to_jsonb(s),
    'products', COALESCE(products_json, '[]'::jsonb)
  );
END;
$$;