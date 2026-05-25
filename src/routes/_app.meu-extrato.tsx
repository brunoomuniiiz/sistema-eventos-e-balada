import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Sparkles, TrendingDown, TrendingUp, Calendar, ChevronRight, Receipt } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/meu-extrato")({
  component: MeuExtratoPage,
});

type TimelineItem =
  | { kind: "credit"; id: string; at: string; amount: number; source: string; gender: string | null; eventId: string | null }
  | { kind: "redemption"; id: string; at: string; amount: number; saleId: string; eventId: string | null };

function MeuExtratoPage() {
  const { user } = useAuth();
  const [openSaleId, setOpenSaleId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["promoter-statement", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: prs } = await supabase
        .from("promoters")
        .select("id")
        .eq("user_id", user!.id);
      const ids = (prs ?? []).map((p) => p.id);
      if (ids.length === 0) {
        return { items: [] as TimelineItem[], earned: 0, spent: 0, balance: 0, events: {} as Record<string, { name: string; date: string }> };
      }

      const [{ data: credits }, { data: redemptions }] = await Promise.all([
        supabase.from("promoter_credits")
          .select("id, amount, source, status, gender, created_at, event_id")
          .in("promoter_id", ids)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("promoter_credit_redemptions")
          .select("id, amount, created_at, sale_id")
          .in("promoter_id", ids)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      const earned = (credits ?? []).reduce((s, c) => s + Number(c.amount ?? 0), 0);
      const spent = (redemptions ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const active = (credits ?? []).filter((c) => c.status === "active").reduce((s, c) => s + Number(c.amount ?? 0), 0);
      const balance = Math.max(0, active - spent);

      // event_id por sale_id para agrupar consumo no mesmo evento
      const saleIds = (redemptions ?? []).map((r) => r.sale_id).filter((x): x is string => !!x);
      const saleEvent: Record<string, string | null> = {};
      if (saleIds.length) {
        const { data: ss } = await supabase.from("sales").select("id, event_id").in("id", saleIds);
        for (const s of ss ?? []) saleEvent[s.id] = s.event_id;
      }

      const items: TimelineItem[] = [
        ...(credits ?? []).map((c): TimelineItem => ({
          kind: "credit",
          id: c.id,
          at: c.created_at,
          amount: Number(c.amount ?? 0),
          source: c.source ?? "—",
          gender: c.gender,
          eventId: c.event_id ?? null,
        })),
        ...(redemptions ?? []).map((r): TimelineItem => ({
          kind: "redemption",
          id: r.id,
          at: r.created_at,
          amount: Number(r.amount ?? 0),
          saleId: r.sale_id ?? "",
          eventId: r.sale_id ? saleEvent[r.sale_id] ?? null : null,
        })),
      ].sort((a, b) => (a.at < b.at ? 1 : -1));

      const evIds = Array.from(new Set(items.map((i) => i.eventId).filter(Boolean) as string[]));
      const events: Record<string, { name: string; date: string }> = {};
      if (evIds.length) {
        const { data: evs } = await supabase.from("events").select("id, name, date").in("id", evIds);
        for (const e of evs ?? []) events[e.id] = { name: e.name, date: e.date };
      }

      return { items, earned, spent, balance, events };
    },
  });

  const grouped = useMemo(() => {
    const buckets: Record<string, { name: string; date: string; items: TimelineItem[]; ganho: number; gasto: number }> = {};
    for (const it of data?.items ?? []) {
      const key = it.eventId ?? "sem-evento";
      if (!buckets[key]) {
        const meta = it.eventId ? data!.events[it.eventId] : null;
        buckets[key] = {
          name: meta?.name ?? "Sem evento",
          date: meta?.date ?? it.at,
          items: [],
          ganho: 0,
          gasto: 0,
        };
      }
      buckets[key].items.push(it);
      if (it.kind === "credit") buckets[key].ganho += it.amount;
      else buckets[key].gasto += it.amount;
    }
    return Object.entries(buckets).sort((a, b) => (a[1].date < b[1].date ? 1 : -1));
  }, [data]);

  return (
    <div className="space-y-4">
      <PageHeader title="Extrato" subtitle="Seu saldo e movimentações" />

      {/* Cabeçalho estilo banco */}
      <Card className="overflow-hidden border-primary/30">
        <CardContent className="p-5 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Saldo disponível</div>
              <div className="mt-1 text-4xl font-bold text-success flex items-center gap-2">
                <Sparkles className="h-7 w-7" />
                {formatBRL(data?.balance ?? 0)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Ganho {formatBRL(data?.earned ?? 0)} · Gasto {formatBRL(data?.spent ?? 0)}
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="gap-1"><TrendingUp className="h-3 w-3 text-success" /> {formatBRL(data?.earned ?? 0)}</Badge>
              <Badge variant="outline" className="gap-1"><TrendingDown className="h-3 w-3 text-destructive" /> {formatBRL(data?.spent ?? 0)}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Sem movimentações por enquanto.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {grouped.map(([key, ev]) => (
            <Card key={key}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <Calendar className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{ev.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {format(new Date(ev.date), "dd 'de' MMM, yyyy", { locale: ptBR })}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-muted-foreground">Saldo do evento</div>
                    <div className={`text-sm font-bold ${ev.ganho - ev.gasto >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatBRL(ev.ganho - ev.gasto)}
                    </div>
                  </div>
                </div>

                <div className="pt-2 space-y-1">
                  {ev.items.map((it) => it.kind === "credit" ? (
                    <div key={it.id} className="flex items-center gap-2 py-1.5 text-xs">
                      <div className="h-7 w-7 rounded-full bg-success/15 grid place-items-center shrink-0">
                        <TrendingUp className="h-3.5 w-3.5 text-success" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate">
                          {it.source === "list_name" ? "Nome na lista" : it.source === "campaign" ? "Campanha" : it.source}
                          {it.gender ? ` · ${it.gender}` : ""}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {format(new Date(it.at), "dd/MM HH:mm", { locale: ptBR })}
                        </div>
                      </div>
                      <span className="font-semibold text-success whitespace-nowrap">+{formatBRL(it.amount)}</span>
                    </div>
                  ) : (
                    <button
                      key={it.id}
                      onClick={() => setOpenSaleId(it.saleId)}
                      className="w-full flex items-center gap-2 py-1.5 text-xs hover:bg-muted/40 rounded px-1 -mx-1 transition-colors text-left"
                    >
                      <div className="h-7 w-7 rounded-full bg-destructive/15 grid place-items-center shrink-0">
                        <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate">Consumo no bar</div>
                        <div className="text-[10px] text-muted-foreground">
                          {format(new Date(it.at), "dd/MM HH:mm", { locale: ptBR })}
                        </div>
                      </div>
                      <span className="font-semibold text-destructive whitespace-nowrap">-{formatBRL(it.amount)}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SaleDetailSheet saleId={openSaleId} onClose={() => setOpenSaleId(null)} />
    </div>
  );
}

function SaleDetailSheet({ saleId, onClose }: { saleId: string | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["sale-detail", saleId],
    enabled: !!saleId,
    queryFn: async () => {
      const [{ data: sale }, { data: items }] = await Promise.all([
        supabase.from("sales").select("id, total, created_at, employee_name, payment_method").eq("id", saleId!).maybeSingle(),
        supabase.from("sale_items").select("id, product_name, quantity, unit_price, subtotal").eq("sale_id", saleId!),
      ]);
      return { sale, items: items ?? [] };
    },
  });

  return (
    <Sheet open={!!saleId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Detalhes do consumo</SheetTitle>
        </SheetHeader>
        {data?.sale && (
          <div className="mt-3 space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="text-xs text-muted-foreground">
              {format(new Date(data.sale.created_at), "EEE dd 'de' MMM, HH:mm", { locale: ptBR })}
              {data.sale.employee_name ? ` · vendido por ${data.sale.employee_name}` : ""}
            </div>
            <div className="space-y-1">
              {data.items.map((i) => (
                <div key={i.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex-1 truncate">
                    <span className="font-medium">{i.quantity}×</span> {i.product_name}
                  </div>
                  <span className="text-muted-foreground">{formatBRL(Number(i.subtotal))}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-sm font-semibold pt-2">
              <span>Total</span>
              <span>{formatBRL(Number(data.sale.total))}</span>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
