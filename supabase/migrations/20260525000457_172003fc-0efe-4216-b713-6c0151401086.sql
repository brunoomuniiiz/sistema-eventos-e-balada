ALTER TABLE public.promoters
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_promoters_user_id ON public.promoters(user_id);

DROP POLICY IF EXISTS "Promoter view self" ON public.promoters;
CREATE POLICY "Promoter view self" ON public.promoters FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Promoter view own event_promoters" ON public.event_promoters;
CREATE POLICY "Promoter view own event_promoters" ON public.event_promoters FOR SELECT
  USING (promoter_id IN (SELECT id FROM public.promoters WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Promoter view own credits" ON public.promoter_credits;
CREATE POLICY "Promoter view own credits" ON public.promoter_credits FOR SELECT
  USING (promoter_id IN (SELECT id FROM public.promoters WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Promoter view own redemptions" ON public.promoter_credit_redemptions;
CREATE POLICY "Promoter view own redemptions" ON public.promoter_credit_redemptions FOR SELECT
  USING (promoter_id IN (SELECT id FROM public.promoters WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Promoter view own commissions" ON public.event_promoter_commissions;
CREATE POLICY "Promoter view own commissions" ON public.event_promoter_commissions FOR SELECT
  USING (promoter_id IN (SELECT id FROM public.promoters WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Promoter view own guests" ON public.guest_list_entries;
CREATE POLICY "Promoter view own guests" ON public.guest_list_entries FOR SELECT
  USING (promoter_id IN (SELECT id FROM public.promoters WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Promoter manage own guests" ON public.guest_list_entries;
CREATE POLICY "Promoter manage own guests" ON public.guest_list_entries FOR INSERT
  WITH CHECK (promoter_id IN (SELECT id FROM public.promoters WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Promoter view linked events" ON public.events;
CREATE POLICY "Promoter view linked events" ON public.events FOR SELECT
  USING (id IN (SELECT event_id FROM public.event_promoters ep
                JOIN public.promoters p ON p.id = ep.promoter_id
                WHERE p.user_id = auth.uid()));