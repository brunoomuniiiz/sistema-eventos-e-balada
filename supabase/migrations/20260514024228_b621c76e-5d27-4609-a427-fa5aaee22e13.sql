
-- 1. Add product type & track_stock to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT true;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN ('simple','combo'));

-- 2. combo_items table
CREATE TABLE IF NOT EXISTS public.combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  combo_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (combo_product_id, component_product_id)
);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON public.combo_items(combo_product_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_component ON public.combo_items(component_product_id);

ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View combo_items" ON public.combo_items;
DROP POLICY IF EXISTS "Insert combo_items" ON public.combo_items;
DROP POLICY IF EXISTS "Update combo_items" ON public.combo_items;
DROP POLICY IF EXISTS "Delete combo_items" ON public.combo_items;

CREATE POLICY "View combo_items" ON public.combo_items FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Insert combo_items" ON public.combo_items FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid())
              AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Update combo_items" ON public.combo_items FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Delete combo_items" ON public.combo_items FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid())
         AND public.has_permission(auth.uid(), user_id, 'estoque'));

CREATE TRIGGER combo_items_updated_at
  BEFORE UPDATE ON public.combo_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Replace decrement trigger to handle combos
CREATE OR REPLACE FUNCTION public.decrement_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _type text;
  _track boolean;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT product_type, track_stock INTO _type, _track
  FROM public.products WHERE id = NEW.product_id;

  IF _type = 'combo' THEN
    -- Explode combo into its components
    UPDATE public.products p
    SET stock_quantity = GREATEST(p.stock_quantity - (ci.quantity * NEW.quantity)::int, 0)
    FROM public.combo_items ci
    WHERE ci.combo_product_id = NEW.product_id
      AND p.id = ci.component_product_id
      AND p.track_stock = true;

    -- Optionally also decrement combo's own stock if track_stock
    IF _track THEN
      UPDATE public.products
      SET stock_quantity = GREATEST(stock_quantity - NEW.quantity, 0)
      WHERE id = NEW.product_id;
    END IF;
  ELSE
    IF COALESCE(_track, true) THEN
      UPDATE public.products
      SET stock_quantity = GREATEST(stock_quantity - NEW.quantity, 0)
      WHERE id = NEW.product_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists on sale_items
DROP TRIGGER IF EXISTS sale_items_decrement_stock ON public.sale_items;
CREATE TRIGGER sale_items_decrement_stock
  AFTER INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.decrement_product_stock();

-- Default combos to not track own stock
UPDATE public.products SET track_stock = false WHERE product_type = 'combo';
