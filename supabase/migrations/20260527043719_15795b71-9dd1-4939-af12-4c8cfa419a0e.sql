
DROP POLICY IF EXISTS "Seller view own assignments" ON public.terminal_assignments;

CREATE POLICY "Staff view all assignments in bar"
  ON public.terminal_assignments
  FOR SELECT
  TO authenticated
  USING (user_id = public.get_owner_id(auth.uid()));
