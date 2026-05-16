
-- Categories table
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View product_categories" ON public.product_categories FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid())
    AND (public.has_permission(auth.uid(), user_id, 'estoque')
      OR public.has_permission(auth.uid(), user_id, 'vendas')));

CREATE POLICY "Insert product_categories" ON public.product_categories FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid())
    AND public.has_permission(auth.uid(), user_id, 'estoque'));

CREATE POLICY "Update product_categories" ON public.product_categories FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid())
    AND public.has_permission(auth.uid(), user_id, 'estoque'));

CREATE POLICY "Delete product_categories" ON public.product_categories FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid())
    AND public.has_permission(auth.uid(), user_id, 'estoque'));

CREATE TRIGGER update_product_categories_updated_at
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add category_id to products
ALTER TABLE public.products ADD COLUMN category_id uuid;
CREATE INDEX idx_products_category_id ON public.products(category_id);

-- Seed function
CREATE OR REPLACE FUNCTION public.seed_default_product_categories(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.product_categories (user_id, name, icon, sort_order, is_default) VALUES
    (_user_id, 'Combos',          'layers',    1, true),
    (_user_id, 'Narguilé',        'flame',     2, true),
    (_user_id, 'Long',            'glass-water', 3, true),
    (_user_id, 'Baldes',          'package',   4, true),
    (_user_id, 'Não alcoólicos',  'cup-soda',  5, true),
    (_user_id, 'Cervejas 600',    'beer',      6, true),
    (_user_id, 'Variados',        'shapes',    7, true)
  ON CONFLICT (user_id, name) DO NOTHING;
END $$;

-- Update handle_new_user to also seed categories
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, owner_id, role, display_name, email)
    VALUES (NEW.id, NEW.id, 'owner', COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.email);
    PERFORM public.seed_default_cost_categories(NEW.id);
    PERFORM public.seed_default_bar_expense_categories(NEW.id);
    PERFORM public.seed_default_product_categories(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill existing owners
DO $$
DECLARE _o uuid;
BEGIN
  FOR _o IN SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'owner' LOOP
    PERFORM public.seed_default_product_categories(_o);
  END LOOP;
END $$;
