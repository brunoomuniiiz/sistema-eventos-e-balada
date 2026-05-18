import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Users, TrendingUp, DollarSign, Plus, Sparkles, Store, Package } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL, calcEventGross } from "@/lib/format";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();

  const { data: events = [] } = useQuery({
    queryKey: ["events", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: promoters = [] } = useQuery({
    queryKey: ["promoters", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("promoters").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: financials = [] } = useQuery({
    queryKey: ["financials", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("event_financials").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: lojinhaStats } = useQuery({
    queryKey: ["lojinha-dashboard", user?.id],
    enabled: !!user,
    refetchInterval: 15000,
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [{ data: paidToday }, { data: pending }] = await Promise.all([
        supabase.from("lojinha_orders").select("id, total").gte("paid_at", today.toISOString()),
        supabase.from("lojinha_orders").select("id").eq("status", "paid"),
      ]);
      return {
        paidCount: paidToday?.length ?? 0,
        paidTotal: (paidToday ?? []).reduce((s, o) => s + Number(o.total), 0),
        pendingDelivery: pending?.length ?? 0,
      };
    },
  });

  const upcomingEvents = events.filter((e) => e.status === "upcoming");
  const finishedEvents = events.filter((e) => e.status === "finished");
  const totalRevenue = financials.reduce((sum, f) => sum + calcEventGross(f), 0);

  const stats = [
    { label: "Próximos Eventos", value: upcomingEvents.length, icon: Calendar, gradient: "from-primary to-primary-glow" },
    { label: "Promoters Ativos", value: promoters.length, icon: Users, gradient: "from-accent to-chart-5" },
    { label: "Eventos Realizados", value: finishedEvents.length, icon: TrendingUp, gradient: "from-success to-accent" },
    { label: "Faturamento Total", value: formatBRL(totalRevenue), icon: DollarSign, gradient: "from-warning to-primary" },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Olá${user?.email ? `, ${user.email.split("@")[0]}` : ""}. Visão geral do seu negócio.`}
        actions={
          <Button asChild className="bg-gradient-primary text-primary-foreground glow-primary">
            <Link to="/eventos">
              <Plus className="h-4 w-4 mr-1.5" /> Novo evento
            </Link>
          </Button>
        }
      />

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="glass border-border/60 overflow-hidden relative group">
              <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${stat.gradient} opacity-20 blur-2xl group-hover:opacity-40 transition-opacity`} />
              <CardContent className="p-4 md:p-5 relative">
                <div className="flex items-start justify-between mb-3">
                  <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${stat.gradient} grid place-items-center`}>
                    <stat.icon className="h-4 w-4 text-primary-foreground" />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-medium">{stat.label}</div>
                <div className="text-xl md:text-2xl font-bold font-display mt-0.5 truncate">{stat.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Two columns */}
      <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
        <Card className="glass border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Próximos eventos
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/eventos">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingEvents.length === 0 && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Nenhum evento próximo
              </div>
            )}
            {upcomingEvents.slice(0, 5).map((event) => (
              <Link
                key={event.id}
                to="/eventos"
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/40 transition-colors group"
              >
                {event.flyer_url ? (
                  <img src={event.flyer_url} alt={event.name} className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-gradient-primary grid place-items-center">
                    <Calendar className="h-5 w-5 text-primary-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{event.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(event.date), "dd 'de' MMMM, HH:mm", { locale: ptBR })}
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="glass border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-4 w-4 text-accent" /> Top Promoters
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/promoters">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {promoters.length === 0 && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Nenhum promoter cadastrado
              </div>
            )}
            {[...promoters]
              .sort((a, b) => Number(b.accumulated_balance) - Number(a.accumulated_balance))
              .slice(0, 5)
              .map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-secondary/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-gradient-accent grid place-items-center text-accent-foreground font-bold text-sm">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.commission_percent}% comissão</div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-success whitespace-nowrap">
                    {formatBRL(Number(p.accumulated_balance))}
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <Card className="glass border-border/60 mt-4 md:mt-6 overflow-hidden relative group">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-primary to-accent opacity-20 blur-2xl" />
        <CardHeader className="flex flex-row items-center justify-between relative">
          <CardTitle className="text-lg flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" /> Lojinha (vendas online)
          </CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/lojinha">Abrir</Link>
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 relative">
          <div>
            <div className="text-xs text-muted-foreground">Vendido hoje</div>
            <div className="text-xl font-bold font-display">{formatBRL(lojinhaStats?.paidTotal ?? 0)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Pedidos hoje</div>
            <div className="text-xl font-bold font-display">{lojinhaStats?.paidCount ?? 0}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Para retirar</div>
            <div className="text-xl font-bold font-display flex items-center gap-1">
              <Package className="h-4 w-4 text-warning" />
              {lojinhaStats?.pendingDelivery ?? 0}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
