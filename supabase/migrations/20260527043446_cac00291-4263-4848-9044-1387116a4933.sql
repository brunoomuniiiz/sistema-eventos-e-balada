
-- 1. Modo da maquininha e aceitação de PIX
ALTER TABLE public.payment_terminals
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS accepts_pix boolean NOT NULL DEFAULT false;

ALTER TABLE public.payment_terminals
  DROP CONSTRAINT IF EXISTS payment_terminals_mode_check;
ALTER TABLE public.payment_terminals
  ADD CONSTRAINT payment_terminals_mode_check
  CHECK (mode IN ('mp_integrated','manual'));

-- Backfill: terminais que já têm mp_device_id são integrados
UPDATE public.payment_terminals
SET mode = 'mp_integrated'
WHERE mp_device_id IS NOT NULL AND mode = 'manual';

-- 2. Atribuição maquininha -> vendedor (N:N)
CREATE TABLE IF NOT EXISTS public.terminal_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  terminal_id uuid NOT NULL REFERENCES public.payment_terminals(id) ON DELETE CASCADE,
  seller_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (terminal_id, seller_user_id)
);

CREATE INDEX IF NOT EXISTS idx_terminal_assignments_seller
  ON public.terminal_assignments(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_terminal_assignments_owner
  ON public.terminal_assignments(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.terminal_assignments TO authenticated;
GRANT ALL ON public.terminal_assignments TO service_role;

ALTER TABLE public.terminal_assignments ENABLE ROW LEVEL SECURITY;

-- Owner gerencia tudo
CREATE POLICY "Owner manage terminal_assignments"
  ON public.terminal_assignments
  FOR ALL
  TO authenticated
  USING ((user_id = public.get_owner_id(auth.uid())) AND public.is_owner_of(auth.uid(), user_id))
  WITH CHECK ((user_id = public.get_owner_id(auth.uid())) AND public.is_owner_of(auth.uid(), user_id));

-- Vendedor vê as próprias atribuições
CREATE POLICY "Seller view own assignments"
  ON public.terminal_assignments
  FOR SELECT
  TO authenticated
  USING (seller_user_id = auth.uid());
