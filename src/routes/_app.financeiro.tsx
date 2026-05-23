import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign, TrendingUp, TrendingDown, ArrowRight,
  Wine, DoorOpen, ShoppingBag, Sparkles, Receipt, Repeat,
} from "lucide-react";
import { ExpensesTab } from "@/components/financeiro/ExpensesTab";
import { InvestmentTab } from "@/components/financeiro/InvestmentTab";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatBRL, formatPercent, calcHookahShare } from "@/lib/format";

import { MensalView } from "./_app.mensal";

export const Route = createFileRoute("/_app/financeiro")({
  component: FinanceiroPage,
});

type EventRow = { id: string; name: string; date: string };
type SaleRow = { id: string; event_id: string | null; total: number; category: string };
type SaleItemRow = { sale_id: string; quantity: number; cost_price_snapshot: number };
type EntryRow = { event_id: string; amount_paid: number };
type CostRow = { event_id: string; amount: number };
type FinancialRow = {
  event_id: string;
  revenue_drinks: number; revenue_door: number;
  revenue_hookah_total: number; hookah_share_percent: number;
  expenses: number; bar_cmv: number;
};

function FinanceiroPage() {
  const { ownerId, can, loading } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["financeiro-real", ownerId],
    enabled: !!ownerId && can("financeiro"),
    queryFn: async () => {
      const [evRes, salesRes, entriesRes, costsRes, finRes] = await Promise.all([
        supabase.from("events").select("id, name, date").order("date", { ascending: false }),
        supabase.from("sales").select("id, event_id, total, category"),
        supabase.from("event_entries").select("event_id, amount_paid"),
        supabase.from("event_costs").select("event_id, amount"),
        supabase.from("event_financials").select("event_id, revenue_drinks, revenue_door, revenue_hookah_total, hookah_share_percent, expenses, bar_cmv"),
      ]);
      if (evRes.error) throw evRes.error;
      if (salesRes.error) throw salesRes.error;
      if (entriesRes.error) throw entriesRes.error;
      if (costsRes.error) throw costsRes.error;
      if (finRes.error) throw finRes.error;

      const sales = (salesRes.data ?? []) as SaleRow[];
      let items: SaleItemRow[] = [];
      if (sales.length > 0) {
        const { data: it, error: itErr } = await supabase
          .from("sale_items")
          .select("sale_id, quantity, cost_price_snapshot")
          .in("sale_id", sales.map((s) => s.id));
        if (itErr) throw itErr;
        items = (it ?? []) as SaleItemRow[];
      }

      return {
        events: (evRes.data ?? []) as EventRow[],
        sales,
        items,
        entries: (entriesRes.data ?? []) as EntryRow[],
        costs: (costsRes.data ?? []) as CostRow[],
        financials: (finRes.data ?? []) as FinancialRow[],
      };
    },
  });

  // Custos do mês corrente (fixos + variáveis + juros) para o resumo do topo
  const { data: monthExpenses } = useQuery({
    queryKey: ["bar-expenses-month-summary", ownerId],
    enabled: !!ownerId && can("financeiro"),
    queryFn: async () => {
      const d = new Date();
      const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
      const [byCompetence, interestRes, investRes] = await Promise.all([
        supabase
          .from("bar_expenses")
          .select("kind, amount, reference_month, expense_date, is_investment")
          .or(`and(reference_month.gte.${start},reference_month.lte.${end}),and(reference_month.is.null,expense_date.gte.${start},expense_date.lte.${end})`),
        supabase
          .from("bar_expenses")
          .select("interest_amount")
          .eq("paid", true)
          .gt("interest_amount", 0)
          .gte("paid_at", `${start}T00:00:00`)
          .lte("paid_at", `${end}T23:59:59`),
        supabase
          .from("bar_expenses")
          .select("paid_amount, amount")
          .eq("is_investment", true)
          .eq("paid", true)
          .gte("paid_at", `${start}T00:00:00`)
          .lte("paid_at", `${end}T23:59:59`),
      ]);
      if (byCompetence.error) throw byCompetence.error;
      if (interestRes.error) throw interestRes.error;
      if (investRes.error) throw investRes.error;
      let fixed = 0, variable = 0;
      for (const r of byCompetence.data ?? []) {
        if (r.is_investment) continue; // investimentos não entram no custo do mês
        if (r.kind === "fixed") fixed += Number(r.amount);
        else variable += Number(r.amount);
      }
      const interest = (interestRes.data ?? []).reduce((s, r) => s + Number(r.interest_amount ?? 0), 0);
      const investments = (investRes.data ?? []).reduce(
        (s, r) => s + Number(r.paid_amount ?? r.amount ?? 0), 0,
      );
      return { fixed, variable, interest, investments };
    },
  });

  const computed = useMemo(() => {
    if (!data) return null;
    const { events, sales, items, entries, costs, financials } = data;

    const cmvBySale = new Map<string, number>();
    for (const it of items) {
      cmvBySale.set(it.sale_id, (cmvBySale.get(it.sale_id) ?? 0) + Number(it.cost_price_snapshot) * Number(it.quantity));
    }

    const finByEvent = new Map(financials.map((f) => [f.event_id, f]));
    const costByEvent = new Map<string, number>();
    for (const c of costs) costByEvent.set(c.event_id, (costByEvent.get(c.event_id) ?? 0) + Number(c.amount));

    const doorByEvent = new Map<string, number>();
    for (const e of entries) doorByEvent.set(e.event_id, (doorByEvent.get(e.event_id) ?? 0) + Number(e.amount_paid));

    const barRevByEvent = new Map<string, number>();
    const barCmvByEvent = new Map<string, number>();
    let barRevNoEvent = 0;
    let barCmvNoEvent = 0;
    for (const s of sales) {
      const cmv = cmvBySale.get(s.id) ?? 0;
      if (s.event_id) {
        barRevByEvent.set(s.event_id, (barRevByEvent.get(s.event_id) ?? 0) + Number(s.total));
        barCmvByEvent.set(s.event_id, (barCmvByEvent.get(s.event_id) ?? 0) + cmv);
      } else {
        barRevNoEvent += Number(s.total);
        barCmvNoEvent += cmv;
      }
    }

    const rows = events.map((ev) => {
      const f = finByEvent.get(ev.id);
      const realBarRev = barRevByEvent.get(ev.id) ?? 0;
      const realBarCmv = barCmvByEvent.get(ev.id) ?? 0;
      const realDoor = doorByEvent.get(ev.id) ?? 0;

      const barRev = realBarRev > 0 ? realBarRev : Number(f?.revenue_drinks ?? 0);
      const barCmv = realBarCmv > 0 ? realBarCmv : Number(f?.bar_cmv ?? 0);
      const door = realDoor > 0 ? realDoor : Number(f?.revenue_door ?? 0);
      const hookah = f ? calcHookahShare(f) : 0;
      const expenses = Number(f?.expenses ?? 0);
      const evCosts = costByEvent.get(ev.id) ?? 0;

      const gross = barRev + door + hookah;
      const totalCosts = barCmv + expenses + evCosts;
      const net = gross - totalCosts;
      const margin = barRev > 0 ? ((barRev - barCmv) / barRev) * 100 : 0;

      return {
        ev, barRev, barCmv, door, hookah, expenses, evCosts,
        gross, totalCosts, net, margin,
        hasData: gross > 0 || totalCosts > 0,
      };
    }).filter((r) => r.hasData);

    return {
      rows,
      barNoEvent: { revenue: barRevNoEvent, cmv: barCmvNoEvent, profit: barRevNoEvent - barCmvNoEvent },
      totals: {
        gross: rows.reduce((s, r) => s + r.gross, 0),
        costs: rows.reduce((s, r) => s + r.totalCosts, 0),
        net: rows.reduce((s, r) => s + r.net, 0),
        bar: rows.reduce((s, r) => s + r.barRev, 0),
        door: rows.reduce((s, r) => s + r.door, 0),
      },
    };
  }, [data]);

  if (loading) return null;
  if (!can("financeiro")) {
    return <PageHeader title="Financeiro" subtitle="Você não tem permissão para acessar esta página" />;
  }

  const totals = computed?.totals ?? { gross: 0, costs: 0, net: 0, bar: 0, door: 0 };
  const rows = computed?.rows ?? [];
  const barNoEvent = computed?.barNoEvent ?? { revenue: 0, cmv: 0, profit: 0 };

  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle="Receita real do PDV + portaria, consolidada por evento"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Faturamento" value={formatBRL(totals.gross)} accent="success" />
        <Stat label="Custos totais" value={formatBRL(totals.costs)} accent="destructive" />
        <Stat label="Lucro líquido" value={formatBRL(totals.net)} accent="primary" big />
        <Stat label="Bar fora de evento" value={formatBRL(barNoEvent.revenue)} sub={`Lucro ${formatBRL(barNoEvent.profit)}`} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <MiniStat icon={Wine} label="Bar (eventos)" value={formatBRL(totals.bar)} />
        <MiniStat icon={DoorOpen} label="Portaria" value={formatBRL(totals.door)} />
        <MiniStat icon={ShoppingBag} label="Eventos com lançamento" value={String(rows.length)} />
        <MiniStat icon={Repeat} label="Custos fixos (mês)" value={formatBRL(monthExpenses?.fixed ?? 0)} />
        <MiniStat icon={Receipt} label="Custos variáveis (mês)" value={formatBRL(monthExpenses?.variable ?? 0)} />
        <MiniStat icon={TrendingDown} label="Juros pagos (mês)" value={formatBRL(monthExpenses?.interest ?? 0)} />
        <MiniStat icon={Sparkles} label="Investimentos pagos (mês)" value={formatBRL(monthExpenses?.investments ?? 0)} />
        <MiniStat
          icon={TrendingUp}
          label="Líquido real (mês)"
          value={formatBRL(
            totals.net
              - (monthExpenses?.fixed ?? 0)
              - (monthExpenses?.variable ?? 0)
              - (monthExpenses?.interest ?? 0),
          )}
        />
      </div>

      <Tabs defaultValue="eventos">
        <TabsList className="flex-wrap">
          <TabsTrigger value="eventos">Por evento</TabsTrigger>
          <TabsTrigger value="bar">Bar avulso</TabsTrigger>
          <TabsTrigger value="fixos">Custos fixos</TabsTrigger>
          <TabsTrigger value="variaveis">Custos variáveis</TabsTrigger>
          <TabsTrigger value="investimento">Investimento</TabsTrigger>
          <TabsTrigger value="mensal">Mensal</TabsTrigger>
        </TabsList>

        <TabsContent value="eventos" className="mt-4">
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
                  Vendas no PDV vinculadas a um evento e entradas pagantes na portaria aparecem aqui automaticamente.
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
                            <Field label={<span className="flex items-center gap-1"><Wine className="h-3 w-3" /> Bar</span>} value={formatBRL(r.barRev)} />
                            <Field label="Margem bar" value={formatPercent(r.margin)} accent />
                            <Field label={<span className="flex items-center gap-1"><DoorOpen className="h-3 w-3" /> Portaria</span>} value={formatBRL(r.door)} />
                            <Field label="Custos" value={formatBRL(r.totalCosts)} negative />
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
        </TabsContent>

        <TabsContent value="bar" className="mt-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4" /> Vendas do PDV sem evento vinculado
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Receita" value={formatBRL(barNoEvent.revenue)} />
                <Field label="CMV" value={formatBRL(barNoEvent.cmv)} negative />
                <Field label="Lucro bar" value={formatBRL(barNoEvent.profit)} accent />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fixos" className="mt-4">
          <ExpensesTab kind="fixed" />
        </TabsContent>

        <TabsContent value="variaveis" className="mt-4">
          <ExpensesTab kind="variable" />
        </TabsContent>

        <TabsContent value="investimento" className="mt-4">
          <InvestmentTab />
        </TabsContent>

        <TabsContent value="mensal" className="mt-4">
          <MensalView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, accent, sub, big }: { label: string; value: string; accent?: "success" | "destructive" | "primary"; sub?: string; big?: boolean }) {
  const color = accent === "success" ? "text-success" : accent === "destructive" ? "text-destructive" : accent === "primary" ? "text-primary" : "";
  return (
    <Card className="glass border-border/60">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`${big ? "text-xl md:text-3xl" : "text-lg md:text-2xl"} font-bold font-display mt-1 ${color}`}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof DollarSign; label: string; value: string }) {
  return (
    <Card><CardContent className="p-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase text-muted-foreground truncate">{label}</div>
        <div className="font-semibold">{value}</div>
      </div>
    </CardContent></Card>
  );
}

function Field({
  label, value, negative, accent,
}: { label: React.ReactNode; value: string; negative?: boolean; accent?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-medium ${negative ? "text-destructive" : accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
