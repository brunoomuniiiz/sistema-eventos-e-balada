// Helper to filter what should be printed based on per-funcionário rules (categories and products).
import { supabase } from "@/integrations/supabase/client";

export type PrintTrigger = "sale" | "scan";

type RuleSet = {
  categories: Map<PrintTrigger, Set<string>>;
  products: Map<PrintTrigger, Set<string>>; // ID do produto -> boolean (se deve imprimir)
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

  const onSaleProds = new Set<string>();
  const onScanProds = new Set<string>();
  for (const r of prodData) {
    if (r.print_on_sale) onSaleProds.add(r.product_id as string);
    if (r.print_on_scan) onScanProds.add(r.product_id as string);
  }

  const rules: RuleSet = {
    categories: new Map([["sale", onSaleCats], ["scan", onScanCats]]),
    products: new Map([["sale", onSaleProds], ["scan", onScanProds]]),
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
  if (!rules) return true; // Default: print everything if no role
  if (!rules.hasRules) return true; // Default: print everything if no specific rules

  // 1. Check product-level rules first (specific override)
  // We assume that if a product is in print_rules_products, its setting is absolute
  const prodAllowed = rules.products.get(trigger);
  
  // NOTE: If the user explicitly added a product rule, we follow it.
  // How do we know if it was explicitly added?
  // We need to fetch all product rules. If a product ID is NOT in the DB, 
  // it should follow the category rule.
  
  // Actually, my migration allows for specific product overrides.
  // Let's refine the RuleSet to know which products have EXPLICIT rules.
}

export function clearPrintRulesCache() {
  cache = null;
}
