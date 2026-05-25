-- ============================================================
-- 1) PIN de operação do dono
-- ============================================================
ALTER TABLE public.bar_settings
  ADD COLUMN IF NOT EXISTS owner_pin_hash text NULL;

-- Cadastra/troca/remove PIN. Só o owner do workspace pode.
CREATE OR REPLACE FUNCTION public.set_owner_pin(_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  VALUES (_owner, crypt(_pin, gen_salt('bf', 8)))
  ON CONFLICT (user_id) DO UPDATE SET owner_pin_hash = EXCLUDED.owner_pin_hash, updated_at = now();
END $$;

-- Saber se já existe PIN cadastrado (sem revelar o hash)
CREATE OR REPLACE FUNCTION public.has_owner_pin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bar_settings
    WHERE user_id = public.get_owner_id(auth.uid())
      AND owner_pin_hash IS NOT NULL
  );
$$;

-- Verifica PIN do owner e emite auth_grant para a operação.
-- Pode ser chamada por qualquer membro autenticado da equipe.
CREATE OR REPLACE FUNCTION public.grant_via_pin(_pin text, _scope text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF crypt(_pin, _hash) <> _hash THEN
    -- pequeno atraso pra mitigar brute force
    PERFORM pg_sleep(0.3);
    RAISE EXCEPTION 'PIN incorreto';
  END IF;

  SELECT COALESCE(display_name, email, 'Dono')
    INTO _name FROM public.user_roles WHERE user_id = _owner LIMIT 1;

  _token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.auth_grants(user_id, token, authorized_by, authorized_by_name, scope, expires_at)
  VALUES (_owner, _token, _owner, _name, _scope, now() + interval '10 minutes');

  RETURN jsonb_build_object('token', _token, 'authorized_by_name', _name);
END $$;

-- ============================================================
-- 2) Carrinho da portaria (vários ingressos + split de pagamento)
-- ============================================================
-- _items:    [{ "ticket_type_id": uuid|null, "gender": text|null, "amount": numeric, "qty": int }]
-- _payments: [{ "method": "dinheiro|debito|credito|pix", "amount": numeric }]
CREATE OR REPLACE FUNCTION public.register_event_entry_cart(
  _event_id uuid,
  _items jsonb,
  _payments jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid := public.get_owner_id(auth.uid());
  _session uuid;
  _sale_id uuid;
  _name text;
  _item jsonb;
  _pay jsonb;
  _total numeric := 0;
  _paid numeric := 0;
  _primary_method text;
  _i int;
  _qty int;
BEGIN
  IF NOT (public.has_permission(auth.uid(), _owner, 'portaria')
          OR public.has_permission(auth.uid(), _owner, 'vendas')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;
  IF jsonb_typeof(_payments) <> 'array' OR jsonb_array_length(_payments) = 0 THEN
    RAISE EXCEPTION 'Informe pelo menos um pagamento';
  END IF;

  -- totais
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := COALESCE((_item->>'qty')::int, 1);
    IF _qty < 1 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
    _total := _total + (COALESCE((_item->>'amount')::numeric, 0) * _qty);
  END LOOP;
  FOR _pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    IF (_pay->>'method') NOT IN ('dinheiro','debito','credito','pix') THEN
      RAISE EXCEPTION 'Forma de pagamento inválida';
    END IF;
    _paid := _paid + COALESCE((_pay->>'amount')::numeric, 0);
  END LOOP;
  IF abs(_paid - _total) > 0.01 THEN
    RAISE EXCEPTION 'Pagamento (%) diferente do total (%)', _paid, _total;
  END IF;

  SELECT id INTO _session FROM public.cash_sessions
   WHERE opened_by = auth.uid() AND status = 'open' LIMIT 1;
  IF _session IS NULL THEN
    RAISE EXCEPTION 'Abra o caixa antes de registrar entradas';
  END IF;

  SELECT COALESCE(display_name, email) INTO _name
    FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  -- método "principal" da venda = maior valor
  SELECT (p->>'method') INTO _primary_method
  FROM jsonb_array_elements(_payments) p
  ORDER BY (p->>'amount')::numeric DESC
  LIMIT 1;

  INSERT INTO public.sales (user_id, total, payment_method, category, session_id,
                            employee_id, employee_name, event_id)
  VALUES (_owner, _total, _primary_method, 'entrada', _session,
          auth.uid(), _name, _event_id)
  RETURNING id INTO _sale_id;

  -- split
  FOR _pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    INSERT INTO public.sale_payments(user_id, sale_id, amount, method)
    VALUES (_owner, _sale_id, COALESCE((_pay->>'amount')::numeric, 0), _pay->>'method');
  END LOOP;

  -- 1 event_entry por unidade do carrinho
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := COALESCE((_item->>'qty')::int, 1);
    FOR _i IN 1.._qty LOOP
      INSERT INTO public.event_entries
        (user_id, event_id, ticket_type_id, gender, amount_paid,
         created_by, created_by_name, session_id, sale_id, payment_method)
      VALUES
        (_owner, _event_id,
         NULLIF(_item->>'ticket_type_id','')::uuid,
         NULLIF(_item->>'gender',''),
         COALESCE((_item->>'amount')::numeric, 0),
         auth.uid(), _name, _session, _sale_id, _primary_method);
    END LOOP;
  END LOOP;

  RETURN _sale_id;
END $$;

-- ============================================================
-- 3) Estorno de venda da portaria (total ou parcial por valor)
-- ============================================================
-- _amount = NULL -> estorno total
CREATE OR REPLACE FUNCTION public.refund_event_sale(
  _sale_id uuid,
  _amount numeric,
  _reason text,
  _grant_token text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid := public.get_owner_id(auth.uid());
  _sale public.sales%ROWTYPE;
  _grant public.auth_grants%ROWTYPE;
  _refund_amt numeric;
  _name text;
BEGIN
  IF NOT (public.has_permission(auth.uid(), _owner, 'portaria')
          OR public.has_permission(auth.uid(), _owner, 'vendas')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO _grant FROM public.auth_grants
   WHERE token = _grant_token AND user_id = _owner
     AND scope IN ('operation','refund') AND used = false AND expires_at > now()
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Autorização inválida ou expirada';
  END IF;

  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id AND user_id = _owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;
  IF _sale.category <> 'entrada' THEN RAISE EXCEPTION 'Estorno desta tela é só de entradas de portaria'; END IF;
  IF _sale.status = 'cancelled' THEN RAISE EXCEPTION 'Venda já estornada'; END IF;

  _refund_amt := COALESCE(_amount, _sale.total);
  IF _refund_amt <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF _refund_amt > _sale.total + 0.01 THEN RAISE EXCEPTION 'Valor maior que a venda'; END IF;

  SELECT COALESCE(display_name, email) INTO _name FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  -- Total: cancela tudo, apaga as entradas e marca a sale
  IF abs(_refund_amt - _sale.total) < 0.01 THEN
    DELETE FROM public.event_entries WHERE sale_id = _sale_id;
    UPDATE public.sales
      SET status = 'cancelled',
          cancelled_at = now(),
          cancelled_by = auth.uid(),
          cancelled_by_name = _name,
          cancelled_reason = COALESCE(_reason, 'Estorno total')
     WHERE id = _sale_id;
  ELSE
    -- Parcial: registra venda "espelho" negativa pra ajustar caixa e financeiro
    INSERT INTO public.sales (user_id, total, payment_method, category, session_id,
                              employee_id, employee_name, event_id, notes, status)
    VALUES (_owner, -_refund_amt, _sale.payment_method, 'entrada', _sale.session_id,
            auth.uid(), _name, _sale.event_id,
            'Estorno parcial de ' || _sale_id::text || ' — ' || COALESCE(_reason,''),
            'completed');

    INSERT INTO public.sale_payments(user_id, sale_id, amount, method)
    SELECT _owner, currval(pg_get_serial_sequence('public.sales','id')), -_refund_amt, _sale.payment_method
    WHERE false; -- sales.id é uuid, então usamos abaixo
  END IF;

  UPDATE public.auth_grants SET used = true WHERE id = _grant.id;
END $$;

-- Reescrita simples do estorno parcial sem currval (id é uuid)
CREATE OR REPLACE FUNCTION public.refund_event_sale(
  _sale_id uuid,
  _amount numeric,
  _reason text,
  _grant_token text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid := public.get_owner_id(auth.uid());
  _sale public.sales%ROWTYPE;
  _grant public.auth_grants%ROWTYPE;
  _refund_amt numeric;
  _name text;
  _refund_sale_id uuid;
BEGIN
  IF NOT (public.has_permission(auth.uid(), _owner, 'portaria')
          OR public.has_permission(auth.uid(), _owner, 'vendas')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT * INTO _grant FROM public.auth_grants
   WHERE token = _grant_token AND user_id = _owner
     AND scope IN ('operation','refund') AND used = false AND expires_at > now()
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Autorização inválida ou expirada';
  END IF;

  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id AND user_id = _owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;
  IF _sale.category <> 'entrada' THEN RAISE EXCEPTION 'Estorno desta tela é só de entradas de portaria'; END IF;
  IF _sale.status = 'cancelled' THEN RAISE EXCEPTION 'Venda já estornada'; END IF;

  _refund_amt := COALESCE(_amount, _sale.total);
  IF _refund_amt <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF _refund_amt > _sale.total + 0.01 THEN RAISE EXCEPTION 'Valor maior que a venda'; END IF;

  SELECT COALESCE(display_name, email) INTO _name FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  IF abs(_refund_amt - _sale.total) < 0.01 THEN
    DELETE FROM public.event_entries WHERE sale_id = _sale_id;
    UPDATE public.sales
      SET status = 'cancelled',
          cancelled_at = now(),
          cancelled_by = auth.uid(),
          cancelled_by_name = _name,
          cancelled_reason = COALESCE(_reason, 'Estorno total')
     WHERE id = _sale_id;
  ELSE
    INSERT INTO public.sales (user_id, total, payment_method, category, session_id,
                              employee_id, employee_name, event_id, notes, status)
    VALUES (_owner, -_refund_amt, _sale.payment_method, 'entrada', _sale.session_id,
            auth.uid(), _name, _sale.event_id,
            'Estorno parcial: ' || COALESCE(_reason,''),
            'completed')
    RETURNING id INTO _refund_sale_id;

    INSERT INTO public.sale_payments(user_id, sale_id, amount, method)
    VALUES (_owner, _refund_sale_id, -_refund_amt, _sale.payment_method);
  END IF;

  UPDATE public.auth_grants SET used = true WHERE id = _grant.id;
END $$;

-- ============================================================
-- 4) Histórico de vendas da portaria
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_portaria_sales(_event_id uuid)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  total numeric,
  status text,
  employee_name text,
  cancelled_at timestamptz,
  cancelled_reason text,
  items jsonb,
  payments jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.id, s.created_at, s.total, s.status, s.employee_name,
    s.cancelled_at, s.cancelled_reason,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'gender', e.gender, 'amount', e.amount_paid,
        'ticket_type_id', e.ticket_type_id
      ) ORDER BY e.created_at)
      FROM public.event_entries e WHERE e.sale_id = s.id
    ), '[]'::jsonb) AS items,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('method', p.method, 'amount', p.amount))
      FROM public.sale_payments p WHERE p.sale_id = s.id
    ), '[]'::jsonb) AS payments
  FROM public.sales s
  WHERE s.user_id = public.get_owner_id(auth.uid())
    AND s.event_id = _event_id
    AND s.category = 'entrada'
    AND (public.has_permission(auth.uid(), s.user_id, 'portaria')
         OR public.has_permission(auth.uid(), s.user_id, 'vendas'))
  ORDER BY s.created_at DESC
  LIMIT 500;
$$;
