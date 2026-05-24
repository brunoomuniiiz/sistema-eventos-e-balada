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
        .select("role, permissions, owner_id, can_discount, max_discount_percent, can_sell_cash, can_authorize, role_preset, lojinha_can_sell, lojinha_payment_methods, lojinha_point_device_id, pode_adicionar_bebidas, aceita_dinheiro, aceita_pix, aceita_cartao, aceita_credito_promoter, pode_lancar_consumacao, vendas_pdv_caixa, vendas_garcom, vendas_validar_qr, vendas_pedidos, vendas_historico, vendas_fechamento, vendas_abre_caixa, vendas_sangria, vendas_ao_vivo")
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
  const rolePreset = (data?.role_preset ?? null) as string | null;

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

  const aceitaDinheiro = isOwner || flagOf("aceita_dinheiro", true);
  const aceitaPix = isOwner || flagOf("aceita_pix", true);
  const aceitaCartao = isOwner || flagOf("aceita_cartao", true);
  const aceitaCreditoPromoter = isOwner || flagOf("aceita_credito_promoter", false);
  const canConsumacao = isOwner || flagOf("pode_lancar_consumacao", false);
  const acceptedMethods: AcceptedMethod[] = [];
  if (aceitaDinheiro) acceptedMethods.push("dinheiro");
  if (aceitaCartao) acceptedMethods.push("debito", "credito");
  if (aceitaPix) acceptedMethods.push("pix");
  const canSellCash = aceitaDinheiro;

  const canAddProducts = isOwner || (flagOf("pode_adicionar_bebidas", false) && can("estoque"));

  const lojinhaCanSell = isOwner || flagOf("lojinha_can_sell", false);
  const lojinhaPaymentMethods = (
    isOwner ? ["pix", "card"] : (useMask ? [] : ((data as { lojinha_payment_methods?: string[] } | null)?.lojinha_payment_methods ?? []))
  ) as Array<"pix" | "card">;
  const lojinhaPointDeviceId = useMask ? null : ((data as { lojinha_point_device_id?: string | null } | null)?.lojinha_point_device_id ?? null);

  const hasVendas = can("vendas");
  const hasLojinha = can("lojinha");
  const canPdvCaixa = isOwner || (hasVendas && flagOf("vendas_pdv_caixa", true));
  const canVenderGarcom = isOwner || (hasLojinha && flagOf("vendas_garcom", true) && lojinhaCanSell);
  const canValidarQr = isOwner || ((hasVendas || hasLojinha) && flagOf("vendas_validar_qr", true));
  const canVerPedidos = isOwner || ((hasVendas || hasLojinha) && flagOf("vendas_pedidos", true));
  const canVerHistorico = isOwner || ((hasVendas || hasLojinha) && flagOf("vendas_historico", true));
  const canFechamento = isOwner || (hasVendas && flagOf("vendas_fechamento", true));
  const canAbrirCaixa = isOwner || (hasVendas && flagOf("vendas_abre_caixa", true));
  const canSangria = isOwner || (hasVendas && flagOf("vendas_sangria", true));

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
    canConsumacao,
    canAddProducts,
    lojinhaCanSell,
    lojinhaPaymentMethods,
    lojinhaPointDeviceId,
    canPdvCaixa,
    canVenderGarcom,
    canValidarQr,
    canVerPedidos,
    canVerHistorico,
    canFechamento,
    canAbrirCaixa,
    canSangria,
    loading: isLoading,
  };
}
