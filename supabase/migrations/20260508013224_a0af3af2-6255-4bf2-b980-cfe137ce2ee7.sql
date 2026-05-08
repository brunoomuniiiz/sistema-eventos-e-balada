
-- Tabela que vincula promoter ao evento com slug público
CREATE TABLE public.event_promoters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_id UUID NOT NULL,
  promoter_id UUID NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, promoter_id)
);

ALTER TABLE public.event_promoters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner view" ON public.event_promoters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner insert" ON public.event_promoters FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner update" ON public.event_promoters FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owner delete" ON public.event_promoters FOR DELETE USING (auth.uid() = user_id);

-- Convidados na lista
CREATE TABLE public.guest_list_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_id UUID NOT NULL,
  promoter_id UUID NOT NULL,
  event_promoter_id UUID NOT NULL REFERENCES public.event_promoters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  gender TEXT,
  checked_in BOOLEAN NOT NULL DEFAULT false,
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gle_event ON public.guest_list_entries(event_id);
CREATE INDEX idx_gle_promoter ON public.guest_list_entries(promoter_id);
CREATE INDEX idx_gle_event_promoter ON public.guest_list_entries(event_promoter_id);

ALTER TABLE public.guest_list_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner view entries" ON public.guest_list_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner update entries" ON public.guest_list_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owner delete entries" ON public.guest_list_entries FOR DELETE USING (auth.uid() = user_id);

-- Funções públicas (acesso anônimo via slug)
CREATE OR REPLACE FUNCTION public.get_guest_list_info(_slug TEXT)
RETURNS TABLE (
  event_promoter_id UUID,
  event_name TEXT,
  event_date TIMESTAMPTZ,
  event_status TEXT,
  promoter_name TEXT,
  total_entries BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ep.id,
    e.name,
    e.date,
    e.status,
    p.name,
    (SELECT COUNT(*) FROM public.guest_list_entries g WHERE g.event_promoter_id = ep.id)
  FROM public.event_promoters ep
  JOIN public.events e ON e.id = ep.event_id
  JOIN public.promoters p ON p.id = ep.promoter_id
  WHERE ep.slug = _slug;
$$;

CREATE OR REPLACE FUNCTION public.add_guest_to_list(
  _slug TEXT,
  _name TEXT,
  _phone TEXT,
  _gender TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ep RECORD;
  _new_id UUID;
BEGIN
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'Nome é obrigatório';
  END IF;

  SELECT ep.id, ep.user_id, ep.event_id, ep.promoter_id, e.status
  INTO _ep
  FROM public.event_promoters ep
  JOIN public.events e ON e.id = ep.event_id
  WHERE ep.slug = _slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista não encontrada';
  END IF;

  IF _ep.status <> 'upcoming' THEN
    RAISE EXCEPTION 'A lista deste evento está fechada';
  END IF;

  INSERT INTO public.guest_list_entries (user_id, event_id, promoter_id, event_promoter_id, name, phone, gender)
  VALUES (_ep.user_id, _ep.event_id, _ep.promoter_id, _ep.id, trim(_name), nullif(trim(_phone), ''), nullif(trim(_gender), ''))
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_guest_list_info(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_guest_to_list(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
