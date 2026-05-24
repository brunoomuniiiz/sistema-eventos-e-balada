ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS vendas_ao_vivo boolean NOT NULL DEFAULT false;
UPDATE public.user_roles SET vendas_ao_vivo = true WHERE role = 'owner';