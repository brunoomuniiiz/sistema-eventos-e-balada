
CREATE TABLE IF NOT EXISTS public.event_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  ticket_type_id uuid,
  gender text,
  amount_paid numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_entries_event_idx ON public.event_entries(event_id);

ALTER TABLE public.event_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View event_entries"
ON public.event_entries FOR SELECT
USING (
  user_id = public.get_owner_id(auth.uid())
  AND (
    public.has_permission(auth.uid(), user_id, 'portaria')
    OR public.has_permission(auth.uid(), user_id, 'vendas')
    OR public.has_permission(auth.uid(), user_id, 'eventos')
    OR public.has_permission(auth.uid(), user_id, 'financeiro')
  )
);

CREATE POLICY "Insert event_entries"
ON public.event_entries FOR INSERT
WITH CHECK (
  user_id = public.get_owner_id(auth.uid())
  AND (
    public.has_permission(auth.uid(), user_id, 'portaria')
    OR public.has_permission(auth.uid(), user_id, 'vendas')
  )
);

CREATE POLICY "Delete event_entries"
ON public.event_entries FOR DELETE
USING (
  user_id = public.get_owner_id(auth.uid())
  AND public.is_owner_of(auth.uid(), user_id)
);

-- Allow portaria staff to update guest_list_entries (for check-in)
DROP POLICY IF EXISTS "Portaria check-in entries" ON public.guest_list_entries;
CREATE POLICY "Portaria check-in entries"
ON public.guest_list_entries FOR UPDATE
USING (
  user_id = public.get_owner_id(auth.uid())
  AND (
    public.has_permission(auth.uid(), user_id, 'portaria')
    OR public.is_owner_of(auth.uid(), user_id)
  )
);

DROP POLICY IF EXISTS "Portaria view entries" ON public.guest_list_entries;
CREATE POLICY "Portaria view entries"
ON public.guest_list_entries FOR SELECT
USING (
  user_id = public.get_owner_id(auth.uid())
  AND (
    public.has_permission(auth.uid(), user_id, 'portaria')
    OR public.is_owner_of(auth.uid(), user_id)
  )
);

-- Check-in / undo
CREATE OR REPLACE FUNCTION public.checkin_guest(_entry_id uuid, _checked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT (public.has_permission(auth.uid(), _owner, 'portaria') OR public.is_owner_of(auth.uid(), _owner)) THEN
    RAISE EXCEPTION 'Sem permissão de portaria';
  END IF;

  UPDATE public.guest_list_entries
  SET checked_in = _checked,
      checked_in_at = CASE WHEN _checked THEN now() ELSE NULL END
  WHERE id = _entry_id AND user_id = _owner;
END;
$$;

-- Summary for portaria report
CREATE OR REPLACE FUNCTION public.get_portaria_summary(_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _list_total integer := 0;
  _list_in integer := 0;
  _paying_count integer := 0;
  _paying_value numeric := 0;
  _list_male integer := 0;
  _list_female integer := 0;
  _list_in_male integer := 0;
  _list_in_female integer := 0;
  _paying_male integer := 0;
  _paying_female integer := 0;
BEGIN
  _owner := public.get_owner_id(auth.uid());

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE checked_in),
    COUNT(*) FILTER (WHERE gender = 'M'),
    COUNT(*) FILTER (WHERE gender = 'F'),
    COUNT(*) FILTER (WHERE checked_in AND gender = 'M'),
    COUNT(*) FILTER (WHERE checked_in AND gender = 'F')
  INTO _list_total, _list_in, _list_male, _list_female, _list_in_male, _list_in_female
  FROM public.guest_list_entries
  WHERE event_id = _event_id AND user_id = _owner;

  SELECT
    COUNT(*), COALESCE(SUM(amount_paid),0),
    COUNT(*) FILTER (WHERE gender = 'M'),
    COUNT(*) FILTER (WHERE gender = 'F')
  INTO _paying_count, _paying_value, _paying_male, _paying_female
  FROM public.event_entries
  WHERE event_id = _event_id AND user_id = _owner;

  RETURN jsonb_build_object(
    'list_total', _list_total,
    'list_checked_in', _list_in,
    'list_male', _list_male,
    'list_female', _list_female,
    'list_in_male', _list_in_male,
    'list_in_female', _list_in_female,
    'paying_count', _paying_count,
    'paying_value', _paying_value,
    'paying_male', _paying_male,
    'paying_female', _paying_female,
    'total_in', _list_in + _paying_count
  );
END;
$$;
