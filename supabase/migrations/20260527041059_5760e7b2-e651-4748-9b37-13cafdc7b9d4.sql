CREATE OR REPLACE FUNCTION public.lojinha_operation_window(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_event RECORD;
  v_now timestamptz := now();
BEGIN
  SELECT user_id INTO v_owner FROM public.lojinha_settings WHERE slug = _slug AND enabled = true LIMIT 1;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Evento ongoing tem prioridade
  SELECT id, name, date, status, auto_open_minutes_before, auto_close_hours_after
    INTO v_event
  FROM public.events
  WHERE user_id = v_owner AND status = 'ongoing'
  ORDER BY date ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'found', true,
      'is_open', true,
      'event_name', v_event.name,
      'event_date', v_event.date,
      'closes_at', v_event.date + ((COALESCE(v_event.auto_close_hours_after, 8) + 1) * interval '1 hour')
    );
  END IF;

  -- Próximo upcoming
  SELECT id, name, date, status, auto_open_minutes_before, auto_close_hours_after
    INTO v_event
  FROM public.events
  WHERE user_id = v_owner AND status = 'upcoming' AND date > v_now - interval '12 hours'
  ORDER BY date ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', true, 'is_open', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'is_open', v_now >= (v_event.date - ((COALESCE(v_event.auto_open_minutes_before, 60)) * interval '1 minute')),
    'event_name', v_event.name,
    'event_date', v_event.date,
    'opens_at', v_event.date - (COALESCE(v_event.auto_open_minutes_before, 60) * interval '1 minute'),
    'closes_at', v_event.date + ((COALESCE(v_event.auto_close_hours_after, 8) + 1) * interval '1 hour')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lojinha_operation_window(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lojinha_operation_window(text) TO anon, authenticated, service_role;