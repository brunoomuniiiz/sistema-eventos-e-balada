ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS vendas_pdv_caixa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vendas_garcom boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vendas_validar_qr boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vendas_pedidos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vendas_historico boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vendas_fechamento boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vendas_abre_caixa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vendas_sangria boolean NOT NULL DEFAULT true;