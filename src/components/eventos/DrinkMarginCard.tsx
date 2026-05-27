import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Percent, TrendingUp, Wine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL, formatPercent } from "@/lib/format";

type Slice = {
  revenue: number;
  cmv: number;
  qty: number;
  margin_pct: number;
  avg_cost_per_drink: number;
  events_count?: number;
};

type MarginResult = {
  event: Slice;
  window: Slice;
  last30: Slice;
};

export function DrinkMarginCard({ eventId }: { eventId: string }) {
  const { ownerId, isOwner } = usePermissions();
  const [view, setView] = useState<"event" | "window" | "last30">("window");

  const { data } = useQuery({
    queryKey: ["event-drink-margin", eventId],
    enabled: !!ownerId && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_drink_margin", {
        p_event_id: eventId,
        p_window_events: 4,
      });
      if (error) throw error;
      return data as unknown as MarginResult;
    },
  });

  if (!isOwner) return null;
  const slice: Slice = data?.[view] ?? { revenue: 0, cmv: 0, qty: 0, margin_pct: 0, avg_cost_per_drink: 0 };
  const marginPositive = slice.margin_pct >= 0;

  return (
    <Card className="glass border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wine className="h-4 w-4 text-primary" /> Margem de Drinks
        </CardTitle>
        <p className="text-[12px] text-muted-foreground">
          O CMV bruto de um evento isolado pode ser injusto (abre uma garrafa no fim e mal usa).
          A <b>janela móvel</b> é a referência real da margem dos seus drinks.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="event">Este evento</TabsTrigger>
            <TabsTrigger value="window">
              Últimos {data?.window?.events_count ?? 4} eventos
            </TabsTrigger>
            <TabsTrigger value="last30">30 dias</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Faturamento drinks" value={formatBRL(slice.revenue)} />
          <Stat label="CMV drinks" value={formatBRL(slice.cmv)} className="text-destructive" />
          <Stat
            label="Margem"
            value={formatPercent(slice.margin_pct)}
            icon={<Percent className="h-3 w-3" />}
            className={marginPositive ? "text-success" : "text-destructive"}
          />
          <Stat
            label="Custo médio / drink"
            value={formatBRL(slice.avg_cost_per_drink)}
            icon={<TrendingUp className="h-3 w-3" />}
          />
        </div>
        <div className="text-[11px] text-muted-foreground text-right">
          {slice.qty} drinks vendidos no período
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label, value, icon, className,
}: { label: string; value: string; icon?: React.ReactNode; className?: string }) {
  return (
    <div className="rounded-lg border bg-card/40 p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`text-base font-bold mt-1 ${className ?? ""}`}>{value}</div>
    </div>
  );
}
