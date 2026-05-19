import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  const { data, isLoading } = useQuery({
    queryKey: ["my-role", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, permissions, owner_id, can_discount, max_discount_percent, can_sell_cash, can_authorize, role_preset, lojinha_can_sell, lojinha_payment_methods, lojinha_point_device_id, pode_adicionar_bebidas, aceita_dinheiro, aceita_pix, aceita_cartao")
        .eq("user_id", user.id);
      if (error) throw error;
      if (!data || data.length === 0) return null;
      // Se houver múltiplas linhas (ex.: também é staff em outro bar), prioriza staff
      const staffRow = data.find((r) => r.role === "staff");
      return staffRow ?? data[0];
    },
    enabled: !!user,
  });

  const isOwner = data?.role === "owner";
  const ownerId = data?.owner_id ?? user?.id ?? null;
  const permissions = (data?.permissions ?? []) as Permission[];
  const rolePreset = (data?.role_preset ?? null) as string | null;

  const can = (p: Permission) => isOwner || permissions.includes(p);

  const canDiscount = isOwner || !!data?.can_discount;
  const maxDiscountPercent = isOwner ? 100 : Number(data?.max_discount_percent ?? 0);
  const canAuthorize = isOwner || !!data?.can_authorize;

  // Métodos de pagamento aceitos (configuráveis por funcionário)
  const row = data as null | {
    aceita_dinheiro?: boolean;
    aceita_pix?: boolean;
    aceita_cartao?: boolean;
    pode_adicionar_bebidas?: boolean;
    can_sell_cash?: boolean;
  };
  const aceitaDinheiro = isOwner || row?.aceita_dinheiro !== false;
  const aceitaPix = isOwner || row?.aceita_pix !== false;
  const aceitaCartao = isOwner || row?.aceita_cartao !== false;
  const acceptedMethods: AcceptedMethod[] = [];
  if (aceitaDinheiro) acceptedMethods.push("dinheiro");
  if (aceitaCartao) acceptedMethods.push("debito", "credito");
  if (aceitaPix) acceptedMethods.push("pix");
  // Compat: canSellCash continua refletindo dinheiro
  const canSellCash = aceitaDinheiro;

  // Permissão de cadastrar bebidas novas (sub-permissão de estoque)
  const canAddProducts = isOwner || (!!row?.pode_adicionar_bebidas && can("estoque"));

  // Lojinha — modo caixa
  const lojinhaCanSell = isOwner || !!(data as { lojinha_can_sell?: boolean } | null)?.lojinha_can_sell;
  const lojinhaPaymentMethods = (
    isOwner ? ["pix", "card"] : ((data as { lojinha_payment_methods?: string[] } | null)?.lojinha_payment_methods ?? [])
  ) as Array<"pix" | "card">;
  const lojinhaPointDeviceId = (data as { lojinha_point_device_id?: string | null } | null)?.lojinha_point_device_id ?? null;

  return {
    isOwner,
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
    canAddProducts,
    lojinhaCanSell,
    lojinhaPaymentMethods,
    lojinhaPointDeviceId,
    loading: isLoading,
  };
}
