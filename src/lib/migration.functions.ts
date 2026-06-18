import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ALLOWED_EMAIL = "mateusdeleonmd@gmail.com";

// Ordem aproximada respeitando FKs (pais antes de filhos).
const TABLES: string[] = [
  // Cadastros básicos
  "profiles",
  "employees",
  "suppliers",
  "stock_locations",
  "product_categories",
  "cost_categories",
  "bar_expense_categories",
  "payment_terminals",
  "printers",
  "cash_register_sectors",
  "bar_settings",
  "daily_order_counter",

  // Produtos
  "products",
  "combo_items",
  "product_stock",
  "print_rules",
  "print_rules_products",

  // Equipe / permissões
  "user_roles",
  "auth_grants",
  "terminal_assignments",

  // Promoters
  "promoters",
  "promoter_credit_rules",
  "promoter_credit_campaigns",
  "promoter_credit_campaign_members",

  // Eventos
  "events",
  "event_promoters",
  "ticket_types",
  "guest_list_entries",
  "event_costs",
  "event_financials",
  "event_drink_consumption",
  "event_entries",
  "event_closings",
  "event_closing_terminals",
  "event_promoter_commissions",

  // Caixa
  "cash_sessions",
  "cash_withdrawals",
  "cash_closings",

  // Vendas
  "sales",
  "sale_items",
  "sale_payments",
  "pix_charges",

  // Estoque
  "stock_purchases",
  "stock_purchase_items",
  "stock_inventories",
  "stock_inventory_items",
  "stock_transfers",
  "stock_ledger",

  // Financeiro
  "bar_expenses",
  "expense_offsets",
  "monthly_plans",

  // Promoter créditos
  "promoter_credits",
  "promoter_credit_redemptions",

  // Lojinha
  "lojinha_settings",
  "lojinha_point_devices",
  "lojinha_orders",
  "lojinha_order_items",
  "lojinha_order_units",
  "lojinha_stock_reservations",
];

const Input = z.object({
  targetUrl: z.string().url(),
  targetServiceKey: z.string().min(20),
  tables: z.array(z.string()).optional(),
  truncate: z.boolean().optional(),
});

export const listMigrationTables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (context.claims.email !== ALLOWED_EMAIL) throw new Error("Acesso negado");
    return { tables: TABLES };
  });

export const runMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    if (context.claims.email !== ALLOWED_EMAIL) throw new Error("Acesso negado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const targetUrl = data.targetUrl.replace(/\/$/, "");
    const targetKey = data.targetServiceKey;
    const tables = data.tables?.length ? data.tables : TABLES;

    const results: Array<{
      table: string;
      read: number;
      written: number;
      error?: string;
    }> = [];

    const BATCH = 500;

    for (const table of tables) {
      let read = 0;
      let written = 0;
      let errorMsg: string | undefined;

      try {
        // Lê em páginas
        let from = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data: rows, error } = await (supabaseAdmin as unknown as {
            from: (t: string) => {
              select: (s: string) => {
                range: (a: number, b: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
              };
            };
          })
            .from(table)
            .select("*")
            .range(from, from + BATCH - 1);
          if (error) throw new Error(error.message);
          if (!rows || rows.length === 0) break;
          read += rows.length;

          // Envia para o destino via PostgREST com upsert
          const res = await fetch(`${targetUrl}/rest/v1/${table}`, {
            method: "POST",
            headers: {
              apikey: targetKey,
              Authorization: `Bearer ${targetKey}`,
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(rows),
          });

          if (!res.ok) {
            const txt = await res.text();
            throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
          }
          written += rows.length;

          if (rows.length < BATCH) break;
          from += BATCH;
        }
      } catch (e) {
        errorMsg = e instanceof Error ? e.message : String(e);
      }

      results.push({ table, read, written, error: errorMsg });
    }

    return { ok: true, results };
  });
