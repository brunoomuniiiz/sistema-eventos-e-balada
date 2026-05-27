ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS end_date timestamptz,
  ADD COLUMN IF NOT EXISTS show_real_count_when_big boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.get_guest_list_info(text);

CREATE OR REPLACE FUNCTION public.get_guest_list_info(_slug text)
 RETURNS TABLE(
   event_promoter_id uuid,
   event_name text,
   event_date timestamp with time zone,
   event_end_date timestamp with time zone,
   event_status text,
   event_location text,
   event_flyer_url text,
   event_whatsapp_group_url text,
   show_real_count_when_big boolean,
   promoter_name text,
   promoter_phone text,
   total_entries bigint
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    ep.id,
    e.name,
    e.date,
    e.end_date,
    e.status,
    e.location,
    e.flyer_url,
    e.whatsapp_group_url,
    e.show_real_count_when_big,
    p.name,
    p.phone,
    (SELECT COUNT(*) FROM public.guest_list_entries g WHERE g.event_promoter_id = ep.id)
  FROM public.event_promoters ep
  JOIN public.events e ON e.id = ep.event_id
  JOIN public.promoters p ON p.id = ep.promoter_id
  WHERE ep.slug = _slug;
$function$;

GRANT EXECUTE ON FUNCTION public.get_guest_list_info(text) TO anon, authenticated;