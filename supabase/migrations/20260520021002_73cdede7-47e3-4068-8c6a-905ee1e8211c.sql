UPDATE public.products p
   SET category_id = NULL
 WHERE category_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.product_categories c WHERE c.id = p.category_id);

ALTER TABLE public.products
  ADD CONSTRAINT products_category_id_fkey
  FOREIGN KEY (category_id)
  REFERENCES public.product_categories(id)
  ON DELETE SET NULL;