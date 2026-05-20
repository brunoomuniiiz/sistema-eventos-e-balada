import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL } from "@/lib/format";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: "Aguardando pagamento", color: "bg-warning text-warning-foreground" },
  paid: { label: "Pago — pronto p/ retirada", color: "bg-success text-success-foreground" },
  delivered: { label: "Entregue", color: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelado", color: "bg-destructive text-destructive-foreground" },
};

export function LojinhaOrdersPanel() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<string>("paid");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["lojinha-orders", user?.id, filter],
    enabled: !!user,
    refetchInterval: 8000,
    queryFn: async () => {
      let q = supabase.from("lojinha_orders").select("*").order("created_at", { ascending: false }).limit(50);
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-3">
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="paid">Para entregar</TabsTrigger>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="delivered">Entregues</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && (
        <div className="grid place-items-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}

      {!isLoading && orders.length === 0 && (
        <div className="text-center text-muted-foreground py-12">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Nenhum pedido nesse filtro.
        </div>
      )}

      <div className="grid gap-2">
        {orders.map((o) => {
          const s = STATUS_LABEL[o.status] ?? { label: o.status, color: "bg-secondary" };
          return (
            <Card key={o.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {o.daily_number != null && (
                      <span className="text-primary font-bold mr-2">#{String(o.daily_number).padStart(3, "0")}</span>
                    )}
                    {o.customer_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(o.created_at), "dd/MM HH:mm", { locale: ptBR })} · {o.customer_phone || "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{formatBRL(Number(o.total))}</div>
                  <Badge className={`mt-1 text-[10px] ${s.color}`}>{s.label}</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
