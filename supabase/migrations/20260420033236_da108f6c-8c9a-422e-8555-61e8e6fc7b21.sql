
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  date TIMESTAMPTZ NOT NULL,
  location TEXT,
  flyer_url TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'finished', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own events" ON public.events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own events" ON public.events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own events" ON public.events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own events" ON public.events FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_events_user_date ON public.events(user_id, date DESC);
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.promoters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 10,
  accumulated_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.promoters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own promoters" ON public.promoters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own promoters" ON public.promoters FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own promoters" ON public.promoters FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own promoters" ON public.promoters FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_promoters_user ON public.promoters(user_id);
CREATE TRIGGER trg_promoters_updated BEFORE UPDATE ON public.promoters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.event_financials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  revenue_drinks NUMERIC(12,2) NOT NULL DEFAULT 0,
  revenue_hookah_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  hookah_share_percent NUMERIC(5,2) NOT NULL DEFAULT 40,
  revenue_door NUMERIC(12,2) NOT NULL DEFAULT 0,
  expenses NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id)
);
ALTER TABLE public.event_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own financials" ON public.event_financials FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own financials" ON public.event_financials FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own financials" ON public.event_financials FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own financials" ON public.event_financials FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_financials_user_event ON public.event_financials(user_id, event_id);
CREATE TRIGGER trg_financials_updated BEFORE UPDATE ON public.event_financials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public) VALUES ('flyers', 'flyers', true);

CREATE POLICY "Flyers are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'flyers');

CREATE POLICY "Users upload own flyers"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'flyers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own flyers"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'flyers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own flyers"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'flyers' AND auth.uid()::text = (storage.foldername(name))[1]);
