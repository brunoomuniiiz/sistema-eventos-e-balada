-- Alterar tabela event_promoters para suportar categorias e nomes personalizados
ALTER TABLE public.event_promoters 
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'promoter' CHECK (category IN ('casa', 'atracao', 'promoter')),
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Remover função anterior para poder mudar o retorno
DROP FUNCTION IF EXISTS public.get_guest_list_info(text);

-- Recriar RPC de informações da lista para incluir categoria e display_name
CREATE OR REPLACE FUNCTION public.get_guest_list_info(_slug text)
RETURNS TABLE (
  event_id uuid,
  event_name text,
  event_date timestamp with time zone,
  event_location text,
  event_description text,
  event_status text,
  event_flyer_url text,
  event_end_date timestamp with time zone,
  event_whatsapp_group_url text,
  show_real_count_when_big boolean,
  promoter_name text,
  promoter_avatar_url text,
  promoter_instagram text,
  promoter_guest_message text,
  total_entries bigint,
  category text,
  display_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as event_id,
    e.name as event_name,
    e.date as event_date,
    e.location as event_location,
    e.description as event_description,
    e.status as event_status,
    e.flyer_url as event_flyer_url,
    e.end_date as event_end_date,
    e.whatsapp_group_url as event_whatsapp_group_url,
    e.show_real_count_when_big,
    COALESCE(ep.display_name, p.name, 'Casa') as promoter_name,
    p.avatar_url as promoter_avatar_url,
    p.instagram_handle as promoter_instagram,
    p.guest_message as promoter_guest_message,
    (SELECT count(*) FROM guest_list_entries gle WHERE gle.event_promoter_id = ep.id) as total_entries,
    ep.category,
    ep.display_name
  FROM event_promoters ep
  JOIN events e ON e.id = ep.event_id
  LEFT JOIN promoters p ON p.id = ep.promoter_id
  WHERE ep.slug = _slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para gerar links automáticos ao criar um evento
CREATE OR REPLACE FUNCTION public.handle_auto_generate_event_links()
RETURNS TRIGGER AS $$
DECLARE
    owner_id UUID;
BEGIN
    -- Pegar o user_id do dono do evento
    owner_id := NEW.user_id;

    -- Casa - WhatsApp
    INSERT INTO public.event_promoters (event_id, user_id, category, display_name, slug, promoter_id)
    VALUES (NEW.id, owner_id, 'casa', 'Casa - WhatsApp', encode(gen_random_bytes(6), 'hex'), null);

    -- Casa - Instagram
    INSERT INTO public.event_promoters (event_id, user_id, category, display_name, slug, promoter_id)
    VALUES (NEW.id, owner_id, 'casa', 'Casa - Instagram', encode(gen_random_bytes(6), 'hex'), null);

    -- Banda
    INSERT INTO public.event_promoters (event_id, user_id, category, display_name, slug, promoter_id)
    VALUES (NEW.id, owner_id, 'atracao', 'Banda', encode(gen_random_bytes(6), 'hex'), null);

    -- DJ 1
    INSERT INTO public.event_promoters (event_id, user_id, category, display_name, slug, promoter_id)
    VALUES (NEW.id, owner_id, 'atracao', 'DJ 1', encode(gen_random_bytes(6), 'hex'), null);

    -- DJ 2
    INSERT INTO public.event_promoters (event_id, user_id, category, display_name, slug, promoter_id)
    VALUES (NEW.id, owner_id, 'atracao', 'DJ 2', encode(gen_random_bytes(6), 'hex'), null);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para execução automática
DROP TRIGGER IF EXISTS trigger_auto_generate_links ON public.events;
CREATE TRIGGER trigger_auto_generate_links
AFTER INSERT ON public.events
FOR EACH ROW EXECUTE FUNCTION public.handle_auto_generate_event_links();
