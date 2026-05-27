-- 1. Coluna promoter_id em user_roles (vincula funcionário a um promoter)
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS promoter_id uuid REFERENCES public.promoters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_promoter_id ON public.user_roles(promoter_id);

-- 2. Função para fechar eventos cuja janela de operação expirou
CREATE OR REPLACE FUNCTION public.close_expired_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.events
  SET status = 'ended',
      updated_at = now()
  WHERE status = 'ongoing'
    AND now() > (date + ((COALESCE(auto_close_hours_after, 8) + 1) * interval '1 hour'));
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- 3. Cron a cada 15 min
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('close-expired-events');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'close-expired-events',
  '*/15 * * * *',
  $$ SELECT public.close_expired_events(); $$
);