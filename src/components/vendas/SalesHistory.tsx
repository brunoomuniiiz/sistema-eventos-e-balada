import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Receipt } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Row = {
  id: string;
  channel: string;
  daily_number: number | null;
  seller_user_id: string | null;
  seller_name: string | null;
  delivered_by: string | null;
  delivered_by_name: string | null;
  customer_name: string | null;
  total: number;
  payment_method: string | null;
  category: string | null;
  created_at: string;
  delivered_at: string | null;
  status: string;
};

export function SalesHistory({ ownerId }: { ownerId: string | null }) {
  const { isOwner, can } = usePermissions();
  const isManager = isOwner || can("financeiro");
  const [channel, setChannel] = useState<string>("all");
  const [sellerId, setSellerId] = useState<string>("all");

  const { data: team = [] } = useQuery({
    queryKey: ["history-team", ownerId],
    enabled: !!ownerId && isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, display_name, email")
        .eq("owner_id", ownerId!);
      if (error) throw error;
      return (data ?? []) as Array<{ user_id: string; display_name: string | null; email: string | null }>;
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["unified-history", ownerId, channel, sellerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_unified_sales_history" as never, {
        _limit: 200,
        _channel: channel === "all" ? null : channel,
        _seller_user_id: sellerId === "all" ? null : sellerId,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  if (isLoading) return <Loader />;
  if (rows.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        <Receipt className="h-10 w-10 mx-auto mb-3 opacity-50" /> Nenhuma venda ainda
      </CardContent></Card>
    );
  }

  const total = rows.reduce((s, x) => s + Number(x.total), 0);

  return (
    <div className="space-y-3">
      <Card><CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">{rows.length} registros · total {formatBRL(total)}</span>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos canais</SelectItem>
              <SelectItem value="presencial">Presencial (PDV)</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="pos">POS Garçom</SelectItem>
            </SelectContent>
          </Select>
          {isManager && (
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger className="w-[200px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos funcionários</SelectItem>
                {team.map((t) => (
                  <SelectItem key={t.user_id} value={t.user_id}>{t.display_name ?? t.email ?? "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-0 divide-y">
        {rows.map((s) => {
          const no = s.daily_number;
          const label = no != null ? "#" + String(no).padStart(3, "0") : "";
          const who = s.seller_name ?? "—";
          const delivered = s.delivered_by_name ? ` · entregue por ${s.delivered_by_name}` : "";
          return (
            <div key={`${s.channel}-${s.id}`} className="flex items-center gap-3 p-3 text-sm">
              <Badge variant="outline" className="text-[10px]">
                {s.channel === "presencial" ? "PDV" : s.channel === "online" ? "ONLINE" : "POS"}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{label} · {who}{s.customer_name ? ` → ${s.customer_name}` : ""}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(s.created_at), "dd/MM HH:mm", { locale: ptBR })} · {s.payment_method ?? "—"}{delivered}
                </div>
              </div>
              <span className="font-semibold">{formatBRL(Number(s.total))}</span>
            </div>
          );
        })}
      </CardContent></Card>
    </div>
  );
}

function Loader() {
  return (
    <div className="grid place-items-center py-12">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}
