DROP POLICY IF EXISTS "View products" ON public.products;
CREATE POLICY "View products" ON public.products FOR SELECT
USING (
  user_id = public.get_owner_id(auth.uid())
  AND (
    public.has_permission(auth.uid(), user_id, 'estoque')
    OR public.has_permission(auth.uid(), user_id, 'vendas')
    OR public.has_permission(auth.uid(), user_id, 'lojinha')
  )
);

DROP POLICY IF EXISTS "View combo_items" ON public.combo_items;
CREATE POLICY "View combo_items" ON public.combo_items FOR SELECT
USING (
  user_id = public.get_owner_id(auth.uid())
  AND (
    public.has_permission(auth.uid(), user_id, 'estoque')
    OR public.has_permission(auth.uid(), user_id, 'vendas')
    OR public.has_permission(auth.uid(), user_id, 'lojinha')
  )
);