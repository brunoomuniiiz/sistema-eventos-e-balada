
-- =========================================
-- Suppliers
-- =========================================
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View suppliers" ON public.suppliers FOR SELECT
USING (user_id = public.get_owner_id(auth.uid())
  AND (public.has_permission(auth.uid(), user_id, 'financeiro')
    OR public.has_permission(auth.uid(), user_id, 'estoque')));

CREATE POLICY "Insert suppliers" ON public.suppliers FOR INSERT
WITH CHECK (user_id = public.get_owner_id(auth.uid())
  AND (public.has_permission(auth.uid(), user_id, 'financeiro')
    OR public.has_permission(auth.uid(), user_id, 'estoque')));

CREATE POLICY "Update suppliers" ON public.suppliers FOR UPDATE
USING (user_id = public.get_owner_id(auth.uid())
  AND (public.has_permission(auth.uid(), user_id, 'financeiro')
    OR public.has_permission(auth.uid(), user_id, 'estoque')));

CREATE POLICY "Delete suppliers" ON public.suppliers FOR DELETE
USING (user_id = public.get_owner_id(auth.uid())
  AND public.is_owner_of(auth.uid(), user_id));

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- Bar expense categories
-- =========================================
CREATE TABLE public.bar_expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('fixed','variable')),
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, name)
);
ALTER TABLE public.bar_expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View bar_expense_categories" ON public.bar_expense_categories FOR SELECT
USING (user_id = public.get_owner_id(auth.uid())
  AND public.has_permission(auth.uid(), user_id, 'financeiro'));

CREATE POLICY "Insert bar_expense_categories" ON public.bar_expense_categories FOR INSERT
WITH CHECK (user_id = public.get_owner_id(auth.uid())
  AND public.has_permission(auth.uid(), user_id, 'financeiro'));

CREATE POLICY "Update bar_expense_categories" ON public.bar_expense_categories FOR UPDATE
USING (user_id = public.get_owner_id(auth.uid())
  AND public.has_permission(auth.uid(), user_id, 'financeiro'));

CREATE POLICY "Delete bar_expense_categories" ON public.bar_expense_categories FOR DELETE
USING (user_id = public.get_owner_id(auth.uid())
  AND public.is_owner_of(auth.uid(), user_id));

CREATE TRIGGER update_bar_expense_categories_updated_at BEFORE UPDATE ON public.bar_expense_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- Bar expenses
-- =========================================
CREATE TABLE public.bar_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('fixed','variable')),
  category_id uuid,
  category_name text NOT NULL,
  supplier_id uuid,
  supplier_name text,
  amount numeric NOT NULL DEFAULT 0,
  description text,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  payment_method text,
  paid boolean NOT NULL DEFAULT true,
  paid_at timestamptz,
  recurrence text NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once','monthly')),
  recurrence_parent_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bar_expenses ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_bar_expenses_user_date ON public.bar_expenses (user_id, expense_date DESC);
CREATE INDEX idx_bar_expenses_kind ON public.bar_expenses (user_id, kind);

CREATE POLICY "View bar_expenses" ON public.bar_expenses FOR SELECT
USING (user_id = public.get_owner_id(auth.uid())
  AND public.has_permission(auth.uid(), user_id, 'financeiro'));

CREATE POLICY "Insert bar_expenses" ON public.bar_expenses FOR INSERT
WITH CHECK (user_id = public.get_owner_id(auth.uid())
  AND public.has_permission(auth.uid(), user_id, 'financeiro'));

CREATE POLICY "Update bar_expenses" ON public.bar_expenses FOR UPDATE
USING (user_id = public.get_owner_id(auth.uid())
  AND public.has_permission(auth.uid(), user_id, 'financeiro'));

CREATE POLICY "Delete bar_expenses" ON public.bar_expenses FOR DELETE
USING (user_id = public.get_owner_id(auth.uid())
  AND public.has_permission(auth.uid(), user_id, 'financeiro'));

CREATE TRIGGER update_bar_expenses_updated_at BEFORE UPDATE ON public.bar_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- Seed defaults function + backfill
-- =========================================
CREATE OR REPLACE FUNCTION public.seed_default_bar_expense_categories(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.bar_expense_categories (user_id, name, kind, icon, sort_order, is_default) VALUES
    (_user_id, 'Aluguel',     'fixed',    'home',     1, true),
    (_user_id, 'Água',        'fixed',    'droplet',  2, true),
    (_user_id, 'Luz',         'fixed',    'zap',      3, true),
    (_user_id, 'Internet',    'fixed',    'wifi',     4, true),
    (_user_id, 'Bebidas',     'variable', 'wine',     1, true),
    (_user_id, 'Insumos',     'variable', 'package',  2, true),
    (_user_id, 'Manutenção',  'variable', 'wrench',   3, true)
  ON CONFLICT (user_id, kind, name) DO NOTHING;
END $$;

-- Backfill para donos existentes
INSERT INTO public.bar_expense_categories (user_id, name, kind, icon, sort_order, is_default)
SELECT ur.user_id, c.name, c.kind, c.icon, c.sort_order, true
FROM public.user_roles ur
CROSS JOIN (VALUES
  ('Aluguel','fixed','home',1),
  ('Água','fixed','droplet',2),
  ('Luz','fixed','zap',3),
  ('Internet','fixed','wifi',4),
  ('Bebidas','variable','wine',1),
  ('Insumos','variable','package',2),
  ('Manutenção','variable','wrench',3)
) AS c(name, kind, icon, sort_order)
WHERE ur.role = 'owner'
ON CONFLICT (user_id, kind, name) DO NOTHING;

-- Atualiza handle_new_user para semear também
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, owner_id, role, display_name, email)
    VALUES (NEW.id, NEW.id, 'owner', COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.email);
    PERFORM public.seed_default_cost_categories(NEW.id);
    PERFORM public.seed_default_bar_expense_categories(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;
