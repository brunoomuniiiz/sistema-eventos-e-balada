CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.set_owner_pin(_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _owner uuid := public.get_owner_id(auth.uid());
BEGIN
  IF _owner IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF auth.uid() <> _owner THEN
    RAISE EXCEPTION 'Apenas o proprietário pode definir o PIN';
  END IF;

  IF _pin IS NULL OR _pin = '' THEN
    DELETE FROM public.owner_pins WHERE owner_id = _owner;
    RETURN;
  END IF;

  INSERT INTO public.owner_pins (owner_id, pin_hash)
  VALUES (_owner, extensions.crypt(_pin, extensions.gen_salt('bf', 8)))
  ON CONFLICT (owner_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_via_pin(_pin text, _scope text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _owner uuid := public.get_owner_id(auth.uid());
  _hash text;
  _token text;
  _name text;
BEGIN
  IF _owner IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT pin_hash INTO _hash FROM public.owner_pins WHERE owner_id = _owner;
  IF _hash IS NULL THEN
    RAISE EXCEPTION 'PIN não configurado';
  END IF;

  IF extensions.crypt(_pin, _hash) <> _hash THEN
    RAISE EXCEPTION 'PIN inválido';
  END IF;

  SELECT COALESCE(full_name, email, 'Proprietário') INTO _name
  FROM public.profiles WHERE id = _owner;

  _token := encode(extensions.gen_random_bytes(16), 'hex');
  RETURN jsonb_build_object('token', _token, 'authorized_by_name', COALESCE(_name, 'Proprietário'));
END;
$$;