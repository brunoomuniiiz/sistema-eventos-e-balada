
-- ============= Tabelas =============
CREATE TABLE public.event_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL,
  staff_name text,
  cash_expected numeric NOT NULL DEFAULT 0,
  cash_counted numeric NOT NULL DEFAULT 0,
  cash_diff numeric NOT NULL DEFAULT 0,
  pix_qr_total numeric NOT NULL DEFAULT 0,
  pix_chave_confirmed_total numeric NOT NULL DEFAULT 0,
  pix_chave_refunded_total numeric NOT NULL DEFAULT 0,
  pix_chave_refunded_sale_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_system numeric NOT NULL DEFAULT 0,
  total_reported numeric NOT NULL DEFAULT 0,
  notes text,
  closed_by uuid,
  closed_by_name text,
  closed_at timestamptz NOT NULL DEFAULT now(),
  reopened_at timestamptz,
  reopened_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, staff_user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_closings TO authenticated;
GRANT ALL ON public.event_closings TO service_role;

ALTER TABLE public.event_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View event_closings" ON public.event_closings FOR SELECT TO authenticated
  USING (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));
CREATE POLICY "Insert event_closings" ON public.event_closings FOR INSERT TO authenticated
  WITH CHECK (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));
CREATE POLICY "Update event_closings" ON public.event_closings FOR UPDATE TO authenticated
  USING (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));
CREATE POLICY "Delete event_closings" ON public.event_closings FOR DELETE TO authenticated
  USING (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));

CREATE TABLE public.event_closing_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.event_closings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  terminal_id uuid NOT NULL REFERENCES public.payment_terminals(id) ON DELETE CASCADE,
  terminal_label text,
  system_total numeric NOT NULL DEFAULT 0,
  reported_total numeric NOT NULL DEFAULT 0,
  diff numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(closing_id, terminal_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_closing_terminals TO authenticated;
GRANT ALL ON public.event_closing_terminals TO service_role;

ALTER TABLE public.event_closing_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage event_closing_terminals" ON public.event_closing_terminals FOR ALL TO authenticated
  USING (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id))
  WITH CHECK (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));

CREATE INDEX idx_event_closings_event ON public.event_closings(event_id);
CREATE INDEX idx_event_closing_terminals_closing ON public.event_closing_terminals(closing_id);

-- ============= RPCs =============

-- Lista funcionários que operaram no evento + status do fechamento
CREATE OR REPLACE FUNCTION public.get_event_staff_to_close(_event_id uuid)
RETURNS TABLE (
  staff_user_id uuid,
  staff_name text,
  accepts_cash boolean,
  total_system numeric,
  closing_id uuid,
  closed_at timestamptz,
  total_reported numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid := get_owner_id(auth.uid());
BEGIN
  IF NOT is_owner_of(auth.uid(), _owner) THEN
    RAISE EXCEPTION 'Apenas o dono pode ver fechamentos';
  END IF;

  RETURN QUERY
  WITH session_staff AS (
    SELECT DISTINCT cs.opened_by AS uid, cs.opened_by_name AS uname
    FROM cash_sessions cs
    WHERE cs.user_id = _owner AND cs.event_id = _event_id
  ),
  entry_staff AS (
    SELECT DISTINCT ee.created_by AS uid, ee.created_by_name AS uname
    FROM event_entries ee
    WHERE ee.user_id = _owner AND ee.event_id = _event_id AND ee.created_by IS NOT NULL
  ),
  all_staff AS (
    SELECT uid, uname FROM session_staff
    UNION
    SELECT uid, uname FROM entry_staff
  ),
  totals AS (
    SELECT
      s.uid,
      COALESCE(MAX(s.uname), '—') AS uname,
      COALESCE((SELECT SUM(sa.total) FROM sales sa
        JOIN cash_sessions cs2 ON cs2.id = sa.session_id
        WHERE sa.user_id = _owner AND sa.event_id = _event_id AND cs2.opened_by = s.uid
        AND sa.status NOT IN ('cancelled','refunded_pix_chave')), 0)
      +
      COALESCE((SELECT SUM(ee.amount_paid) FROM event_entries ee
        WHERE ee.user_id = _owner AND ee.event_id = _event_id AND ee.created_by = s.uid), 0)
      AS total_system
    FROM all_staff s
    GROUP BY s.uid
  )
  SELECT
    t.uid,
    COALESCE(ur.display_name, t.uname, '—') AS staff_name,
    COALESCE(ur.aceita_dinheiro, false) AS accepts_cash,
    t.total_system,
    ec.id AS closing_id,
    ec.closed_at,
    ec.total_reported
  FROM totals t
  LEFT JOIN user_roles ur ON ur.user_id = t.uid AND ur.owner_id = _owner
  LEFT JOIN event_closings ec ON ec.event_id = _event_id AND ec.staff_user_id = t.uid AND ec.reopened_at IS NULL
  ORDER BY staff_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_staff_to_close(uuid) TO authenticated;

-- Detalhamento do fechamento de UM funcionário
CREATE OR REPLACE FUNCTION public.get_staff_closing_breakdown(_event_id uuid, _staff_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid := get_owner_id(auth.uid());
  _result jsonb;
  _cash_sales numeric := 0;
  _opening numeric := 0;
  _withdrawals numeric := 0;
  _pix_qr numeric := 0;
  _terminals jsonb;
  _pix_chave jsonb;
  _entries_cash numeric := 0;
BEGIN
  IF NOT is_owner_of(auth.uid(), _owner) THEN
    RAISE EXCEPTION 'Apenas o dono pode ver fechamentos';
  END IF;

  -- Soma das sessões do staff nesse evento
  SELECT COALESCE(SUM(opening_amount), 0) INTO _opening
  FROM cash_sessions
  WHERE user_id = _owner AND event_id = _event_id AND opened_by = _staff_user_id;

  SELECT COALESCE(SUM(cw.amount), 0) INTO _withdrawals
  FROM cash_withdrawals cw
  JOIN cash_sessions cs ON cs.id = cw.session_id
  WHERE cw.user_id = _owner AND cs.event_id = _event_id AND cs.opened_by = _staff_user_id;

  -- Vendas em dinheiro do staff nesse evento (via session)
  SELECT COALESCE(SUM(sp.amount), 0) INTO _cash_sales
  FROM sale_payments sp
  JOIN sales sa ON sa.id = sp.sale_id
  JOIN cash_sessions cs ON cs.id = sa.session_id
  WHERE sa.user_id = _owner AND sa.event_id = _event_id
    AND cs.opened_by = _staff_user_id
    AND sp.method = 'dinheiro'
    AND sa.status NOT IN ('cancelled','refunded_pix_chave');

  -- Portaria em dinheiro (event_entries)
  SELECT COALESCE(SUM(amount_paid), 0) INTO _entries_cash
  FROM event_entries
  WHERE user_id = _owner AND event_id = _event_id AND created_by = _staff_user_id
    AND payment_method = 'dinheiro';

  -- PIX QR (pix_online — automático MP)
  SELECT COALESCE(SUM(sp.amount), 0) INTO _pix_qr
  FROM sale_payments sp
  JOIN sales sa ON sa.id = sp.sale_id
  JOIN cash_sessions cs ON cs.id = sa.session_id
  WHERE sa.user_id = _owner AND sa.event_id = _event_id
    AND cs.opened_by = _staff_user_id
    AND sp.method = 'pix_online'
    AND sa.status NOT IN ('cancelled','refunded_pix_chave');

  -- Maquininhas: agrupa por terminal_id (débito/crédito/pix manual)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'terminal_id', t.id,
    'label', t.label,
    'owner_label', t.owner_label,
    'mode', t.mode,
    'system_total', x.total
  ) ORDER BY t.label), '[]'::jsonb) INTO _terminals
  FROM (
    SELECT sp.terminal_id, SUM(sp.amount) AS total
    FROM sale_payments sp
    JOIN sales sa ON sa.id = sp.sale_id
    JOIN cash_sessions cs ON cs.id = sa.session_id
    WHERE sa.user_id = _owner AND sa.event_id = _event_id
      AND cs.opened_by = _staff_user_id
      AND sp.terminal_id IS NOT NULL
      AND sp.method IN ('debito','credito','pix')
      AND sa.status NOT IN ('cancelled','refunded_pix_chave')
    GROUP BY sp.terminal_id
  ) x
  JOIN payment_terminals t ON t.id = x.terminal_id;

  -- PIX chave (manual sem terminal) — conferir 1 a 1
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'sale_id', sa.id,
    'amount', sp.amount,
    'created_at', sa.created_at,
    'daily_number', sa.daily_number
  ) ORDER BY sa.created_at), '[]'::jsonb) INTO _pix_chave
  FROM sale_payments sp
  JOIN sales sa ON sa.id = sp.sale_id
  JOIN cash_sessions cs ON cs.id = sa.session_id
  WHERE sa.user_id = _owner AND sa.event_id = _event_id
    AND cs.opened_by = _staff_user_id
    AND sp.method = 'pix'
    AND sp.terminal_id IS NULL
    AND sa.status NOT IN ('cancelled','refunded_pix_chave');

  _result := jsonb_build_object(
    'staff_user_id', _staff_user_id,
    'cash_expected', _opening + _cash_sales + _entries_cash - _withdrawals,
    'cash_sales', _cash_sales + _entries_cash,
    'opening', _opening,
    'withdrawals', _withdrawals,
    'pix_qr_total', _pix_qr,
    'terminals', COALESCE(_terminals, '[]'::jsonb),
    'pix_chave', COALESCE(_pix_chave, '[]'::jsonb)
  );

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_closing_breakdown(uuid, uuid) TO authenticated;

-- Submete o fechamento (apaga e regrava se já existir)
CREATE OR REPLACE FUNCTION public.submit_staff_closing(
  _event_id uuid,
  _staff_user_id uuid,
  _cash_counted numeric,
  _terminals jsonb,        -- [{terminal_id, reported_total}]
  _pix_chave_refunded uuid[],  -- sale_ids que NÃO recebi (estorna)
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid := get_owner_id(auth.uid());
  _bd jsonb;
  _closing_id uuid;
  _cash_expected numeric;
  _pix_qr numeric;
  _staff_name text;
  _refund_total numeric := 0;
  _confirmed_total numeric := 0;
  _total_reported numeric := 0;
  _total_system numeric := 0;
  _t jsonb;
  _term_id uuid;
  _term_label text;
  _term_mode text;
  _reported numeric;
  _system numeric;
BEGIN
  IF NOT is_owner_of(auth.uid(), _owner) THEN
    RAISE EXCEPTION 'Apenas o dono pode fechar';
  END IF;

  -- 1) Estornar vendas PIX chave não recebidas
  IF _pix_chave_refunded IS NOT NULL AND array_length(_pix_chave_refunded, 1) > 0 THEN
    SELECT COALESCE(SUM(sp.amount), 0) INTO _refund_total
    FROM sale_payments sp
    WHERE sp.sale_id = ANY(_pix_chave_refunded) AND sp.method = 'pix' AND sp.terminal_id IS NULL;

    UPDATE sales SET
      status = 'refunded_pix_chave',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancelled_reason = 'PIX chave não recebido (fechamento de evento)'
    WHERE id = ANY(_pix_chave_refunded) AND user_id = _owner;
  END IF;

  -- 2) Buscar breakdown atualizado (após estornos)
  _bd := public.get_staff_closing_breakdown(_event_id, _staff_user_id);
  _cash_expected := (_bd->>'cash_expected')::numeric;
  _pix_qr := (_bd->>'pix_qr_total')::numeric;

  -- Nome do staff
  SELECT COALESCE(display_name, email, '—') INTO _staff_name
  FROM user_roles WHERE user_id = _staff_user_id AND owner_id = _owner;

  -- Confirmed PIX chave total = soma do que ainda existe (não estornado)
  SELECT COALESCE(SUM((item->>'amount')::numeric), 0) INTO _confirmed_total
  FROM jsonb_array_elements(_bd->'pix_chave') item;

  -- 3) Calcular total_reported / total_system
  _total_reported := COALESCE(_cash_counted, 0) + _pix_qr + _confirmed_total;
  _total_system := _cash_expected + _pix_qr + _confirmed_total;

  -- soma reported dos terminais
  IF _terminals IS NOT NULL THEN
    FOR _t IN SELECT * FROM jsonb_array_elements(_terminals) LOOP
      _reported := COALESCE((_t->>'reported_total')::numeric, 0);
      _total_reported := _total_reported + _reported;
    END LOOP;
  END IF;

  -- soma system dos terminais
  SELECT COALESCE(SUM((item->>'system_total')::numeric), 0) INTO _system
  FROM jsonb_array_elements(_bd->'terminals') item;
  _total_system := _total_system + _system;

  -- 4) Upsert event_closings
  INSERT INTO public.event_closings (
    user_id, event_id, staff_user_id, staff_name,
    cash_expected, cash_counted, cash_diff,
    pix_qr_total, pix_chave_confirmed_total,
    pix_chave_refunded_total, pix_chave_refunded_sale_ids,
    total_system, total_reported,
    notes, closed_by, closed_by_name, closed_at,
    reopened_at, reopened_by
  )
  VALUES (
    _owner, _event_id, _staff_user_id, _staff_name,
    _cash_expected, COALESCE(_cash_counted,0), COALESCE(_cash_counted,0) - _cash_expected,
    _pix_qr, _confirmed_total,
    _refund_total, COALESCE(to_jsonb(_pix_chave_refunded), '[]'::jsonb),
    _total_system, _total_reported,
    _notes, auth.uid(), _staff_name, now(),
    NULL, NULL
  )
  ON CONFLICT (event_id, staff_user_id) DO UPDATE SET
    cash_expected = EXCLUDED.cash_expected,
    cash_counted = EXCLUDED.cash_counted,
    cash_diff = EXCLUDED.cash_diff,
    pix_qr_total = EXCLUDED.pix_qr_total,
    pix_chave_confirmed_total = EXCLUDED.pix_chave_confirmed_total,
    pix_chave_refunded_total = event_closings.pix_chave_refunded_total + EXCLUDED.pix_chave_refunded_total,
    pix_chave_refunded_sale_ids = event_closings.pix_chave_refunded_sale_ids || EXCLUDED.pix_chave_refunded_sale_ids,
    total_system = EXCLUDED.total_system,
    total_reported = EXCLUDED.total_reported,
    notes = EXCLUDED.notes,
    closed_by = EXCLUDED.closed_by,
    closed_at = now(),
    reopened_at = NULL,
    reopened_by = NULL,
    updated_at = now()
  RETURNING id INTO _closing_id;

  -- 5) Substitui linhas de terminais
  DELETE FROM public.event_closing_terminals WHERE closing_id = _closing_id;
  IF _terminals IS NOT NULL THEN
    FOR _t IN SELECT * FROM jsonb_array_elements(_terminals) LOOP
      _term_id := (_t->>'terminal_id')::uuid;
      _reported := COALESCE((_t->>'reported_total')::numeric, 0);
      SELECT label, mode INTO _term_label, _term_mode FROM payment_terminals WHERE id = _term_id;
      _system := COALESCE((
        SELECT (item->>'system_total')::numeric
        FROM jsonb_array_elements(_bd->'terminals') item
        WHERE (item->>'terminal_id') = (_t->>'terminal_id')
        LIMIT 1
      ), 0);
      INSERT INTO public.event_closing_terminals (
        closing_id, user_id, terminal_id, terminal_label,
        system_total, reported_total, diff
      ) VALUES (
        _closing_id, _owner, _term_id, _term_label,
        _system, _reported, _reported - _system
      );
    END LOOP;
  END IF;

  RETURN _closing_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_staff_closing(uuid, uuid, numeric, jsonb, uuid[], text) TO authenticated;

-- Reabrir fechamento (só dono)
CREATE OR REPLACE FUNCTION public.reopen_staff_closing(_closing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid := get_owner_id(auth.uid());
BEGIN
  IF NOT is_owner_of(auth.uid(), _owner) THEN
    RAISE EXCEPTION 'Apenas o dono pode reabrir';
  END IF;

  UPDATE public.event_closings SET
    reopened_at = now(),
    reopened_by = auth.uid(),
    updated_at = now()
  WHERE id = _closing_id AND user_id = _owner;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reopen_staff_closing(uuid) TO authenticated;
