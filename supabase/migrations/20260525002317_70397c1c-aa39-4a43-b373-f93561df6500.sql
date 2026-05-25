CREATE TABLE public.promoter_credit_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('global','promoter','event_promoter')),
  promoter_id uuid REFERENCES public.promoters(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  min_purchase numeric NOT NULL DEFAULT 0,
  max_percent numeric NOT NULL DEFAULT 100,
  excluded_product_ids uuid[] NOT NULL DEFAULT '{}',
  excluded_category_ids uuid[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_pcr_global ON public.promoter_credit_rules(user_id) WHERE scope = 'global';
CREATE UNIQUE INDEX uniq_pcr_promoter ON public.promoter_credit_rules(user_id, promoter_id) WHERE scope = 'promoter';
CREATE UNIQUE INDEX uniq_pcr_event_promoter ON public.promoter_credit_rules(user_id, event_id, promoter_id) WHERE scope = 'event_promoter';

ALTER TABLE public.promoter_credit_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manage pcr" ON public.promoter_credit_rules
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Promoter view own pcr" ON public.promoter_credit_rules
  FOR SELECT USING (
    scope = 'global' AND user_id = get_owner_id(auth.uid())
    OR promoter_id IN (SELECT id FROM public.promoters WHERE user_id = auth.uid())
  );

CREATE POLICY "Staff view pcr" ON public.promoter_credit_rules
  FOR SELECT USING (
    user_id = get_owner_id(auth.uid())
    AND (has_permission(auth.uid(), user_id, 'vendas') OR has_permission(auth.uid(), user_id, 'promoters'))
  );

CREATE TRIGGER pcr_set_updated_at BEFORE UPDATE ON public.promoter_credit_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();