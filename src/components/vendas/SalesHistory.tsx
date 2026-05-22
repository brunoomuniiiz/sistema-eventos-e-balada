import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Receipt, Undo2, Ban, Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cancelLocalSale } from "@/lojinha/api";
import { refundLojinhaOrder } from "@/lib/refund.functions";

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
  const qc = useQueryClient();
  const refundFn = useServerFn(refundLojinhaOrder);
  const isManager = isOwner || can("financeiro");
  const [channel, setChannel] = useState<string>("all");
  const [sellerId, setSellerId] = useState<string>("all");

  // Dialogs de estorno/cancelamento
  const [refundTarget, setRefundTarget] = useState<Row | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [busy, setBusy] = useState(false);

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

  async function handleRefund() {
    if (!refundTarget) return;
    if (!reason.trim()) { toast.error("Informe o motivo"); return; }
    setBusy(true);
    try {
      const amt = partialAmount.trim() ? Number(partialAmount.replace(",", ".")) : null;
      if (amt != null && (isNaN(amt) || amt <= 0 || amt > Number(refundTarget.total))) {
        throw new Error("Valor parcial inválido");
      }
      const r = await refundFn({ data: { orderId: refundTarget.id, amount: amt ?? undefined, reason: reason.trim() } });
      toast.success(`Estorno de ${formatBRL(r.amount)} feito no Mercado Pago`);
      setRefundTarget(null); setReason(""); setPartialAmount("");
      qc.invalidateQueries({ queryKey: ["unified-history"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no estorno");
    } finally { setBusy(false); }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    if (!reason.trim()) { toast.error("Informe o motivo"); return; }
    setBusy(true);
    try {
      const r = await cancelLocalSale(cancelTarget.id, reason.trim());
      if (r.ok) {
        toast.success("Venda cancelada");
        setCancelTarget(null); setReason("");
        qc.invalidateQueries({ queryKey: ["unified-history"] });
      } else {
        toast.error(r.reason ?? "Falha");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setBusy(false); }
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
          const isLojinha = s.channel === "online" || s.channel === "pos";
          const isPresencial = s.channel === "presencial";
          const isMpPaid = isLojinha && (s.payment_method === "pix-online" || s.payment_method === "maquininha");
          const canRefund = isOwner && isMpPaid;
          const canCancelLocal = isOwner && isPresencial;
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
              {canRefund && (
                <Button size="sm" variant="ghost" className="text-amber-600 h-7 px-2"
                  onClick={() => { setRefundTarget(s); setReason(""); setPartialAmount(""); }}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" /> Estornar
                </Button>
              )}
              {canCancelLocal && (
                <Button size="sm" variant="ghost" className="text-destructive h-7 px-2"
                  onClick={() => { setCancelTarget(s); setReason(""); }}>
                  <Ban className="h-3.5 w-3.5 mr-1" /> Cancelar
                </Button>
              )}
            </div>
          );
        })}
      </CardContent></Card>

      {/* Dialog Estorno MP */}
      <Dialog open={!!refundTarget} onOpenChange={(v) => { if (!v) { setRefundTarget(null); setReason(""); setPartialAmount(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estornar pedido via Mercado Pago</DialogTitle>
            <DialogDescription>
              {refundTarget && (
                <>Pedido #{String(refundTarget.daily_number ?? "").padStart(3, "0")} — total {formatBRL(Number(refundTarget.total))}. O valor volta pro cliente na conta do MP.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Valor (deixe vazio para estornar tudo)</label>
              <Input
                placeholder={refundTarget ? `Total: ${formatBRL(Number(refundTarget.total))}` : ""}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Motivo *</label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: produto faltou, cliente desistiu, cobrança duplicada…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundTarget(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={handleRefund} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar estorno"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Cancelar venda local */}
      <Dialog open={!!cancelTarget} onOpenChange={(v) => { if (!v) { setCancelTarget(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar venda</DialogTitle>
            <DialogDescription>
              {cancelTarget && (
                <>Venda #{String(cancelTarget.daily_number ?? "").padStart(3, "0")} — {formatBRL(Number(cancelTarget.total))} em {cancelTarget.payment_method}. Não devolve dinheiro automaticamente — é só registro. Devolva ao cliente fisicamente.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs text-muted-foreground">Motivo *</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: cliente desistiu, erro no pedido…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={busy}>Voltar</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
