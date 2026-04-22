import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, TrendingDown, ArrowRight, BarChart3, Wine } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL, formatPercent, calcEventGross, calcEventNet, calcBarMargin } from "@/lib/format";

export const Route = createFileRoute("/_app/financeiro")({
  component: FinanceiroPage,
});

function FinanceiroPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["financeiro-overview", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: events, error: eErr }, { data: financials, error: fErr }, { data: costs, error: cErr }] =
        await Promise.all([
          supabase.from("events").select("id, name, date").order("date", { ascending: false }),
          supabase.from("event_financials").select("*"),
          supabase.from("event_costs").select("event_id, amount"),
        ]);
      if (eErr) throw eErr;
      if (fErr) throw fErr;
      if (cErr) throw cErr;
      return { events: events ?? [], financials: financials ?? [], costs: costs ?? [] };
    },
  });

  const events = data?.events ?? [];
  const financials = data?.financials ?? [];
  const costs = data?.costs ?? [];

  const finByEvent = new Map(financials.map((f) => [f.event_id, f]));
  const costByEvent = new Map<string, number>();
  for (const c of costs) {
    costByEvent.set(c.event_id, (costByEvent.get(c.event_id) ?? 0) + Number(c.amount));
  }

  const rows = events
    .map((ev) => {
      const f = finByEvent.get(ev.id);
      const evCosts = costByEvent.get(ev.id) ?? 0;
      const gross = f ? calcEventGross(f) : 0;
      const net = f ? calcEventNet(f, evCosts) : 0;
      const bar = calcBarMargin(f ?? {});
      return { ev, f, gross, net, evCosts, bar };
    })
    .filter((r) => r.f || r.evCosts > 0);

  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalCosts = rows.reduce(
    (s, r) => s + Number(r.f?.bar_cmv ?? 0) + Number(r.f?.expenses ?? 0) + r.evCosts,
    0,
  );
  const totalNet = rows.reduce((s, r) => s + r.net, 0);

  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle="Visão geral de todos os eventos"
        actions={
          <Button asChild className="bg-gradient-primary text-primary-foreground glow-primary">
            <Link to="/mensal"><BarChart3 className="h-4 w-4 mr-1.5" /> Resumo mensal</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
        <Card className="glass border-border/60">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Faturamento total</div>
            <div className="text-lg md:text-2xl font-bold font-display text-success mt-1">{formatBRL(totalGross)}</div>
          </CardContent>
        </Card>
        <Card className="glass border-border/60">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Custos totais</div>
            <div className="text-lg md:text-2xl font-bold font-display text-destructive mt-1">{formatBRL(totalCosts)}</div>
          </CardContent>
        </Card>
        <Card className="glass border-border/60">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Lucro líquido</div>
            <div className="text-lg md:text-2xl font-bold font-display text-primary mt-1">{formatBRL(totalNet)}</div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-20">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="glass border-border/60">
          <CardContent className="py-16 text-center">
            <DollarSign className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">Nenhum lançamento financeiro ainda.</p>
            <p className="text-xs text-muted-foreground mt-2">
              Abra um evento e lance o faturamento e custos por lá.
            </p>
            <Button asChild variant="secondary" className="mt-5">
              <Link to="/eventos">Ir para eventos</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Link
              key={r.ev.id}
              to="/eventos/$eventId"
              params={{ eventId: r.ev.id }}
              className="block"
            >
              <Card className="glass border-border/60 hover:border-primary/40 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">{r.ev.name}</h3>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(r.ev.date), "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
                        <Field label="Bar" value={formatBRL(Number(r.f?.revenue_drinks ?? 0))} />
                        <Field
                          label={<span className="flex items-center gap-1"><Wine className="h-3 w-3" /> Margem bar</span>}
                          value={formatPercent(r.bar.percent)}
                          accent
                        />
                        <Field label="Portaria" value={formatBRL(Number(r.f?.revenue_door ?? 0))} />
                        <Field label="Custos" value={formatBRL(Number(r.f?.bar_cmv ?? 0) + Number(r.f?.expenses ?? 0) + r.evCosts)} negative />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">Líquido</div>
                      <div className={`text-lg font-bold flex items-center gap-1 justify-end ${r.net >= 0 ? "text-success" : "text-destructive"}`}>
                        {r.net >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        {formatBRL(r.net)}
                      </div>
                      <div className="flex items-center justify-end gap-1 text-xs text-primary mt-2">
                        Detalhes <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  negative,
  accent,
}: {
  label: React.ReactNode;
  value: string;
  negative?: boolean;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-medium ${negative ? "text-destructive" : accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
