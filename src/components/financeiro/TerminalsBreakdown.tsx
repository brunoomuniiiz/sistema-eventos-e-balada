import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { CreditCard, Loader2 } from "lucide-react";

type PaymentRow = { method: string; amount: number; terminal_id: string | null };
type TerminalRow = { id: string; label: string };

const METHOD_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX QR",
  pix_chave: "PIX Chave",
  credito: "Crédito",
  debito: "Débito",
  voucher: "Voucher",
  cortesia: "Cortesia",
};

export function TerminalsBreakdown() {
  const { ownerId } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["fin-by-terminal", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const [pays, terms] = await Promise.all([
        supabase
          .from("sale_payments")
          .select("method, amount, terminal_id, created_at")
          .gte("created_at", since.toISOString()),
        supabase.from("payment_terminals").select("id, label"),
      ]);
      if (pays.error) throw pays.error;
      if (terms.error) throw terms.error;
      return {
        payments: (pays.data ?? []) as PaymentRow[],
        terminals: (terms.data ?? []) as TerminalRow[],
      };
    },
  });

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const labelById = new Map((data?.terminals ?? []).map((t) => [t.id, t.label]));

  // Agrupa por terminal (ou "Sem maquininha" / "Sem cartão")
  const byTerminal = new Map<string, { total: number; byMethod: Map<string, number> }>();
  let cashAndPix = { dinheiro: 0, pix: 0, pix_chave: 0 };

  for (const p of data?.payments ?? []) {
    const amt = Number(p.amount);
    if (p.method === "credito" || p.method === "debito") {
      const key = p.terminal_id ?? "__nenhum__";
      const label = key === "__nenhum__" ? "Sem maquininha" : labelById.get(key) ?? "Maquininha removida";
      const entry = byTerminal.get(label) ?? { total: 0, byMethod: new Map() };
      entry.total += amt;
      entry.byMethod.set(p.method, (entry.byMethod.get(p.method) ?? 0) + amt);
      byTerminal.set(label, entry);
    } else if (p.method === "dinheiro" || p.method === "pix" || p.method === "pix_chave") {
      cashAndPix[p.method as keyof typeof cashAndPix] += amt;
    }
  }

  const terminalEntries = Array.from(byTerminal.entries()).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">Últimos 30 dias</div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MiniCard label="Dinheiro" value={cashAndPix.dinheiro} />
        <MiniCard label="PIX (QR)" value={cashAndPix.pix} />
        <MiniCard label="PIX (Chave)" value={cashAndPix.pix_chave} />
      </div>

      <div className="space-y-3">
        <div className="text-sm font-medium flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" /> Por maquininha
        </div>
        {terminalEntries.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum pagamento em cartão ainda.
          </CardContent></Card>
        ) : (
          terminalEntries.map(([label, e]) => (
            <Card key={label} className="glass border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{label}</div>
                  <div className="text-lg font-bold text-primary">{formatBRL(e.total)}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  {Array.from(e.byMethod.entries()).map(([m, v]) => (
                    <div key={m} className="flex justify-between rounded bg-muted/30 px-2 py-1">
                      <span className="text-muted-foreground">{METHOD_LABEL[m] ?? m}</span>
                      <span className="font-medium">{formatBRL(v)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
        <div className="font-semibold text-lg">{formatBRL(value)}</div>
      </CardContent>
    </Card>
  );
}
