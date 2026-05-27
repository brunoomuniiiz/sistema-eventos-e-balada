CREATE OR REPLACE FUNCTION public.set_owner_pin(_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  _owner uuid := public.get_owner_id(auth.uid());
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _owner THEN
    RAISE EXCEPTION 'Apenas o dono pode definir o PIN';
  END IF;
  IF _pin IS NULL OR length(_pin) = 0 THEN
    UPDATE public.bar_settings SET owner_pin_hash = NULL WHERE user_id = _owner;
    RETURN;
  END IF;
  IF _pin !~ '^[0-9]{4,8}$' THEN
    RAISE EXCEPTION 'PIN deve ter 4 a 8 dígitos';
  END IF;

  INSERT INTO public.bar_settings (user_id, owner_pin_hash)
  VALUES (_owner, extensions.crypt(_pin, extensions.gen_salt('bf', 8)))
  ON CONFLICT (user_id) DO UPDATE SET owner_pin_hash = EXCLUDED.owner_pin_hash, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.grant_via_pin(_pin text, _scope text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  _owner uuid := public.get_owner_id(auth.uid());
  _hash text;
  _token text;
  _name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;
  IF _scope NOT IN ('withdrawal','discount','closing','open_cash','operation','refund','report') THEN
    RAISE EXCEPTION 'Escopo inválido';
  END IF;

  SELECT owner_pin_hash INTO _hash FROM public.bar_settings WHERE user_id = _owner;
  IF _hash IS NULL THEN
    RAISE EXCEPTION 'PIN não cadastrado. Peça ao dono para criar em Configuração.';
  END IF;
  IF extensions.crypt(_pin, _hash) <> _hash THEN
    PERFORM pg_sleep(0.3);
    RAISE EXCEPTION 'PIN incorreto';
  END IF;

  SELECT COALESCE(display_name, email, 'Dono')
    INTO _name FROM public.user_roles WHERE user_id = _owner LIMIT 1;

  _token := encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.auth_grants(user_id, token, authorized_by, authorized_by_name, scope, expires_at)
  VALUES (_owner, _token, _owner, _name, _scope, now() + interval '10 minutes');

  RETURN jsonb_build_object('token', _token, 'authorized_by_name', _name);
END $$;