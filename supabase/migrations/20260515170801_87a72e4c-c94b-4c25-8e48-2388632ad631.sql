
-- ============================================
-- CAIXA POR TURNO (cash sessions + sangrias)
-- ============================================

CREATE TABLE public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                     -- owner_id
  opened_by uuid NOT NULL,                   -- staff que abriu
  opened_by_name text,
  opening_amount numeric NOT NULL DEFAULT 0,
  opening_notes text,
  status text NOT NULL DEFAULT 'open',       -- open | closed
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closing_id uuid,                           -- FK lógica para cash_closings
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_sessions_open ON public.cash_sessions(opened_by) WHERE status = 'open';
CREATE INDEX idx_cash_sessions_owner ON public.cash_sessions(user_id, status);

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View cash_sessions" ON public.cash_sessions FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'vendas'));
CREATE POLICY "Insert cash_sessions" ON public.cash_sessions FOR INSERT
  WITH CHECK (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'vendas') AND opened_by = auth.uid());
CREATE POLICY "Update cash_sessions" ON public.cash_sessions FOR UPDATE
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'vendas'));

CREATE TABLE public.cash_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  reason text,
  created_by uuid NOT NULL,
  created_by_name text,
  authorized_by uuid NOT NULL,
  authorized_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_withdrawals_session ON public.cash_withdrawals(session_id);

ALTER TABLE public.cash_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View cash_withdrawals" ON public.cash_withdrawals FOR SELECT
  USING (user_id = public.get_owner_id(auth.uid()) AND public.has_permission(auth.uid(), user_id, 'vendas'));

-- ============================================
-- session_id em sales e cash_closings
-- ============================================
ALTER TABLE public.sales ADD COLUMN session_id uuid;
CREATE INDEX idx_sales_session ON public.sales(session_id);

ALTER TABLE public.cash_closings ADD COLUMN session_id uuid;
ALTER TABLE public.cash_closings ADD COLUMN opening_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.cash_closings ADD COLUMN withdrawals_total numeric NOT NULL DEFAULT 0;
ALTER TABLE public.cash_closings ADD COLUMN authorized_by uuid;
ALTER TABLE public.cash_closings ADD COLUMN authorized_by_name text;

-- ============================================
-- can_authorize em user_roles
-- ============================================
ALTER TABLE public.user_roles ADD COLUMN can_authorize boolean NOT NULL DEFAULT false;

-- ============================================
-- AUTH GRANTS (token curto após validar senha)
-- ============================================
CREATE TABLE public.auth_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                     -- owner_id
  token text NOT NULL UNIQUE,
  authorized_by uuid NOT NULL,
  authorized_by_name text,
  scope text NOT NULL,                       -- 'withdrawal' | 'discount' | 'closing'
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_grants_token ON public.auth_grants(token) WHERE NOT used;

ALTER TABLE public.auth_grants ENABLE ROW LEVEL SECURITY;
-- Sem políticas para usuários: só server function (service role) gerencia.

-- ============================================
-- RPC: open_cash_session
-- ============================================
CREATE OR REPLACE FUNCTION public.open_cash_session(_opening numeric, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  INSERT INTO public.cash_sessions (user_id, opened_by, opened_by_name, opening_amount, opening_notes)
  VALUES (_owner, auth.uid(), _name, COALESCE(_opening, 0), _notes)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- ============================================
-- RPC: get_my_open_session
-- ============================================
CREATE OR REPLACE FUNCTION public.get_my_open_session()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row record;
  _wd numeric := 0;
  _sales numeric := 0;
BEGIN
  SELECT * INTO _row FROM public.cash_sessions
  WHERE opened_by = auth.uid() AND status = 'open' LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(amount),0) INTO _wd FROM public.cash_withdrawals WHERE session_id = _row.id;
  SELECT COALESCE(SUM(total),0) INTO _sales FROM public.sales WHERE session_id = _row.id;

  RETURN jsonb_build_object(
    'id', _row.id,
    'opening_amount', _row.opening_amount,
    'opened_at', _row.opened_at,
    'opening_notes', _row.opening_notes,
    'withdrawals_total', _wd,
    'sales_total', _sales
  );
END $$;

-- ============================================
-- RPC: register_withdrawal (consome grant_token)
-- ============================================
CREATE OR REPLACE FUNCTION public.consume_grant(_token text, _scope text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _g record;
  _owner uuid;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  SELECT * INTO _g FROM public.auth_grants
   WHERE token = _token AND scope = _scope AND user_id = _owner
     AND NOT used AND expires_at > now()
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Autorização inválida ou expirada'; END IF;
  UPDATE public.auth_grants SET used = true WHERE id = _g.id;
  RETURN jsonb_build_object('authorized_by', _g.authorized_by, 'authorized_by_name', _g.authorized_by_name);
END $$;

CREATE OR REPLACE FUNCTION public.register_withdrawal(_amount numeric, _reason text, _grant_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid;
  _name text;
  _session uuid;
  _grant jsonb;
  _id uuid;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), _owner, 'vendas') THEN
    RAISE EXCEPTION 'Sem permissão de vendas';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  SELECT id INTO _session FROM public.cash_sessions
   WHERE opened_by = auth.uid() AND status = 'open' LIMIT 1;
  IF _session IS NULL THEN RAISE EXCEPTION 'Nenhum caixa aberto'; END IF;

  _grant := public.consume_grant(_grant_token, 'withdrawal');

  SELECT COALESCE(display_name, email) INTO _name
  FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.cash_withdrawals
    (user_id, session_id, amount, reason, created_by, created_by_name, authorized_by, authorized_by_name)
  VALUES
    (_owner, _session, _amount, _reason, auth.uid(), _name,
     (_grant->>'authorized_by')::uuid, _grant->>'authorized_by_name')
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- ============================================
-- RPC: close_cash_blind atualizada
-- ============================================
DROP FUNCTION IF EXISTS public.close_cash_blind(numeric, numeric, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.close_cash_blind(
  _declared_dinheiro numeric,
  _declared_debito numeric,
  _declared_credito numeric,
  _declared_pix numeric,
  _grant_token text,
  _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid;
  _closing_id uuid;
  _exp_din numeric := 0; _exp_deb numeric := 0; _exp_cre numeric := 0; _exp_pix numeric := 0;
  _count integer := 0;
  _name text;
  _session record;
  _wd numeric := 0;
  _grant jsonb;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF NOT public.has_permission(auth.uid(), _owner, 'vendas') THEN
    RAISE EXCEPTION 'Sem permissão de vendas';
  END IF;

  SELECT * INTO _session FROM public.cash_sessions
   WHERE opened_by = auth.uid() AND status = 'open' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum caixa aberto'; END IF;

  _grant := public.consume_grant(_grant_token, 'closing');

  SELECT COALESCE(display_name, email) INTO _name
  FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  SELECT
    COALESCE(SUM(CASE WHEN payment_method = 'dinheiro' THEN total END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'debito'   THEN total END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'credito'  THEN total END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'pix'      THEN total END), 0),
    COUNT(*)
  INTO _exp_din, _exp_deb, _exp_cre, _exp_pix, _count
  FROM public.sales
  WHERE session_id = _session.id;

  SELECT COALESCE(SUM(amount),0) INTO _wd FROM public.cash_withdrawals WHERE session_id = _session.id;

  -- esperado em dinheiro = inicial + vendas dinheiro - sangrias
  _exp_din := _session.opening_amount + _exp_din - _wd;

  INSERT INTO public.cash_closings (
    user_id, closed_by, closed_by_name,
    declared_dinheiro, declared_debito, declared_credito, declared_pix,
    expected_dinheiro, expected_debito, expected_credito, expected_pix,
    sales_count, notes, session_id, opening_amount, withdrawals_total,
    authorized_by, authorized_by_name
  ) VALUES (
    _owner, auth.uid(), _name,
    COALESCE(_declared_dinheiro,0), COALESCE(_declared_debito,0),
    COALESCE(_declared_credito,0), COALESCE(_declared_pix,0),
    _exp_din, _exp_deb, _exp_cre, _exp_pix,
    _count, _notes, _session.id, _session.opening_amount, _wd,
    (_grant->>'authorized_by')::uuid, _grant->>'authorized_by_name'
  ) RETURNING id INTO _closing_id;

  UPDATE public.sales SET closing_id = _closing_id WHERE session_id = _session.id AND closing_id IS NULL;
  UPDATE public.cash_sessions SET status = 'closed', closed_at = now(), closing_id = _closing_id
   WHERE id = _session.id;

  RETURN _closing_id;
END $$;
