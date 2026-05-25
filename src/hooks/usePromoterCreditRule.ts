import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PromoterCreditRule = {
  id: string;
  scope: "global" | "promoter" | "event_promoter";
  enabled: boolean;
  min_purchase: number;
  max_percent: number;
  excluded_product_ids: string[];
  excluded_category_ids: string[];
  notes: string | null;
};

const DEFAULT_RULE: PromoterCreditRule = {
  id: "default",
  scope: "global",
  enabled: true,
  min_purchase: 0,
  max_percent: 100,
  excluded_product_ids: [],
  excluded_category_ids: [],
  notes: null,
};

function normalize(r: any): PromoterCreditRule {
  return {
    id: r.id,
    scope: r.scope,
    enabled: !!r.enabled,
    min_purchase: Number(r.min_purchase ?? 0),
    max_percent: Number(r.max_percent ?? 100),
    excluded_product_ids: r.excluded_product_ids ?? [],
    excluded_category_ids: r.excluded_category_ids ?? [],
    notes: r.notes ?? null,
  };
}

/** Resolve a regra mais específica (event_promoter > promoter > global). */
export function usePromoterCreditRule(promoterId?: string | null, eventId?: string | null) {
  return useQuery({
    queryKey: ["promoter-credit-rule", promoterId ?? null, eventId ?? null],
    enabled: !!promoterId,
    queryFn: async (): Promise<PromoterCreditRule> => {
      const { data } = await supabase
        .from("promoter_credit_rules")
        .select("*")
        .or([
          "scope.eq.global",
          promoterId ? `and(scope.eq.promoter,promoter_id.eq.${promoterId})` : "",
          promoterId && eventId
            ? `and(scope.eq.event_promoter,promoter_id.eq.${promoterId},event_id.eq.${eventId})`
            : "",
        ].filter(Boolean).join(","));
      const rows = (data ?? []).map(normalize);
      return (
        rows.find((r) => r.scope === "event_promoter") ??
        rows.find((r) => r.scope === "promoter") ??
        rows.find((r) => r.scope === "global") ??
        DEFAULT_RULE
      );
    },
  });
}

export type CartLine = { product_id: string; unit_price: number; quantity: number };

/** Calcula valor máximo de crédito que pode ser usado dado o carrinho e a regra. */
export async function computeMaxCredit(
  cart: CartLine[],
  rule: PromoterCreditRule,
): Promise<{ max: number; eligible: number; reason?: string }> {
  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  if (!rule.enabled) return { max: 0, eligible: 0, reason: "Crédito desativado" };
  if (subtotal < rule.min_purchase) {
    return { max: 0, eligible: 0, reason: `Compra mínima de R$ ${rule.min_purchase.toFixed(2)}` };
  }
  // se há exclusões por categoria, precisa buscar categorias dos produtos
  let eligible = subtotal;
  const ids = cart.map((c) => c.product_id);
  if ((rule.excluded_product_ids.length || rule.excluded_category_ids.length) && ids.length) {
    const { data: prods } = await supabase
      .from("products")
      .select("id, category_id")
      .in("id", ids);
    const catById = new Map((prods ?? []).map((p) => [p.id, p.category_id]));
    eligible = cart.reduce((s, i) => {
      const excludedProd = rule.excluded_product_ids.includes(i.product_id);
      const cat = catById.get(i.product_id);
      const excludedCat = cat && rule.excluded_category_ids.includes(cat);
      if (excludedProd || excludedCat) return s;
      return s + i.unit_price * i.quantity;
    }, 0);
  }
  const max = Math.max(0, (eligible * rule.max_percent) / 100);
  return { max: +max.toFixed(2), eligible: +eligible.toFixed(2) };
}
