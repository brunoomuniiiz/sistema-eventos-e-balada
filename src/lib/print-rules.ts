// Helper to filter what should be printed based on per-funcionário rules (categories and products).
import { supabase } from "@/integrations/supabase/client";

export type PrintTrigger = "sale" | "scan";

type RuleSet = {
  categories: Map<PrintTrigger, Set<string>>;
  productAllowed: Map<PrintTrigger, Set<string>>;
  productDenied: Map<PrintTrigger, Set<string>>;
  hasRules: boolean;
};

let cache: { roleId: string | null; rules: RuleSet; ts: number } | null = null;
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

export async function getPrintRules(userId: string): Promise<RuleSet | null> {
  if (cache && Date.now() - cache.ts < TTL_MS) {
    return cache.rules;
  }
  const roleId = await getMyRoleId(userId);
  if (!roleId) return null;

  const [catRes, prodRes] = await Promise.all([
    supabase
      .from("print_rules")
      .select("category_id, print_on_sale, print_on_scan")
      .eq("user_role_id", roleId),
    supabase
      .from("print_rules_products")
      .select("product_id, print_on_sale, print_on_scan")
      .eq("user_role_id", roleId),
  ]);

  const catData = catRes.data ?? [];
  const prodData = prodRes.data ?? [];

  const onSaleCats = new Set<string>();
  const onScanCats = new Set<string>();
  for (const r of catData) {
    if (r.print_on_sale) onSaleCats.add(r.category_id as string);
    if (r.print_on_scan) onScanCats.add(r.category_id as string);
  }

  const onSaleProdAllowed = new Set<string>();
  const onSaleProdDenied = new Set<string>();
  const onScanProdAllowed = new Set<string>();
  const onScanProdDenied = new Set<string>();

  for (const r of prodData) {
    if (r.print_on_sale) onSaleProdAllowed.add(r.product_id as string);
    else onSaleProdDenied.add(r.product_id as string);

    if (r.print_on_scan) onScanProdAllowed.add(r.product_id as string);
    else onScanProdDenied.add(r.product_id as string);
  }

  const rules: RuleSet = {
    categories: new Map([["sale", onSaleCats], ["scan", onScanCats]]),
    productAllowed: new Map([["sale", onSaleProdAllowed], ["scan", onScanProdAllowed]]),
    productDenied: new Map([["sale", onSaleProdDenied], ["scan", onScanProdDenied]]),
    hasRules: catData.length > 0 || prodData.length > 0
  };

  cache = { roleId, rules, ts: Date.now() };
  return rules;
}

export async function shouldPrintItem(
  userId: string,
  trigger: PrintTrigger,
  categoryId: string | null,
  productId: string,
): Promise<boolean> {
  const rules = await getPrintRules(userId);
  if (!rules || !rules.hasRules) return true; // Default: print everything if no rules

  // 1. Product-level explicit ALLOW
  if (rules.productAllowed.get(trigger)?.has(productId)) return true;
  
  // 2. Product-level explicit DENY
  if (rules.productDenied.get(trigger)?.has(productId)) return false;

  // 3. Category-level fallback
  if (!categoryId) return true; // Se sem categoria e não bloqueado por produto, imprime
  return rules.categories.get(trigger)?.has(categoryId) ?? true;
}

/** @deprecated Use shouldPrintItem or getPrintRules */
export async function getAllowedCategoryIds(userId: string, trigger: PrintTrigger): Promise<Set<string> | null> {
  const rules = await getPrintRules(userId);
  if (!rules || !rules.hasRules) return null;
  return rules.categories.get(trigger) ?? null;
}

export function clearPrintRulesCache() {
  cache = null;
}
