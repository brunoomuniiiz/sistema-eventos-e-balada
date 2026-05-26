-- Add granular sub-permission columns to user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS vendas_sangria boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendas_abrir_fechar_caixa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendas_promoter_creditos_dinheiro boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eventos_criar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eventos_editar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eventos_abrir_encerrar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eventos_ver_financeiro boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS produtos_conferir_estoque boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS produtos_adicionar_entrada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS produtos_criar_editar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS produtos_criar_combo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS produtos_inventario boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoters_gerenciar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoters_comissoes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoters_ver_desempenho boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS financeiro_lancar_despesas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS financeiro_ver_numeros boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS financeiro_fechar_caixa boolean NOT NULL DEFAULT false;

-- Function to apply a role preset to a user_roles row
CREATE OR REPLACE FUNCTION public.apply_role_preset(p_user_role_id uuid, p_preset text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.user_roles WHERE id = p_user_role_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'user_role not found';
  END IF;
  IF NOT public.is_owner_of(auth.uid(), v_owner) THEN
    RAISE EXCEPTION 'Only owner can apply presets';
  END IF;

  IF p_preset = 'garcom' THEN
    UPDATE public.user_roles SET
      role_preset = 'garcom',
      permissions = ARRAY['vendas','lojinha']::text[],
      vendas_pdv_caixa = false, vendas_garcom = true, vendas_validar_qr = false,
      vendas_pedidos = true, vendas_historico = false, vendas_fechamento = false,
      vendas_ao_vivo = false, vendas_sangria = false, vendas_abrir_fechar_caixa = false,
      vendas_promoter_creditos_dinheiro = false,
      can_authorize = false, can_discount = false,
      aceita_dinheiro = false, aceita_pix = true, aceita_cartao = false,
      lojinha_can_sell = true,
      eventos_criar = false, eventos_editar = false, eventos_abrir_encerrar = false, eventos_ver_financeiro = false,
      produtos_conferir_estoque = false, produtos_adicionar_entrada = false,
      produtos_criar_editar = false, produtos_criar_combo = false, produtos_inventario = false,
      promoters_gerenciar = false, promoters_comissoes = false, promoters_ver_desempenho = false,
      financeiro_lancar_despesas = false, financeiro_ver_numeros = false, financeiro_fechar_caixa = false
    WHERE id = p_user_role_id;

  ELSIF p_preset = 'caixa_garcom' THEN
    UPDATE public.user_roles SET
      role_preset = 'caixa_garcom',
      permissions = ARRAY['vendas','lojinha']::text[],
      vendas_pdv_caixa = true, vendas_garcom = true, vendas_validar_qr = false,
      vendas_pedidos = true, vendas_historico = true, vendas_fechamento = false,
      vendas_ao_vivo = false, vendas_sangria = false, vendas_abrir_fechar_caixa = false,
      vendas_promoter_creditos_dinheiro = false,
      can_authorize = false, can_discount = false,
      aceita_dinheiro = true, aceita_pix = true, aceita_cartao = true,
      lojinha_can_sell = true
    WHERE id = p_user_role_id;

  ELSIF p_preset = 'caixa_bar' THEN
    UPDATE public.user_roles SET
      role_preset = 'caixa_bar',
      permissions = ARRAY['vendas','lojinha']::text[],
      vendas_pdv_caixa = true, vendas_garcom = false, vendas_validar_qr = false,
      vendas_pedidos = true, vendas_historico = true, vendas_fechamento = true,
      vendas_ao_vivo = false, vendas_sangria = true, vendas_abrir_fechar_caixa = true,
      vendas_promoter_creditos_dinheiro = true,
      can_authorize = true, can_discount = true,
      aceita_dinheiro = true, aceita_pix = true, aceita_cartao = true,
      lojinha_can_sell = false
    WHERE id = p_user_role_id;

  ELSIF p_preset = 'caixa_portaria' THEN
    UPDATE public.user_roles SET
      role_preset = 'caixa_portaria',
      permissions = ARRAY['vendas','portaria']::text[],
      vendas_pdv_caixa = true, vendas_garcom = false, vendas_validar_qr = true,
      vendas_pedidos = false, vendas_historico = false, vendas_fechamento = false,
      vendas_ao_vivo = false, vendas_sangria = false, vendas_abrir_fechar_caixa = false,
      vendas_promoter_creditos_dinheiro = false,
      can_authorize = false, can_discount = false,
      aceita_dinheiro = true, aceita_pix = true, aceita_cartao = true,
      lojinha_can_sell = false
    WHERE id = p_user_role_id;

  ELSIF p_preset = 'gerente' THEN
    UPDATE public.user_roles SET
      role_preset = 'gerente',
      permissions = ARRAY['vendas','estoque','eventos','promoters','portaria','lojinha']::text[],
      vendas_pdv_caixa = true, vendas_garcom = true, vendas_validar_qr = true,
      vendas_pedidos = true, vendas_historico = true, vendas_fechamento = true,
      vendas_ao_vivo = true, vendas_sangria = true, vendas_abrir_fechar_caixa = true,
      vendas_promoter_creditos_dinheiro = true,
      can_authorize = true, can_discount = true,
      aceita_dinheiro = true, aceita_pix = true, aceita_cartao = true,
      lojinha_can_sell = true,
      eventos_criar = true, eventos_editar = true, eventos_abrir_encerrar = true, eventos_ver_financeiro = true,
      produtos_conferir_estoque = true, produtos_adicionar_entrada = true,
      produtos_criar_editar = true, produtos_criar_combo = true, produtos_inventario = true,
      promoters_gerenciar = true, promoters_comissoes = true, promoters_ver_desempenho = true
    WHERE id = p_user_role_id;

  ELSE
    RAISE EXCEPTION 'Unknown preset: %', p_preset;
  END IF;
END;
$$;