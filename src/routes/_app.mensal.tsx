import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar, TrendingUp, TrendingDown, DollarSign, Wine, Percent } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, formatPercent, calcEventGross, calcEventNet, calcBarMargin, calcHookahShare } from "@/lib/format";

export const Route = createFileRoute("/_app/mensal")({
  component: MensalView,
});

export function MensalView() {
  const { user } = useAuth();
  const [refDate, setRefDate] = useState(new Date());

  const monthStart = startOfMonth(refDate);
  const monthEnd = endOfMonth(refDate);

  const { data, isLoading } = useQuery({
    queryKey: ["monthly-summary", user?.id, format(refDate, "yyyy-MM")],
    enabled: !!user,
    queryFn: async () => {
      const startISO = monthStart.toISOString();
      const endISO = monthEnd.toISOString();

      const { data: events, error: evErr } = await supabase
        .from("events")
        .select("id, name, date, status")
        .gte("date", startISO)
        .lte("date", endISO)
        .order("date", { ascending: true });
      if (evErr) throw evErr;

      const ids = (events ?? []).map((e) => e.id);
      if (ids.length === 0) return { events: [], financials: [], costs: [] };

      const [{ data: financials, error: fErr }, { data: costs, error: cErr }] = await Promise.all([
        supabase.from("event_financials").select("*").in("event_id", ids),
        supabase.from("event_costs").select("*").in("event_id", ids),
      ]);
      if (fErr) throw fErr;
      if (cErr) throw cErr;

      return {
        events: events ?? [],
        financials: financials ?? [],
        costs: costs ?? [],
      };
    },
  });

  const summary = useMemo(() => {
    if (!data) return null;
    const finByEvent = new Map(data.financials.map((f) => [f.event_id, f]));
    const costsByEvent = new Map<string, typeof data.costs>();
    for (const c of data.costs) {
      const arr = costsByEvent.get(c.event_id) ?? [];
      arr.push(c);
      costsByEvent.set(c.event_id, arr);
    }

    const costsByCategory = new Map<string, number>();
    for (const c of data.costs) {
      costsByCategory.set(c.category_name, (costsByCategory.get(c.category_name) ?? 0) + Number(c.amount));
    }

    let totalGross = 0;
    let totalBar = 0;
    let totalHookah = 0;
    let totalDoor = 0;
    let totalCMV = 0;
    let totalLegacyExp = 0;
    let totalDetailedCosts = 0;
    let totalNet = 0;
    const marginsBar: number[] = [];
    const marginsEvent: number[] = [];

    const rows = data.events.map((ev) => {
      const f = finByEvent.get(ev.id);
      const evCosts = costsByEvent.get(ev.id) ?? [];
      const detailedCosts = evCosts.reduce((s, c) => s + Number(c.amount), 0);
      const gross = f ? calcEventGross(f) : 0;
      const net = f ? calcEventNet(f, detailedCosts) : -detailedCosts;
      const bar = calcBarMargin(f ?? {});
      const hookahShare = f ? calcHookahShare(f) : 0;

      totalGross += gross;
      totalBar += Number(f?.revenue_drinks ?? 0);
      totalHookah += hookahShare;
      totalDoor += Number(f?.revenue_door ?? 0);
      totalCMV += Number(f?.bar_cmv ?? 0);
      totalLegacyExp += Number(f?.expenses ?? 0);
      totalDetailedCosts += detailedCosts;
      totalNet += net;
      if (Number(f?.revenue_drinks ?? 0) > 0) marginsBar.push(bar.percent);
      if (gross > 0) marginsEvent.push((net / gross) * 100);

      return {
        event: ev,
        financial: f,
        gross,
        net,
        detailedCosts,
        barMargin: bar,
      };
    });

    const totalCosts = totalCMV + totalLegacyExp + totalDetailedCosts;
    const avgBarMargin = marginsBar.length ? marginsBar.reduce((a, b) => a + b, 0) / marginsBar.length : 0;
    const avgEventMargin = marginsEvent.length ? marginsEvent.reduce((a, b) => a + b, 0) / marginsEvent.length : 0;

    return {
      rows,
      totals: {
        gross: totalGross,
        bar: totalBar,
        hookah: totalHookah,
        door: totalDoor,
        cmv: totalCMV,
        legacyExp: totalLegacyExp,
        detailedCosts: totalDetailedCosts,
        costs: totalCosts,
        net: totalNet,
        avgBarMargin,
        avgEventMargin,
      },
      costsByCategory: Array.from(costsByCategory.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    };
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Resumo Mensal"
        subtitle="Faturamento, custos e margem consolidados"
      />

      {/* Seletor de mês */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setRefDate((d) => subMonths(d, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg glass border border-border/60 min-w-[200px] justify-center">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="font-display font-semibold capitalize">
            {format(refDate, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setRefDate((d) => addMonths(d, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-20">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : !summary || summary.rows.length === 0 ? (
        <Card className="glass border-border/60">
          <CardContent className="py-16 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">Nenhum evento neste mês.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Big totals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BigStat
              label="Faturamento"
              value={formatBRL(summary.totals.gross)}
              icon={<TrendingUp className="h-4 w-4" />}
              tone="primary"
            />
            <BigStat
              label="Custos totais"
              value={formatBRL(summary.totals.costs)}
              icon={<TrendingDown className="h-4 w-4" />}
              tone="destructive"
            />
            <BigStat
              label="Lucro líquido"
              value={formatBRL(summary.totals.net)}
              icon={<DollarSign className="h-4 w-4" />}
              tone={summary.totals.net >= 0 ? "success" : "destructive"}
            />
            <BigStat
              label="Margem média / evento"
              value={formatPercent(summary.totals.avgEventMargin)}
              icon={<Percent className="h-4 w-4" />}
              tone="primary"
            />
          </div>

          {/* Breakdown receita */}
          <Card className="glass border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Composição do faturamento</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Bar" value={formatBRL(summary.totals.bar)} />
              <Field label="Narguilé (sua parte)" value={formatBRL(summary.totals.hookah)} />
              <Field label="Portaria" value={formatBRL(summary.totals.door)} />
              <Field
                label={<span className="flex items-center gap-1"><Wine className="h-3 w-3" /> Margem bar</span>}
                value={formatPercent(summary.totals.avgBarMargin)}
                accent
              />
            </CardContent>
          </Card>

          {/* Breakdown custos */}
          <Card className="glass border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Custos por categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.totals.cmv > 0 && (
                <div className="flex items-center justify-between py-2 border-b border-border/60">
                  <span className="text-sm flex items-center gap-2">
                    <Wine className="h-3.5 w-3.5 text-primary" /> CMV bar (bebidas vendidas)
                  </span>
                  <span className="font-semibold text-destructive">{formatBRL(summary.totals.cmv)}</span>
                </div>
              )}
              {summary.costsByCategory.map((c) => (
                <div key={c.name} className="flex items-center justify-between py-2 border-b border-border/60 last:border-0">
                  <span className="text-sm">{c.name}</span>
                  <span className="font-semibold text-destructive">{formatBRL(c.value)}</span>
                </div>
              ))}
              {summary.totals.legacyExp > 0 && (
                <div className="flex items-center justify-between py-2 border-t border-border/60 mt-1">
                  <span className="text-sm text-muted-foreground">Outras despesas (campo único)</span>
                  <span className="font-semibold text-destructive">{formatBRL(summary.totals.legacyExp)}</span>
                </div>
              )}
              {summary.costsByCategory.length === 0 && summary.totals.cmv === 0 && summary.totals.legacyExp === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum custo lançado neste mês.</p>
              )}
            </CardContent>
          </Card>

          {/* Lista de eventos do mês */}
          <Card className="glass border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Eventos do mês</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {summary.rows.map((r) => (
                <Link
                  key={r.event.id}
                  to="/eventos/$eventId"
                  params={{ eventId: r.event.id }}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-secondary/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.event.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(r.event.date), "dd/MM", { locale: ptBR })}
                      {" · Bruto "}
                      {formatBRL(r.gross)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-bold ${r.net >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatBRL(r.net)}
                    </div>
                    {r.financial && Number(r.financial.revenue_drinks) > 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        Margem bar {formatPercent(r.barMargin.percent)}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function BigStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "primary" | "success" | "destructive";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-primary";
  return (
    <Card className="glass border-border/60">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
          <span className={toneClass}>{icon}</span>
        </div>
        <div className={`text-lg md:text-xl font-bold font-display mt-1 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, accent }: { label: React.ReactNode; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-semibold mt-0.5 ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
