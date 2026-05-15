ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role_preset text;
ALTER TABLE public.cash_sessions ADD COLUMN IF NOT EXISTS event_id uuid;

UPDATE public.products SET track_stock = false WHERE product_type = 'combo';

CREATE OR REPLACE FUNCTION public.start_event(_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _owner uuid;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT (public.has_permission(auth.uid(), _owner, 'eventos') OR public.is_owner_of(auth.uid(), _owner)) THEN
    RAISE EXCEPTION 'Sem permissão de eventos';
  END IF;
  UPDATE public.events SET status = 'live', updated_at = now()
  WHERE id = _event_id AND user_id = _owner AND status = 'upcoming';
END $$;

CREATE OR REPLACE FUNCTION public.open_cash_session(_opening numeric, _notes text DEFAULT NULL, _event_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _name text;
  _existing uuid;
  _id uuid;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), _owner, 'vendas') THEN
    RAISE EXCEPTION 'Sem permissão de vendas';
  END IF;

  SELECT id INTO _existing FROM public.cash_sessions
  WHERE opened_by = auth.uid() AND status = 'open' LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT COALESCE(display_name, email) INTO _name
  FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.cash_sessions (user_id, opened_by, opened_by_name, opening_amount, opening_notes, event_id)
  VALUES (_owner, auth.uid(), _name, COALESCE(_opening, 0), _notes, _event_id)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_open_session()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _wd numeric := 0;
  _sales numeric := 0;
  _ev_name text;
BEGIN
  SELECT * INTO _row FROM public.cash_sessions
  WHERE opened_by = auth.uid() AND status = 'open' LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(amount),0) INTO _wd FROM public.cash_withdrawals WHERE session_id = _row.id;
  SELECT COALESCE(SUM(total),0) INTO _sales FROM public.sales WHERE session_id = _row.id;
  IF _row.event_id IS NOT NULL THEN
    SELECT name INTO _ev_name FROM public.events WHERE id = _row.event_id;
  END IF;

  RETURN jsonb_build_object(
    'id', _row.id,
    'opening_amount', _row.opening_amount,
    'opened_at', _row.opened_at,
    'opening_notes', _row.opening_notes,
    'withdrawals_total', _wd,
    'sales_total', _sales,
    'event_id', _row.event_id,
    'event_name', _ev_name
  );
END $$;