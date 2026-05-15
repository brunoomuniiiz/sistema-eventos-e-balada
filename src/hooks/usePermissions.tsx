import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Permission =
  | "vendas"
  | "estoque"
  | "eventos"
  | "promoters"
  | "financeiro"
  | "funcionarios";

export const ALL_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "vendas", label: "Vendas" },
  { key: "estoque", label: "Estoque" },
  { key: "eventos", label: "Eventos" },
  { key: "promoters", label: "Promoters" },
  { key: "financeiro", label: "Financeiro" },
  { key: "funcionarios", label: "Funcionários" },
];

export function usePermissions() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["my-role", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, permissions, owner_id, can_discount, max_discount_percent, can_sell_cash")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const isOwner = data?.role === "owner";
  const ownerId = data?.owner_id ?? user?.id ?? null;
  const permissions = (data?.permissions ?? []) as Permission[];

  const can = (p: Permission) => isOwner || permissions.includes(p);

  const canDiscount = isOwner || !!data?.can_discount;
  const maxDiscountPercent = isOwner ? 100 : Number(data?.max_discount_percent ?? 0);
  const canSellCash = isOwner || data?.can_sell_cash !== false;

  return {
    isOwner,
    ownerId,
    permissions,
    can,
    canDiscount,
    maxDiscountPercent,
    canSellCash,
    loading: isLoading,
  };
}
