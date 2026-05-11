DROP FUNCTION IF EXISTS public.get_guest_list_info(text);

CREATE OR REPLACE FUNCTION public.get_guest_list_info(_slug text)
 RETURNS TABLE(event_promoter_id uuid, event_name text, event_date timestamp with time zone, event_status text, event_location text, event_flyer_url text, promoter_name text, promoter_phone text, total_entries bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    ep.id,
    e.name,
    e.date,
    e.status,
    e.location,
    e.flyer_url,
    p.name,
    p.phone,
    (SELECT COUNT(*) FROM public.guest_list_entries g WHERE g.event_promoter_id = ep.id)
  FROM public.event_promoters ep
  JOIN public.events e ON e.id = ep.event_id
  JOIN public.promoters p ON p.id = ep.promoter_id
  WHERE ep.slug = _slug;
$function$;