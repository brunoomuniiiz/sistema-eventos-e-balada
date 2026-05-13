
-- 1. Enum de papéis
CREATE TYPE public.app_role AS ENUM ('owner', 'staff');

-- 2. Tabela user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  role public.app_role NOT NULL DEFAULT 'staff',
  permissions TEXT[] NOT NULL DEFAULT '{}',
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, owner_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Funções auxiliares
CREATE OR REPLACE FUNCTION public.get_owner_id(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT owner_id FROM public.user_roles WHERE user_id = _user_id AND role = 'staff' LIMIT 1),
    _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _owner_id UUID, _permission TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _user_id = _owner_id
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND owner_id = _owner_id
        AND (role = 'owner' OR _permission = ANY(permissions))
    );
$$;

CREATE OR REPLACE FUNCTION public.is_owner_of(_user_id UUID, _owner_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = _owner_id
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND owner_id = _owner_id AND role = 'owner');
$$;

-- 4. RLS user_roles
CREATE POLICY "View own roles or team" ON public.user_roles FOR SELECT
  USING (user_id = auth.uid() OR public.is_owner_of(auth.uid(), owner_id));
CREATE POLICY "Owner manages team insert" ON public.user_roles FOR INSERT
  WITH CHECK (public.is_owner_of(auth.uid(), owner_id));
CREATE POLICY "Owner manages team update" ON public.user_roles FOR UPDATE
  USING (public.is_owner_of(auth.uid(), owner_id));
CREATE POLICY "Owner manages team delete" ON public.user_roles FOR DELETE
  USING (public.is_owner_of(auth.uid(), owner_id) AND role <> 'owner');

CREATE TRIGGER trg_user_roles_updated BEFORE UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Backfill: cada usuário existente vira owner
INSERT INTO public.user_roles (user_id, owner_id, role, permissions, display_name)
SELECT user_id, user_id, 'owner', ARRAY[]::TEXT[], display_name
FROM public.profiles
ON CONFLICT (user_id, owner_id) DO NOTHING;

-- 6. Atualizar handle_new_user para criar role owner
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  -- Se foi criado como staff (via convite), edge function já insere user_roles.
  -- Caso contrário, vira owner.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, owner_id, role, display_name, email)
    VALUES (NEW.id, NEW.id, 'owner', COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.email);
    PERFORM public.seed_default_cost_categories(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- 7. Atualizar RLS de products (permissão: estoque)
DROP POLICY IF EXISTS "Users view own products" ON public.products;
DROP POLICY IF EXISTS "Users insert own products" ON public.products;
DROP POLICY IF EXISTS "Users update own products" ON public.products;
DROP POLICY IF EXISTS "Users delete own products" ON public.products;

CREATE POLICY "View products" ON public.products FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Insert products" ON public.products FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Update products" ON public.products FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'estoque'));
CREATE POLICY "Delete products" ON public.products FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'estoque'));

-- 8. RLS de sales (permissão: vendas)
DROP POLICY IF EXISTS "Users view own sales" ON public.sales;
DROP POLICY IF EXISTS "Users insert own sales" ON public.sales;
DROP POLICY IF EXISTS "Users update own sales" ON public.sales;
DROP POLICY IF EXISTS "Users delete own sales" ON public.sales;

CREATE POLICY "View sales" ON public.sales FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'vendas'));
CREATE POLICY "Insert sales" ON public.sales FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'vendas'));
CREATE POLICY "Update sales" ON public.sales FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'vendas'));
CREATE POLICY "Delete sales" ON public.sales FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'vendas'));

-- 9. RLS de sale_items
DROP POLICY IF EXISTS "Users view own sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Users insert own sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Users update own sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Users delete own sale_items" ON public.sale_items;

CREATE POLICY "View sale_items" ON public.sale_items FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'vendas'));
CREATE POLICY "Insert sale_items" ON public.sale_items FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'vendas'));
CREATE POLICY "Update sale_items" ON public.sale_items FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'vendas'));
CREATE POLICY "Delete sale_items" ON public.sale_items FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'vendas'));

-- 10. RLS de employees (cadastro de funcionários da casa - permissão: funcionarios)
DROP POLICY IF EXISTS "Users view own employees" ON public.employees;
DROP POLICY IF EXISTS "Users insert own employees" ON public.employees;
DROP POLICY IF EXISTS "Users update own employees" ON public.employees;
DROP POLICY IF EXISTS "Users delete own employees" ON public.employees;

CREATE POLICY "View employees" ON public.employees FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'vendas'));
CREATE POLICY "Insert employees" ON public.employees FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'funcionarios'));
CREATE POLICY "Update employees" ON public.employees FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'funcionarios'));
CREATE POLICY "Delete employees" ON public.employees FOR DELETE
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'funcionarios'));
