// Helper to filter what should be printed based on per-funcionário rules.
import { supabase } from "@/integrations/supabase/client";

export type PrintTrigger = "sale" | "scan";

let cache: { roleId: string | null; allowed: Map<PrintTrigger, Set<string>>; ts: number } | null = null;
const TTL_MS = 30_000;

async function getMyRoleId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_roles")
    .select("id, role")
    .eq("user_id", userId);
  if (!data || data.length === 0) return null;
  const staff = data.find((r) => r.role === "staff");
  return (staff ?? data[0]).id as string;
}

export async function getAllowedCategoryIds(
  userId: string,
  trigger: PrintTrigger,
): Promise<Set<string> | null> {
  // null = no restriction (print everything); empty Set = print nothing
  if (cache && Date.now() - cache.ts < TTL_MS) {
    return cache.allowed.get(trigger) ?? null;
  }
  const roleId = await getMyRoleId(userId);
  if (!roleId) return null;
  const { data } = await supabase
    .from("print_rules")
    .select("category_id, print_on_sale, print_on_scan")
    .eq("user_role_id", roleId);
  // No rules at all → don't restrict (legacy default).
  if (!data || data.length === 0) {
    cache = { roleId, allowed: new Map(), ts: Date.now() };
    return null; // Retorna null para permitir impressão de TUDO por padrão
  }
  const onSale = new Set<string>();
  const onScan = new Set<string>();
  for (const r of data) {
    if (r.print_on_sale) onSale.add(r.category_id as string);
    if (r.print_on_scan) onScan.add(r.category_id as string);
  }
  const map = new Map<PrintTrigger, Set<string>>([
    ["sale", onSale],
    ["scan", onScan],
  ]);
  cache = { roleId, allowed: map, ts: Date.now() };
  return map.get(trigger) ?? null;
}

export function clearPrintRulesCache() {
  cache = null;
}
