
-- ============================================================
-- PROMOTERS: comissão personalizada por linha
-- ============================================================
ALTER TABLE public.promoters
  ADD COLUMN IF NOT EXISTS comm_woman_free_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS comm_woman_free_value numeric NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS comm_woman_paid_type text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS comm_woman_paid_value numeric NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS comm_man_free_type  text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS comm_man_free_value numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS comm_man_paid_type  text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS comm_man_paid_value numeric NOT NULL DEFAULT 5;

-- Overrides por evento
CREATE TABLE IF NOT EXISTS public.event_promoter_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  promoter_id uuid NOT NULL,
  comm_woman_free_type text NOT NULL DEFAULT 'fixed',
  comm_woman_free_value numeric NOT NULL DEFAULT 0,
  comm_woman_paid_type text NOT NULL DEFAULT 'percent',
  comm_woman_paid_value numeric NOT NULL DEFAULT 0,
  comm_man_free_type text NOT NULL DEFAULT 'fixed',
  comm_man_free_value numeric NOT NULL DEFAULT 0,
  comm_man_paid_type text NOT NULL DEFAULT 'fixed',
  comm_man_paid_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, promoter_id)
);
ALTER TABLE public.event_promoter_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manage event_promoter_commissions"
  ON public.event_promoter_commissions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- CRÉDITOS DOS PROMOTERS (ganhos por entrada/checkin)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.promoter_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  promoter_id uuid NOT NULL,
  event_id uuid NOT NULL,
  amount numeric NOT NULL,
  source text NOT NULL CHECK (source IN ('checkin_free','paid_entry','manual')),
  source_ref_id uuid,
  gender text,
  expires_after_event_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','consumed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
ALTER TABLE public.promoter_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View promoter_credits"
  ON public.promoter_credits FOR SELECT
  USING (user_id = get_owner_id(auth.uid())
         AND (is_owner_of(auth.uid(), user_id)
              OR has_permission(auth.uid(), user_id, 'vendas')
              OR has_permission(auth.uid(), user_id, 'eventos')
              OR has_permission(auth.uid(), user_id, 'portaria')));
CREATE POLICY "Insert promoter_credits owner"
  ON public.promoter_credits FOR INSERT
  WITH CHECK (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));
CREATE POLICY "Update promoter_credits owner"
  ON public.promoter_credits FOR UPDATE
  USING (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));
CREATE POLICY "Delete promoter_credits owner"
  ON public.promoter_credits FOR DELETE
  USING (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));

CREATE INDEX IF NOT EXISTS idx_promoter_credits_promoter ON public.promoter_credits(promoter_id, status);
CREATE INDEX IF NOT EXISTS idx_promoter_credits_event ON public.promoter_credits(event_id);

-- Consumos
CREATE TABLE IF NOT EXISTS public.promoter_credit_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  promoter_id uuid NOT NULL,
  sale_id uuid,
  amount numeric NOT NULL,
  created_by uuid,
  created_by_name text,
  authorized_by uuid,
  authorized_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
ALTER TABLE public.promoter_credit_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View promoter_redemptions"
  ON public.promoter_credit_redemptions FOR SELECT
  USING (user_id = get_owner_id(auth.uid())
         AND (is_owner_of(auth.uid(), user_id)
              OR has_permission(auth.uid(), user_id, 'vendas')));
CREATE INDEX IF NOT EXISTS idx_promoter_redemptions_promoter ON public.promoter_credit_redemptions(promoter_id);
CREATE INDEX IF NOT EXISTS idx_promoter_redemptions_sale ON public.promoter_credit_redemptions(sale_id);

-- ============================================================
-- PERMISSÃO DO FUNCIONÁRIO: aceitar crédito promoter
-- ============================================================
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS aceita_credito_promoter boolean NOT NULL DEFAULT false;

-- ============================================================
-- SALE_PAYMENTS: aceitar método 'promoter_credit' + promoter_id
-- ============================================================
ALTER TABLE public.sale_payments
  ADD COLUMN IF NOT EXISTS promoter_id uuid;

-- ============================================================
-- FUNÇÃO: saldo ativo do promoter
-- ============================================================
CREATE OR REPLACE FUNCTION public.promoter_active_balance(_promoter_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT SUM(amount) FROM public.promoter_credits
       WHERE promoter_id = _promoter_id AND status = 'active'), 0
  ) - COALESCE(
    (SELECT SUM(amount) FROM public.promoter_credit_redemptions
       WHERE promoter_id = _promoter_id), 0
  );
$$;

-- ============================================================
-- FUNÇÃO: registrar consumo de crédito (usada no PDV)
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_promoter_credit(
  _promoter_id uuid, _sale_id uuid, _amount numeric, _grant_token text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _owner_id uuid;
  _balance numeric;
  _name text;
  _auth_by uuid;
  _auth_name text;
  _red_id uuid;
BEGIN
  _owner_id := get_owner_id(auth.uid());
  IF _owner_id IS NULL THEN RAISE EXCEPTION 'Sem owner'; END IF;
  IF NOT has_permission(auth.uid(), _owner_id, 'vendas') THEN
    RAISE EXCEPTION 'Sem permissão de vendas';
  END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  _balance := public.promoter_active_balance(_promoter_id);
  IF _balance < _amount THEN
    RAISE EXCEPTION 'Saldo insuficiente (disponível R$ %)', _balance;
  END IF;

  SELECT display_name INTO _name FROM public.user_roles
    WHERE user_id = auth.uid() AND owner_id = _owner_id LIMIT 1;

  IF _grant_token IS NOT NULL THEN
    SELECT authorized_by, authorized_by_name INTO _auth_by, _auth_name
      FROM public.auth_grants
      WHERE token = _grant_token AND used = false AND expires_at > now()
      LIMIT 1;
    IF _auth_by IS NOT NULL THEN
      UPDATE public.auth_grants SET used = true WHERE token = _grant_token;
    END IF;
  END IF;

  INSERT INTO public.promoter_credit_redemptions
    (user_id, promoter_id, sale_id, amount, created_by, created_by_name, authorized_by, authorized_by_name)
  VALUES
    (_owner_id, _promoter_id, _sale_id, _amount, auth.uid(), _name, _auth_by, _auth_name)
  RETURNING id INTO _red_id;

  RETURN _red_id;
END;
$$;

-- ============================================================
-- TRIGGER: expirar créditos quando evento muda de janela
-- (rotina simples: ao inserir credit, marca expires_after_event_id
--  = 2 eventos depois do event_id de origem do mesmo owner)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_credit_expiration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _origin_date timestamptz;
  _expire_event uuid;
BEGIN
  SELECT date INTO _origin_date FROM public.events WHERE id = NEW.event_id;
  IF _origin_date IS NULL THEN RETURN NEW; END IF;

  -- pega o 3º evento (incluindo o atual) na ordem cronológica do mesmo owner
  SELECT id INTO _expire_event
  FROM (
    SELECT id, date FROM public.events
    WHERE user_id = NEW.user_id AND date >= _origin_date
    ORDER BY date ASC
    LIMIT 3
  ) q
  ORDER BY date DESC LIMIT 1;

  NEW.expires_after_event_id := _expire_event;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_credit_expiration ON public.promoter_credits;
CREATE TRIGGER trg_set_credit_expiration
  BEFORE INSERT ON public.promoter_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_credit_expiration();

-- Função para marcar créditos expirados quando um novo evento começa
CREATE OR REPLACE FUNCTION public.expire_old_promoter_credits(_owner_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _count integer;
BEGIN
  WITH ev_order AS (
    SELECT id, date, ROW_NUMBER() OVER (ORDER BY date DESC) AS rn
      FROM public.events WHERE user_id = _owner_id
  ), active AS (
    SELECT id FROM ev_order WHERE rn <= 3
  )
  UPDATE public.promoter_credits
    SET status = 'expired'
    WHERE user_id = _owner_id
      AND status = 'active'
      AND event_id NOT IN (SELECT id FROM active);
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;
