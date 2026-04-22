
-- 1. Add CMV field to event_financials
ALTER TABLE public.event_financials
  ADD COLUMN IF NOT EXISTS bar_cmv numeric NOT NULL DEFAULT 0;

-- 2. Create cost_categories table
CREATE TABLE public.cost_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  icon text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.cost_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own categories" ON public.cost_categories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own categories" ON public.cost_categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own categories" ON public.cost_categories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own categories" ON public.cost_categories
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_cost_categories_updated_at
  BEFORE UPDATE ON public.cost_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Create event_costs table
CREATE TABLE public.event_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.cost_categories(id) ON DELETE SET NULL,
  category_name text NOT NULL,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_costs_event ON public.event_costs(event_id);
CREATE INDEX idx_event_costs_user ON public.event_costs(user_id);

ALTER TABLE public.event_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own costs" ON public.event_costs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own costs" ON public.event_costs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own costs" ON public.event_costs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own costs" ON public.event_costs
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_event_costs_updated_at
  BEFORE UPDATE ON public.event_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Function to seed default categories
CREATE OR REPLACE FUNCTION public.seed_default_cost_categories(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.cost_categories (user_id, name, icon, is_default) VALUES
    (_user_id, 'Segurança', 'shield', true),
    (_user_id, 'Funcionário', 'users', true),
    (_user_id, 'DJ', 'disc-3', true),
    (_user_id, 'Banda', 'music', true),
    (_user_id, 'Serviço de Som', 'speaker', true),
    (_user_id, 'Serviço de Mídia', 'video', true),
    (_user_id, 'Lanche', 'utensils', true),
    (_user_id, 'Bebidas', 'wine', true)
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

-- 5. Update handle_new_user to also seed categories
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  
  PERFORM public.seed_default_cost_categories(NEW.id);
  
  RETURN NEW;
END;
$$;

-- 6. Seed for any existing users that don't have categories yet
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM public.profiles LOOP
    PERFORM public.seed_default_cost_categories(u.user_id);
  END LOOP;
END $$;
