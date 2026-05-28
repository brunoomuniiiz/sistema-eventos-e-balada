import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/hooks/useViewAs";

export type Permission =
  | "vendas"
  | "estoque"
  | "eventos"
  | "promoters"
  | "financeiro"
  | "funcionarios"
  | "portaria"
  | "lojinha";

export const ALL_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "vendas", label: "Vendas (PDV)" },
  { key: "estoque", label: "Estoque" },
  { key: "eventos", label: "Eventos" },
  { key: "promoters", label: "Promoters" },
  { key: "portaria", label: "Portaria" },
  { key: "financeiro", label: "Financeiro" },
  { key: "funcionarios", label: "Funcionários" },
  { key: "lojinha", label: "Lojinha (venda online)" },
];

export type AcceptedMethod = "dinheiro" | "debito" | "credito" | "pix";

export function usePermissions() {
  const { user } = useAuth();
  const { mask } = useViewAs();
  const { data, isLoading } = useQuery({
    queryKey: ["my-role", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, permissions, owner_id, promoter_id, can_discount, max_discount_percent, can_sell_cash, can_authorize, role_preset, lojinha_can_sell, lojinha_payment_methods, lojinha_point_device_id, pode_adicionar_bebidas, aceita_dinheiro, aceita_pix, aceita_cartao, aceita_credito_promoter, pode_lancar_consumacao, pode_pix_chave, vendas_pdv_caixa, vendas_garcom, vendas_validar_qr, vendas_pedidos, vendas_historico, vendas_fechamento, vendas_abre_caixa, vendas_sangria, vendas_ao_vivo, vendas_abrir_fechar_caixa, vendas_promoter_creditos_dinheiro, produtos_conferir_estoque, produtos_adicionar_entrada, produtos_criar_editar, produtos_criar_combo, produtos_inventario, eventos_criar, eventos_editar, eventos_abrir_encerrar, eventos_ver_financeiro, promoters_gerenciar, promoters_comissoes, promoters_ver_desempenho, financeiro_lancar_despesas, financeiro_ver_numeros, financeiro_fechar_caixa")
        .eq("user_id", user.id);
      if (error) throw error;
      if (!data || data.length === 0) return null;
      const staffRow = data.find((r) => r.role === "staff");
      return staffRow ?? data[0];
    },
    enabled: !!user,
  });

  const realIsOwner = data?.role === "owner";
  const ownerId = data?.owner_id ?? user?.id ?? null;

  // Aplica máscara apenas se o usuário real é owner
  const useMask = !!mask && realIsOwner;
  const isOwner = useMask ? mask!.isOwner : realIsOwner;
  const permissions = (useMask ? mask!.permissions : ((data?.permissions ?? []) as Permission[])) as Permission[];
  const rolePreset = (useMask ? (mask!.rolePreset ?? null) : (data?.role_preset ?? null)) as string | null;

  const can = (p: Permission) => isOwner || permissions.includes(p);

  // Helper para flags: durante máscara usa mask.flags (default false), senão usa row real
  const realRow = data as null | Record<string, unknown>;
  const flagOf = (key: string, defaultReal: boolean): boolean => {
    if (useMask) return mask!.flags[key] === true;
    const v = realRow?.[key];
    if (v === undefined || v === null) return defaultReal;
    return v === true;
  };

  const canDiscount = isOwner || flagOf("can_discount", false);
  const maxDiscountPercent = isOwner ? 100 : Number((useMask ? 0 : data?.max_discount_percent) ?? 0);
  const canAuthorize = isOwner || flagOf("can_authorize", false);

  const aceitaDinheiro = realIsOwner || flagOf("aceita_dinheiro", true);
  const aceitaPix = realIsOwner || flagOf("aceita_pix", true);
  const aceitaCartao = realIsOwner || flagOf("aceita_cartao", true);
  const aceitaCreditoPromoter = realIsOwner || flagOf("aceita_credito_promoter", false);
  const canConsumacao = realIsOwner || flagOf("pode_lancar_consumacao", false);
  const canPixChave = realIsOwner || flagOf("pode_pix_chave", false);
  const acceptedMethods: AcceptedMethod[] = [];
  if (aceitaDinheiro) acceptedMethods.push("dinheiro");
  if (aceitaCartao) acceptedMethods.push("debito", "credito");
  if (aceitaPix) acceptedMethods.push("pix");
  const canSellCash = aceitaDinheiro;

  const hasEstoque = can("estoque");
  const hasEventos = can("eventos");
  const hasPromoters = can("promoters");
  const hasFinanceiro = can("financeiro");

  // Produtos (sub-permissões; fallback legado `pode_adicionar_bebidas` para criar/editar/entrada)
  const legacyAddProducts = flagOf("pode_adicionar_bebidas", false);
  const canProdutosConferir = isOwner || (hasEstoque && flagOf("produtos_conferir_estoque", false));
  const canProdutosAddEntrada = isOwner || (hasEstoque && (flagOf("produtos_adicionar_entrada", false) || legacyAddProducts));
  const canProdutosCriarEditar = isOwner || (hasEstoque && (flagOf("produtos_criar_editar", false) || legacyAddProducts));
  const canProdutosCriarCombo = isOwner || (hasEstoque && (flagOf("produtos_criar_combo", false) || legacyAddProducts));
  const canProdutosInventario = isOwner || (hasEstoque && flagOf("produtos_inventario", false));
  // Mantém compat: qualquer permissão de Produtos = "pode entrar no módulo e fazer algo"
  const canAddProducts = canProdutosCriarEditar || canProdutosAddEntrada || canProdutosCriarCombo;

  // Eventos
  const canEventosCriar = isOwner || (hasEventos && flagOf("eventos_criar", false));
  const canEventosEditar = isOwner || (hasEventos && flagOf("eventos_editar", false));
  const canEventosAbrirEncerrar = isOwner || (hasEventos && flagOf("eventos_abrir_encerrar", false));
  const canEventosVerFinanceiro = isOwner || (hasEventos && flagOf("eventos_ver_financeiro", false));

  // Promoters
  const canPromotersGerenciar = isOwner || (hasPromoters && flagOf("promoters_gerenciar", false));
  const canPromotersComissoes = isOwner || (hasPromoters && flagOf("promoters_comissoes", false));
  const canPromotersVerDesempenho = isOwner || (hasPromoters && flagOf("promoters_ver_desempenho", false));

  // Financeiro
  const canFinLancarDespesas = isOwner || (hasFinanceiro && flagOf("financeiro_lancar_despesas", false));
  const canFinVerNumeros = isOwner || (hasFinanceiro && flagOf("financeiro_ver_numeros", false));
  const canFinFecharCaixa = isOwner || (hasFinanceiro && flagOf("financeiro_fechar_caixa", false));

  const lojinhaCanSell = realIsOwner || flagOf("lojinha_can_sell", false);
  const lojinhaPaymentMethods = (
    realIsOwner ? ["pix", "card"] : (useMask ? [] : ((data as { lojinha_payment_methods?: string[] } | null)?.lojinha_payment_methods ?? []))
  ) as Array<"pix" | "card">;
  const lojinhaPointDeviceId = useMask ? null : ((data as { lojinha_point_device_id?: string | null } | null)?.lojinha_point_device_id ?? null);
  const promoterId = useMask ? null : ((data as { promoter_id?: string | null } | null)?.promoter_id ?? null);


  const hasVendas = can("vendas");
  const hasLojinha = can("lojinha");
  const canPdvCaixa = isOwner || (hasVendas && flagOf("vendas_pdv_caixa", true));
  const canVenderGarcom = isOwner || (hasLojinha && flagOf("vendas_garcom", true) && lojinhaCanSell);
  const canValidarQr = isOwner || ((hasVendas || hasLojinha) && flagOf("vendas_validar_qr", true));
  const canVerPedidos = isOwner || ((hasVendas || hasLojinha) && flagOf("vendas_pedidos", true));
  const canVerHistorico = isOwner || ((hasVendas || hasLojinha) && flagOf("vendas_historico", true));
  // Nova flag única "abrir/fechar caixa" engloba as 2 antigas; mantemos retrocompat
  const canAbrirFecharCaixa = isOwner || (hasVendas && (flagOf("vendas_abrir_fechar_caixa", false) || flagOf("vendas_abre_caixa", false) || flagOf("vendas_fechamento", false)));
  const canFechamento = canAbrirFecharCaixa;
  const canAbrirCaixa = canAbrirFecharCaixa;
  const canSangria = isOwner || (hasVendas && flagOf("vendas_sangria", true));
  const canAoVivo = isOwner || flagOf("vendas_ao_vivo", false);
  // Crédito promoter em DINHEIRO (sub-flag de aceita_credito_promoter)
  const canPromoterCreditoDinheiro = isOwner || (aceitaCreditoPromoter && flagOf("vendas_promoter_creditos_dinheiro", false));

  return {
    isOwner,
    realIsOwner,
    ownerId,
    permissions,
    rolePreset,
    can,
    canDiscount,
    maxDiscountPercent,
    canSellCash,
    canAuthorize,
    acceptedMethods,
    aceitaDinheiro,
    aceitaPix,
    aceitaCartao,
    aceitaCreditoPromoter,
    canPromoterCredit: aceitaCreditoPromoter,
    canPromoterCreditoDinheiro,
    canConsumacao,
    canPixChave,
    canAddProducts,
    canProdutosConferir,
    canProdutosAddEntrada,
    canProdutosCriarEditar,
    canProdutosCriarCombo,
    canProdutosInventario,
    canEventosCriar,
    canEventosEditar,
    canEventosAbrirEncerrar,
    canEventosVerFinanceiro,
    canPromotersGerenciar,
    canPromotersComissoes,
    canPromotersVerDesempenho,
    canFinLancarDespesas,
    canFinVerNumeros,
    canFinFecharCaixa,
    lojinhaCanSell,
    lojinhaPaymentMethods,
    lojinhaPointDeviceId,
    promoterId,
    canPdvCaixa,
    canVenderGarcom,
    canValidarQr,
    canVerPedidos,
    canVerHistorico,
    canFechamento,
    canAbrirCaixa,
    canAbrirFecharCaixa,
    canSangria,
    canAoVivo,
    loading: isLoading,
  };
}
