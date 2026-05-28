-- Drop existing function to change return type
DROP FUNCTION IF EXISTS public.get_guest_list_info(TEXT);

-- Recreate with more columns, fixing column names
CREATE OR REPLACE FUNCTION public.get_guest_list_info(_slug TEXT)
RETURNS TABLE (
  event_promoter_id UUID,
  event_name TEXT,
  event_date TIMESTAMPTZ,
  event_status TEXT,
  promoter_name TEXT,
  total_entries BIGINT,
  event_description TEXT,
  event_location TEXT,
  event_flyer_url TEXT,
  event_end_date TIMESTAMPTZ,
  event_whatsapp_group_url TEXT,
  show_real_count_when_big BOOLEAN,
  promoter_avatar_url TEXT,
  promoter_instagram TEXT,
  promoter_guest_message TEXT
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
    (SELECT COUNT(*) FROM public.guest_list_entries g WHERE g.event_id = e.id) as total_entries,
    e.description,
    e.location,
    e.flyer_url,
    e.end_date,
    e.whatsapp_group_url,
    e.landing_published as show_real_count_when_big,
    NULL as promoter_avatar_url, -- table doesn't have it yet, returning NULL
    p.instagram_handle as promoter_instagram,
    p.guest_message as promoter_guest_message
  FROM public.event_promoters ep
  JOIN public.events e ON e.id = ep.event_id
  JOIN public.promoters p ON p.id = ep.promoter_id
  WHERE ep.slug = _slug;
$$;

GRANT EXECUTE ON FUNCTION public.get_guest_list_info(TEXT) TO anon, authenticated;

-- Update add_guest_to_list to support companions
CREATE OR REPLACE FUNCTION public.add_guest_to_list_v2(
  _slug TEXT,
  _name TEXT,
  _phone TEXT,
  _gender TEXT,
  _companions JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ep RECORD;
  _new_id UUID;
  _ids UUID[] := '{}';
  _comp JSONB;
  _comp_name TEXT;
  _comp_gender TEXT;
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

  IF _ep.status <> 'upcoming' AND _ep.status <> 'ongoing' AND _ep.status <> 'live' THEN
    RAISE EXCEPTION 'A lista deste evento está fechada';
  END IF;

  -- Insert main guest
  INSERT INTO public.guest_list_entries (user_id, event_id, promoter_id, event_promoter_id, name, phone, gender)
  VALUES (_ep.user_id, _ep.event_id, _ep.promoter_id, _ep.id, trim(_name), nullif(trim(_phone), ''), nullif(trim(_gender), ''))
  RETURNING id INTO _new_id;
  _ids := _ids || _new_id;

  -- Insert companions
  IF _companions IS NOT NULL AND jsonb_array_length(_companions) > 0 THEN
    FOR _comp IN SELECT * FROM jsonb_array_elements(_companions) LOOP
      _comp_name := _comp->>'name';
      _comp_gender := _comp->>'gender';
      IF _comp_name IS NOT NULL AND length(trim(_comp_name)) > 0 THEN
        INSERT INTO public.guest_list_entries (user_id, event_id, promoter_id, event_promoter_id, name, phone, gender)
        VALUES (_ep.user_id, _ep.event_id, _ep.promoter_id, _ep.id, trim(_comp_name), nullif(trim(_phone), ''), nullif(trim(_comp_gender), ''))
        RETURNING id INTO _new_id;
        _ids := _ids || _new_id;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('count', array_length(_ids, 1), 'ids', _ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_guest_to_list_v2(TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
