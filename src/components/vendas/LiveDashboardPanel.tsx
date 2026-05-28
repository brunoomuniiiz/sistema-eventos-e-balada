import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/format";
import { Activity, ArrowDownToLine, Banknote, CreditCard, QrCode, Trophy, Package, Layers, Link as LinkIcon, Check, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { QuickEventCostCard } from "@/components/vendas/QuickEventCostCard";
import { ConsumacaoLivePanel } from "@/components/vendas/ConsumacaoLivePanel";
import { QuickConsumacaoCard } from "@/components/vendas/QuickConsumacaoCard";
import { LiveDrinkCostPanel } from "@/components/eventos/LiveDrinkCostPanel";
import { DrinkMarginCard } from "@/components/eventos/DrinkMarginCard";
import { usePermissions } from "@/hooks/usePermissions";
import { Wine } from "lucide-react";

type Period = "today" | "yesterday" | "event" | "7d" | "30d";

type Dashboard = {
  totals: { total: number; dinheiro: number; pix: number; debito: number; credito: number; outros: number; n_sales: number };
  by_channel: Array<{ channel: string; total: number; n_sales: number }>;
  by_seller: Array<{ seller_user_id: string | null; seller_name: string; channels: string[]; n_sales: number; total: number; dinheiro: number; pix: number; debito: number; credito: number }>;
  top_products: Array<{ name: string; qty: number; total: number }>;
  withdrawals: Array<{ id: string; amount: number; reason: string | null; created_at: string; created_by_name: string | null; authorized_by_name: string | null }>;
  withdrawals_total: number;
};

function periodRange(p: Period, eventDate: string | null): { from: Date; to: Date; label: string } {
  const now = new Date();
  if (p === "event" && eventDate) {
    const d = new Date(eventDate);
    const from = new Date(d); from.setHours(d.getHours() - 6, 0, 0, 0);
    const to = new Date(d); to.setDate(to.getDate() + 1); to.setHours(12, 0, 0, 0);
    return { from, to, label: "Evento atual" };
  }
  if (p === "yesterday") {
    const from = new Date(now); from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    return { from, to, label: "Ontem" };
  }
  if (p === "7d") {
    const from = new Date(now); from.setDate(from.getDate() - 7);
    return { from, to: now, label: "Últimos 7 dias" };
  }
  if (p === "30d") {
    const from = new Date(now); from.setDate(from.getDate() - 30);
    return { from, to: now, label: "Últimos 30 dias" };
  }
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const to = new Date(now); to.setDate(to.getDate() + 1); to.setHours(0, 0, 0, 0);
  return { from, to, label: "Hoje" };
}

const channelLabels: Record<string, string> = {
  presencial: "PDV Caixa",
  pos: "Garçom (POS)",
  lojinha: "Lojinha online",
  portaria: "Portaria",
};

export function LiveDashboardPanel() {
  const { isOwner } = usePermissions();
  const { data: openEvent } = useQuery({
    queryKey: ["dashboard-open-event"],
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, name, date, status")
        .in("status", ["ongoing", "upcoming"])
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 30000,
  });

  const defaultPeriod: Period = openEvent ? "event" : "today";
  const [period, setPeriod] = useState<Period | null>(null);
  const effective: Period = period ?? defaultPeriod;
  const range = useMemo(() => periodRange(effective, openEvent?.date ?? null), [effective, openEvent?.date]);

  const { data, isLoading } = useQuery({
    queryKey: ["live-dashboard", range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_live_dashboard" as never, {
        _from: range.from.toISOString(),
        _to: range.to.toISOString(),
      } as never);
      if (error) throw error;
      return data as unknown as Dashboard;
    },
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-4">
      {/* Header com filtro */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="font-display font-bold text-lg">Painel ao vivo</h3>
            <Badge variant="outline" className="ml-2">{range.label}</Badge>
            <span className="text-xs text-muted-foreground hidden md:inline">
              atualiza a cada 10s
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select value={effective} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-[180px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {openEvent && <SelectItem value="event">Evento ({openEvent.name})</SelectItem>}
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {openEvent && (
        <>
          <QuickEventCostCard eventId={openEvent.id} eventName={openEvent.name} />
          <QuickConsumacaoCard eventId={openEvent.id} eventName={openEvent.name} />
          {isOwner && (
            <Card className="border-primary/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Wine className="h-4 w-4 text-primary" />
                  <span className="font-display font-bold">Drinks abertos (consumação interna)</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Clique +1 a cada garrafa fechada aberta para drinks. Baixa do estoque e entra no CMV do evento.
                </p>
                <LiveDrinkCostPanel eventId={openEvent.id} />
              </CardContent>
            </Card>
          )}
          {isOwner && <DrinkMarginCard eventId={openEvent.id} />}
          <ConsumacaoLivePanel eventId={openEvent.id} eventName={openEvent.name} />
          <LiveLinksConversionPanel eventId={openEvent.id} />
        </>
      )}


      {isLoading && !data ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando…</CardContent></Card>
      ) : !data ? null : (
        <>
          {/* Faturamento bruto */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Faturamento bruto</span>
                <span className="text-xs text-muted-foreground">{data.totals.n_sales} vendas</span>
              </div>
              <div className="text-4xl font-display font-bold">{formatBRL(data.totals.total)}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 pt-2">
                <MethodCard icon={<Banknote className="h-4 w-4" />} label="Dinheiro (bruto)" shortLabel="Dinh." value={data.totals.dinheiro} total={data.totals.total} />
                <MethodCard icon={<QrCode className="h-4 w-4" />} label="Pix" shortLabel="Pix" value={data.totals.pix} total={data.totals.total} />
                <MethodCard icon={<CreditCard className="h-4 w-4" />} label="Débito" shortLabel="Déb." value={data.totals.debito} total={data.totals.total} />
                <MethodCard icon={<CreditCard className="h-4 w-4" />} label="Crédito" shortLabel="Créd." value={data.totals.credito} total={data.totals.total} />
              </div>
            </CardContent>
          </Card>

          {/* Sangrias */}
          <Card className="border-destructive/30">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <ArrowDownToLine className="h-4 w-4 text-destructive" />
                  <span className="font-display font-bold">Sangrias no período</span>
                </div>
                <span className="font-semibold text-destructive">{formatBRL(data.withdrawals_total)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Não desconta do faturamento — só desconta na hora do fechamento do caixa.
              </p>
              {data.withdrawals.length === 0 ? (
                <p className="text-xs text-muted-foreground pt-1">Nenhuma sangria registrada.</p>
              ) : (
                <div className="divide-y border rounded-lg mt-2">
                  {data.withdrawals.slice(0, 6).map((w) => (
                    <div key={w.id} className="p-2 text-sm flex items-center gap-3">
                      <span className="font-medium">{formatBRL(Number(w.amount))}</span>
                      <span className="flex-1 truncate text-xs text-muted-foreground">{w.reason ?? "—"}</span>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {w.created_by_name ?? "?"} · {format(new Date(w.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Mix de canais */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <span className="font-display font-bold">Mix por canal</span>
                </div>
                {data.by_channel.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem vendas no período.</p>
                ) : (
                  <div className="space-y-2">
                    {data.by_channel.map((c) => {
                      const pct = data.totals.total > 0 ? (Number(c.total) / Number(data.totals.total)) * 100 : 0;
                      return (
                        <div key={c.channel}>
                          <div className="flex justify-between text-sm">
                            <span>{channelLabels[c.channel] ?? c.channel}</span>
                            <span className="text-muted-foreground">{formatBRL(c.total)} · {pct.toFixed(1)}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ranking vendedores */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span className="font-display font-bold">Ranking de vendedores</span>
                </div>
                {data.by_seller.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem vendas no período.</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.by_seller.slice(0, 5).map((s, i) => (
                      <div key={`${s.seller_user_id}-${i}`} className="flex items-center gap-2 text-sm">
                        <span className="w-6 text-center">{["🥇","🥈","🥉"][i] ?? `${i+1}.`}</span>
                        <span className="flex-1 truncate">{s.seller_name}</span>
                        <span className="text-xs text-muted-foreground">{s.n_sales}x</span>
                        <span className="font-semibold w-24 text-right">{formatBRL(s.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Por funcionário detalhado */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <span className="font-display font-bold">Entrada por funcionário</span>
              {data.by_seller.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem vendas no período.</p>
              ) : (
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="text-xs text-muted-foreground border-b">
                      <tr>
                        <th className="text-left py-2 pr-2">Funcionário</th>
                        <th className="text-left py-2 px-2">Canal</th>
                        <th className="text-right py-2 px-2">Dinheiro</th>
                        <th className="text-right py-2 px-2">Pix</th>
                        <th className="text-right py-2 px-2">Débito</th>
                        <th className="text-right py-2 px-2">Crédito</th>
                        <th className="text-right py-2 pl-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.by_seller.map((s, i) => (
                        <tr key={`${s.seller_user_id}-${i}`}>
                          <td className="py-2 pr-2 font-medium">{s.seller_name}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">
                            {(s.channels ?? []).map((c) => channelLabels[c] ?? c).join(", ")}
                          </td>
                          <td className="py-2 px-2 text-right">{formatBRL(s.dinheiro)}</td>
                          <td className="py-2 px-2 text-right">{formatBRL(s.pix)}</td>
                          <td className="py-2 px-2 text-right">{formatBRL(s.debito)}</td>
                          <td className="py-2 px-2 text-right">{formatBRL(s.credito)}</td>
                          <td className="py-2 pl-2 text-right font-semibold">{formatBRL(s.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t text-sm">
                      <tr className="font-semibold">
                        <td className="py-2 pr-2" colSpan={2}>Soma</td>
                        <td className="py-2 px-2 text-right">{formatBRL(data.totals.dinheiro)}</td>
                        <td className="py-2 px-2 text-right">{formatBRL(data.totals.pix)}</td>
                        <td className="py-2 px-2 text-right">{formatBRL(data.totals.debito)}</td>
                        <td className="py-2 px-2 text-right">{formatBRL(data.totals.credito)}</td>
                        <td className="py-2 pl-2 text-right">{formatBRL(data.totals.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top produtos */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <span className="font-display font-bold">Produtos mais vendidos</span>
              </div>
              {data.top_products.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem vendas no período.</p>
              ) : (
                <div className="divide-y">
                  {data.top_products.map((p, i) => {
                    const pct = data.totals.total > 0 ? (Number(p.total) / Number(data.totals.total)) * 100 : 0;
                    return (
                      <div key={p.name} className="py-2 flex items-center gap-3 text-sm">
                        <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
                        <span className="flex-1 truncate font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground w-16 text-right">{Number(p.qty)}x</span>
                        <span className="text-xs text-muted-foreground w-14 text-right">{pct.toFixed(1)}%</span>
                        <span className="font-semibold w-24 text-right">{formatBRL(p.total)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function LiveLinksConversionPanel({ eventId }: { eventId: string }) {
  const { data: eventPromoters = [] } = useQuery({
    queryKey: ["event-links-live", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_promoters")
        .select(`
          id, 
          display_name, 
          category,
          promoters (name)
        `)
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["event-entries-live", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_list_entries")
        .select("event_promoter_id, checked_in")
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  const stats = eventPromoters.map(ep => {
    const list = entries.filter(e => e.event_promoter_id === ep.id);
    const present = list.filter(e => e.checked_in).length;
    return {
      name: ep.display_name || (ep.promoters as any)?.name || "Link",
      category: ep.category,
      total: list.length,
      present,
      rate: list.length > 0 ? (present / list.length) * 100 : 0
    };
  }).sort((a, b) => b.present - a.present);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4 text-primary" />
          <span className="font-display font-bold">Conversão de Links (Ranking)</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
              <Trophy className="h-3 w-3 text-amber-500" /> Top Conversão
            </div>
            <div className="space-y-1">
              {stats.slice(0, 5).map((s, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                  <span className="truncate flex-1">{i+1}. {s.name}</span>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground">{s.total}L</span>
                    <span className="font-bold text-emerald-600">{s.present}C</span>
                    <span className="text-primary font-medium w-8 text-right">{s.rate.toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
              <LinkIcon className="h-3 w-3" /> Todos os links
            </div>
            <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
              {stats.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-[11px] p-1.5 border-b last:border-0">
                  <span className="truncate flex-1">{s.name}</span>
                  <div className="flex gap-3 text-muted-foreground">
                    <span>{s.total} nomes</span>
                    <span className="text-emerald-600">{s.present} check-ins</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MethodCard({ icon, label, shortLabel, value, total }: { icon: React.ReactNode; label: string; shortLabel?: string; value: number; total: number }) {
  const pct = total > 0 ? (Number(value) / Number(total)) * 100 : 0;
  return (
    <div className="rounded-lg border p-2.5 md:p-3 space-y-1 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] md:text-xs text-muted-foreground">
        {icon}
        {shortLabel ? (
          <>
            <span className="sm:hidden truncate">{shortLabel}</span>
            <span className="hidden sm:inline truncate">{label}</span>
          </>
        ) : (
          <span className="truncate">{label}</span>
        )}
      </div>
      <div className="font-semibold text-sm md:text-base">{formatBRL(value)}</div>
      <div className="text-[10px] md:text-[11px] text-muted-foreground">{pct.toFixed(1)}% do total</div>
    </div>
  );
}
