
-- ============================================================
-- CAMPANHAS DE CRÉDITO DE PROMOTER
-- ============================================================

CREATE TABLE IF NOT EXISTS public.promoter_credit_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  name text NOT NULL,
  credit_amount numeric NOT NULL CHECK (credit_amount >= 0),
  min_purchase numeric NOT NULL DEFAULT 0,
  max_percent numeric NOT NULL DEFAULT 100 CHECK (max_percent >= 0 AND max_percent <= 100),
  excluded_product_ids uuid[] NOT NULL DEFAULT '{}',
  excluded_category_ids uuid[] NOT NULL DEFAULT '{}',
  valid_from timestamptz,
  valid_until timestamptz,
  valid_weekdays int[],
  applies_to_promotions boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.promoter_credit_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manage promoter_credit_campaigns"
  ON public.promoter_credit_campaigns FOR ALL
  USING (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id))
  WITH CHECK (user_id = get_owner_id(auth.uid()) AND is_owner_of(auth.uid(), user_id));

CREATE POLICY "Staff view promoter_credit_campaigns"
  ON public.promoter_credit_campaigns FOR SELECT
  USING (user_id = get_owner_id(auth.uid())
         AND (has_permission(auth.uid(), user_id, 'vendas')
              OR has_permission(auth.uid(), user_id, 'eventos')
              OR has_permission(auth.uid(), user_id, 'promoters')));

CREATE INDEX IF NOT EXISTS idx_pcc_event ON public.promoter_credit_campaigns(event_id);
CREATE INDEX IF NOT EXISTS idx_pcc_user ON public.promoter_credit_campaigns(user_id);

CREATE TABLE IF NOT EXISTS public.promoter_credit_campaign_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.promoter_credit_campaigns(id) ON DELETE CASCADE,
  promoter_id uuid NOT NULL,
  credited_amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, promoter_id)
);
ALTER TABLE public.promoter_credit_campaign_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manage pcc_members"
  ON public.promoter_credit_campaign_members FOR ALL
  USING (EXISTS (SELECT 1 FROM public.promoter_credit_campaigns c
                 WHERE c.id = campaign_id AND c.user_id = get_owner_id(auth.uid())
                       AND is_owner_of(auth.uid(), c.user_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.promoter_credit_campaigns c
                 WHERE c.id = campaign_id AND c.user_id = get_owner_id(auth.uid())
                       AND is_owner_of(auth.uid(), c.user_id)));

CREATE POLICY "Staff view pcc_members"
  ON public.promoter_credit_campaign_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.promoter_credit_campaigns c
                 WHERE c.id = campaign_id AND c.user_id = get_owner_id(auth.uid())));

CREATE POLICY "Promoter view own campaign membership"
  ON public.promoter_credit_campaign_members FOR SELECT
  USING (promoter_id IN (SELECT id FROM public.promoters WHERE user_id = auth.uid()));

-- ============================================================
-- LIGAR CAMPANHA ↔ promoter_credits / redemptions
-- ============================================================
ALTER TABLE public.promoter_credits
  ADD COLUMN IF NOT EXISTS campaign_id uuid;

-- Permitir source = 'campaign'
ALTER TABLE public.promoter_credits
  DROP CONSTRAINT IF EXISTS promoter_credits_source_check;
ALTER TABLE public.promoter_credits
  ADD CONSTRAINT promoter_credits_source_check
  CHECK (source IN ('checkin_free','paid_entry','manual','campaign'));

ALTER TABLE public.promoter_credit_redemptions
  ADD COLUMN IF NOT EXISTS campaign_id uuid;

CREATE INDEX IF NOT EXISTS idx_pc_campaign ON public.promoter_credits(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pcr_campaign ON public.promoter_credit_redemptions(campaign_id);

-- ============================================================
-- RPC: criar/atualizar campanha + membros (e gerar promoter_credits)
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_promoter_credit_campaign(
  _campaign_id uuid,
  _event_id uuid,
  _name text,
  _credit_amount numeric,
  _min_purchase numeric,
  _max_percent numeric,
  _excluded_product_ids uuid[],
  _excluded_category_ids uuid[],
  _valid_from timestamptz,
  _valid_until timestamptz,
  _valid_weekdays int[],
  _applies_to_promotions boolean,
  _enabled boolean,
  _notes text,
  _promoter_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid;
  _cid uuid;
  _pid uuid;
BEGIN
  _owner := get_owner_id(auth.uid());
  IF _owner IS NULL OR NOT is_owner_of(auth.uid(), _owner) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  IF _campaign_id IS NULL THEN
    INSERT INTO public.promoter_credit_campaigns
      (user_id, event_id, name, credit_amount, min_purchase, max_percent,
       excluded_product_ids, excluded_category_ids, valid_from, valid_until,
       valid_weekdays, applies_to_promotions, enabled, notes)
    VALUES
      (_owner, _event_id, _name, _credit_amount, _min_purchase, _max_percent,
       COALESCE(_excluded_product_ids, '{}'), COALESCE(_excluded_category_ids, '{}'),
       _valid_from, _valid_until, _valid_weekdays, _applies_to_promotions, _enabled, _notes)
    RETURNING id INTO _cid;
  ELSE
    UPDATE public.promoter_credit_campaigns SET
      event_id = _event_id, name = _name, credit_amount = _credit_amount,
      min_purchase = _min_purchase, max_percent = _max_percent,
      excluded_product_ids = COALESCE(_excluded_product_ids, '{}'),
      excluded_category_ids = COALESCE(_excluded_category_ids, '{}'),
      valid_from = _valid_from, valid_until = _valid_until,
      valid_weekdays = _valid_weekdays,
      applies_to_promotions = _applies_to_promotions,
      enabled = _enabled, notes = _notes, updated_at = now()
    WHERE id = _campaign_id AND user_id = _owner
    RETURNING id INTO _cid;
    IF _cid IS NULL THEN RAISE EXCEPTION 'Campanha não encontrada'; END IF;
  END IF;

  -- adiciona novos membros (idempotente). Gera credit por membro novo.
  IF _promoter_ids IS NOT NULL THEN
    FOREACH _pid IN ARRAY _promoter_ids LOOP
      -- só insere se ainda não é membro
      IF NOT EXISTS (SELECT 1 FROM public.promoter_credit_campaign_members
                     WHERE campaign_id = _cid AND promoter_id = _pid) THEN
        INSERT INTO public.promoter_credit_campaign_members
          (campaign_id, promoter_id, credited_amount)
        VALUES (_cid, _pid, _credit_amount);

        -- credit row para somar no saldo
        INSERT INTO public.promoter_credits
          (user_id, promoter_id, event_id, amount, source, source_ref_id,
           campaign_id, notes)
        VALUES
          (_owner, _pid, _event_id, _credit_amount, 'campaign', _cid,
           _cid, 'Campanha: ' || _name);
      END IF;
    END LOOP;
  END IF;

  RETURN _cid;
END;
$$;

-- ============================================================
-- RPC: saldo por bucket (nomes vs campanha específica)
-- ============================================================
CREATE OR REPLACE FUNCTION public.promoter_campaign_balance(
  _promoter_id uuid, _campaign_id uuid
)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT SUM(amount) FROM public.promoter_credits
       WHERE promoter_id = _promoter_id
         AND campaign_id = _campaign_id
         AND status = 'active'), 0
  ) - COALESCE(
    (SELECT SUM(amount) FROM public.promoter_credit_redemptions
       WHERE promoter_id = _promoter_id
         AND campaign_id = _campaign_id), 0
  );
$$;

CREATE OR REPLACE FUNCTION public.promoter_names_balance(_promoter_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT SUM(amount) FROM public.promoter_credits
       WHERE promoter_id = _promoter_id
         AND (campaign_id IS NULL OR source <> 'campaign')
         AND status = 'active'), 0
  ) - COALESCE(
    (SELECT SUM(amount) FROM public.promoter_credit_redemptions
       WHERE promoter_id = _promoter_id
         AND campaign_id IS NULL), 0
  );
$$;

-- ============================================================
-- RPC: redeem com campaign_id (mantém compat com versão antiga)
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_promoter_credit_v2(
  _promoter_id uuid, _sale_id uuid, _amount numeric,
  _campaign_id uuid DEFAULT NULL, _grant_token text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _owner_id uuid;
  _bal numeric;
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

  IF _campaign_id IS NULL THEN
    _bal := public.promoter_names_balance(_promoter_id);
  ELSE
    _bal := public.promoter_campaign_balance(_promoter_id, _campaign_id);
  END IF;

  IF _bal < _amount THEN
    RAISE EXCEPTION 'Saldo insuficiente no bucket (disponível R$ %)', _bal;
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
    (user_id, promoter_id, sale_id, amount, campaign_id,
     created_by, created_by_name, authorized_by, authorized_by_name)
  VALUES
    (_owner_id, _promoter_id, _sale_id, _amount, _campaign_id,
     auth.uid(), _name, _auth_by, _auth_name)
  RETURNING id INTO _red_id;

  RETURN _red_id;
END;
$$;
