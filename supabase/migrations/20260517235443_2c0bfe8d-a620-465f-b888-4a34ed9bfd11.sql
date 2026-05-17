CREATE OR REPLACE FUNCTION public.get_combo_items_for_sales()
RETURNS TABLE(combo_product_id uuid, component_product_id uuid, quantity numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _owner uuid;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), _owner, 'vendas') THEN
    RAISE EXCEPTION 'Sem permissão de vendas';
  END IF;
  RETURN QUERY
    SELECT ci.combo_product_id, ci.component_product_id, ci.quantity
    FROM public.combo_items ci
    WHERE ci.user_id = _owner;
END;
$$;