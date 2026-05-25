import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Receipt, ShieldCheck } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuthorizationDialog } from "@/components/AuthorizationDialog";
import { UnifiedSaleDetailSheet, type UnifiedSale } from "@/components/vendas/UnifiedSaleDetailSheet";
import { useOperationPin } from "@/hooks/useOperationPin";

type Row = UnifiedSale & {
  seller_user_id: string | null;
  delivered_by: string | null;
  delivered_by_name: string | null;
  delivered_at: string | null;
};

export function SalesHistory({ ownerId }: { ownerId: string | null }) {
  const { isOwner, can } = usePermissions();
  const { token: pinToken, setUnlocked } = useOperationPin();
  const isManager = isOwner || can("financeiro");
  const [channel, setChannel] = useState<string>("all");
  const [sellerId, setSellerId] = useState<string>("all");
  const [selected, setSelected] = useState<UnifiedSale | null>(null);
  const [pinDialog, setPinDialog] = useState(false);

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
    enabled: !!ownerId && !!pinToken,
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

  // PIN gate: tela inicial
  if (!pinToken) {
    return (
      <>
        <Card><CardContent className="p-6 text-center space-y-3">
          <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Histórico e estornos protegidos. Desbloqueie com o PIN do dono.
          </p>
          <Button onClick={() => setPinDialog(true)}>
            <ShieldCheck className="h-4 w-4" /> Desbloquear com PIN
          </Button>
        </CardContent></Card>
        <AuthorizationDialog
          open={pinDialog}
          onOpenChange={setPinDialog}
          scope="operation"
          title="Desbloquear histórico"
          description="Digite o PIN do dono para ver vendas, estornar ou cancelar."
          onApproved={(token, name) => { setUnlocked(token, name); setPinDialog(false); }}
        />
      </>
    );
  }

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
      <Card><CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">{rows.length} · total {formatBRL(total)}</span>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos canais</SelectItem>
              <SelectItem value="presencial">Presencial (PDV)</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="pos">POS Garçom</SelectItem>
            </SelectContent>
          </Select>
          {isManager && (
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger className="w-[180px] h-8"><SelectValue /></SelectTrigger>
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

      <div className="space-y-1.5">
        {rows.map((s) => {
          const cancelled = s.status === "cancelled" || s.status === "refunded";
          const no = s.daily_number;
          const label = no != null ? "#" + String(no).padStart(3, "0") : "";
          return (
            <button
              key={`${s.channel}-${s.id}`}
              onClick={() => setSelected(s)}
              className={`w-full text-left rounded-lg border p-3 transition hover:border-primary/60 ${cancelled ? "border-destructive/40 bg-destructive/5 opacity-70" : "border-border bg-card"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 text-sm">
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {s.channel === "presencial" ? "PDV" : s.channel === "online" ? "ONLINE" : "POS"}
                  </Badge>
                  <span className="font-medium truncate">{label} {s.seller_name ?? "—"}</span>
                  {cancelled && <Badge variant="destructive" className="text-[10px] shrink-0">Estornada</Badge>}
                </div>
                <span className="font-bold text-sm shrink-0">{formatBRL(Number(s.total))}</span>
              </div>
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                {format(new Date(s.created_at), "dd/MM HH:mm", { locale: ptBR })} · {s.payment_method ?? "—"}
                {s.customer_name ? ` → ${s.customer_name}` : ""}
              </div>
            </button>
          );
        })}
      </div>

      <UnifiedSaleDetailSheet
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
        sale={selected}
        onRequestUnlock={() => setPinDialog(true)}
        onDone={() => { setSelected(null); }}
      />

      <AuthorizationDialog
        open={pinDialog}
        onOpenChange={setPinDialog}
        scope="refund"
        title="Desbloquear com PIN"
        description="Digite o PIN do dono para autorizar estornos."
        onApproved={(token, name) => { setUnlocked(token, name); setPinDialog(false); }}
      />
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
