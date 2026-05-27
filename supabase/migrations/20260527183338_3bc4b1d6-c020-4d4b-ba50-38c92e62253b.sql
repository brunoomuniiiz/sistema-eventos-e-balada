
-- events
DROP POLICY IF EXISTS "Users view own events" ON public.events;
DROP POLICY IF EXISTS "Users insert own events" ON public.events;
DROP POLICY IF EXISTS "Users update own events" ON public.events;
DROP POLICY IF EXISTS "Users delete own events" ON public.events;

CREATE POLICY "View events"
  ON public.events FOR SELECT TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (public.is_owner_of(auth.uid(), user_id) OR public.has_permission(auth.uid(), user_id, 'eventos'))
  );

CREATE POLICY "Insert events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_criar FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = events.user_id LIMIT 1), false))
    )
  );

CREATE POLICY "Update events"
  ON public.events FOR UPDATE TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_editar OR eventos_abrir_encerrar FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = events.user_id LIMIT 1), false))
    )
  );

CREATE POLICY "Delete events"
  ON public.events FOR DELETE TO authenticated
  USING (user_id = public.get_owner_id(auth.uid()) AND public.is_owner_of(auth.uid(), user_id));

-- event_costs
DROP POLICY IF EXISTS "Users view own costs" ON public.event_costs;
DROP POLICY IF EXISTS "Users insert own costs" ON public.event_costs;
DROP POLICY IF EXISTS "Users update own costs" ON public.event_costs;
DROP POLICY IF EXISTS "Users delete own costs" ON public.event_costs;

CREATE POLICY "View event_costs"
  ON public.event_costs FOR SELECT TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (public.is_owner_of(auth.uid(), user_id) OR public.has_permission(auth.uid(), user_id, 'eventos'))
  );

CREATE POLICY "Mutate event_costs insert"
  ON public.event_costs FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_editar FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = event_costs.user_id LIMIT 1), false))
    )
  );

CREATE POLICY "Mutate event_costs update"
  ON public.event_costs FOR UPDATE TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_editar FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = event_costs.user_id LIMIT 1), false))
    )
  );

CREATE POLICY "Mutate event_costs delete"
  ON public.event_costs FOR DELETE TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_editar FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = event_costs.user_id LIMIT 1), false))
    )
  );

-- event_financials
DROP POLICY IF EXISTS "Users view own financials" ON public.event_financials;
DROP POLICY IF EXISTS "Users insert own financials" ON public.event_financials;
DROP POLICY IF EXISTS "Users update own financials" ON public.event_financials;
DROP POLICY IF EXISTS "Users delete own financials" ON public.event_financials;

CREATE POLICY "View event_financials"
  ON public.event_financials FOR SELECT TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_ver_financeiro FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = event_financials.user_id LIMIT 1), false))
    )
  );

CREATE POLICY "Insert event_financials"
  ON public.event_financials FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_ver_financeiro AND eventos_editar FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = event_financials.user_id LIMIT 1), false))
    )
  );

CREATE POLICY "Update event_financials"
  ON public.event_financials FOR UPDATE TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_ver_financeiro AND eventos_editar FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = event_financials.user_id LIMIT 1), false))
    )
  );

CREATE POLICY "Delete event_financials"
  ON public.event_financials FOR DELETE TO authenticated
  USING (user_id = public.get_owner_id(auth.uid()) AND public.is_owner_of(auth.uid(), user_id));

-- event_promoters: keep promoter view; replace owner policies
DROP POLICY IF EXISTS "Owner view" ON public.event_promoters;
DROP POLICY IF EXISTS "Owner insert" ON public.event_promoters;
DROP POLICY IF EXISTS "Owner update" ON public.event_promoters;
DROP POLICY IF EXISTS "Owner delete" ON public.event_promoters;

CREATE POLICY "Staff view event_promoters"
  ON public.event_promoters FOR SELECT TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (public.is_owner_of(auth.uid(), user_id) OR public.has_permission(auth.uid(), user_id, 'eventos'))
  );

CREATE POLICY "Staff insert event_promoters"
  ON public.event_promoters FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_editar FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = event_promoters.user_id LIMIT 1), false))
    )
  );

CREATE POLICY "Staff update event_promoters"
  ON public.event_promoters FOR UPDATE TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_editar FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = event_promoters.user_id LIMIT 1), false))
    )
  );

CREATE POLICY "Staff delete event_promoters"
  ON public.event_promoters FOR DELETE TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_editar FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = event_promoters.user_id LIMIT 1), false))
    )
  );

-- event_promoter_commissions
DROP POLICY IF EXISTS "Owner manage event_promoter_commissions" ON public.event_promoter_commissions;

CREATE POLICY "Staff view event_promoter_commissions"
  ON public.event_promoter_commissions FOR SELECT TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (public.is_owner_of(auth.uid(), user_id) OR public.has_permission(auth.uid(), user_id, 'eventos'))
  );

CREATE POLICY "Staff insert event_promoter_commissions"
  ON public.event_promoter_commissions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_editar FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = event_promoter_commissions.user_id LIMIT 1), false))
    )
  );

CREATE POLICY "Staff update event_promoter_commissions"
  ON public.event_promoter_commissions FOR UPDATE TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_editar FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = event_promoter_commissions.user_id LIMIT 1), false))
    )
  );

CREATE POLICY "Staff delete event_promoter_commissions"
  ON public.event_promoter_commissions FOR DELETE TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND (
      public.is_owner_of(auth.uid(), user_id)
      OR (public.has_permission(auth.uid(), user_id, 'eventos')
          AND COALESCE((SELECT eventos_editar FROM public.user_roles WHERE user_id = auth.uid() AND owner_id = event_promoter_commissions.user_id LIMIT 1), false))
    )
  );

-- guest_list_entries: add SELECT for eventos staff (keep existing policies)
CREATE POLICY "Eventos staff view guest_list_entries"
  ON public.guest_list_entries FOR SELECT TO authenticated
  USING (
    user_id = public.get_owner_id(auth.uid())
    AND public.has_permission(auth.uid(), user_id, 'eventos')
  );
