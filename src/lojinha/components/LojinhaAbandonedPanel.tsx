import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, AlertTriangle, CheckCircle2, Copy, Search, Wallet } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL } from "@/lib/format";
import { inspectMpForOrder, reconcileOrderFromMp } from "@/lib/pix.functions";
import { toast } from "sonner";

type AbandonedOrder = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  total: number;
  status: string;
  created_at: string;
  cancelled_at: string | null;
  mp_payment_id: string | null;
  mp_preference_id: string | null;
  reconciled_at: string | null;
  reconciled_note: string | null;
  channel: string;
};

export function LojinhaAbandonedPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showReconciled, setShowReconciled] = useState(false);
  const [editing, setEditing] = useState<AbandonedOrder | null>(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const inspect = useServerFn(inspectMpForOrder);
  const reconcileFromMp = useServerFn(reconcileOrderFromMp);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["lojinha-abandoned", user?.id, showReconciled],
    enabled: !!user,
    refetchInterval: 15000,
    queryFn: async () => {
      let q = supabase
        .from("lojinha_orders")
        .select("id, customer_name, customer_phone, total, status, created_at, cancelled_at, mp_payment_id, mp_preference_id, reconciled_at, reconciled_note, channel")
        .eq("status", "abandoned")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!showReconciled) q = q.is("reconciled_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AbandonedOrder[];
    },
  });

  async function reconcile() {
    if (!editing || !user) return;
    const { error } = await supabase
      .from("lojinha_orders")
      .update({
        reconciled_at: new Date().toISOString(),
        reconciled_by: user.id,
        reconciled_note: note || null,
      })
      .eq("id", editing.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pedido marcado como conciliado");
    setEditing(null);
    setNote("");
    qc.invalidateQueries({ queryKey: ["lojinha-abandoned"] });
  }

  function copy(s: string) {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  }

  async function checkMp(orderId: string) {
    setBusyId(orderId);
    try {
      const r = await inspect({ data: { orderId } });
      if (!r.found) {
        toast.error(r.reason || "Não foi possível consultar o MP");
        return;
      }
      if (r.mapped === "approved") {
        toast.success(`Mercado Pago: APROVADO (${formatBRL(r.amount)}). Use "Conciliar como pago".`);
      } else if (r.mapped === "rejected") {
        toast.warning(`Mercado Pago: ${r.mp_status}. Pagamento não entrou.`);
      } else {
        toast.info(`Mercado Pago: ${r.mp_status}. Ainda pendente.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao consultar MP");
    } finally {
      setBusyId(null);
    }
  }

  async function reconcileFromMercadoPago(orderId: string) {
    setBusyId(orderId);
    try {
      const r = await reconcileFromMp({ data: { orderId } });
      if (r.mp_status === "approved" || r.mp_status === "authorized") {
        toast.success("Pedido conciliado como pago via Mercado Pago");
      } else {
        toast.info(`MP status: ${r.mp_status}. Nada a aplicar.`);
      }
      qc.invalidateQueries({ queryKey: ["lojinha-abandoned"] });
      qc.invalidateQueries({ queryKey: ["lojinha-orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao conciliar pelo MP");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-3 text-sm flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
          <div>
            Pedidos que <strong>não foram pagos em 5 min</strong> aparecem aqui.
            O estoque foi liberado. Use os IDs do Mercado Pago para conferir se nenhum PIX vazou.
            Pedidos não conciliados são apagados após 7 dias.
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {isLoading ? "..." : `${orders.length} pedido${orders.length !== 1 ? "s" : ""}`}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowReconciled((v) => !v)}>
          {showReconciled ? "Ocultar conciliados" : "Mostrar conciliados"}
        </Button>
      </div>

      {isLoading && (
        <div className="grid place-items-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}

      {!isLoading && orders.length === 0 && (
        <div className="text-center text-muted-foreground py-12 text-sm">
          Nenhum pedido abandonado por enquanto.
        </div>
      )}

      <div className="grid gap-2">
        {orders.map((o) => (
          <Card key={o.id}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{o.customer_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(o.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    {o.customer_phone ? ` · ${o.customer_phone}` : ""}
                    {" · "}{o.channel === "pos" ? "Balcão" : "Online"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold">{formatBRL(Number(o.total))}</div>
                  {o.reconciled_at ? (
                    <Badge className="mt-1 text-[10px] bg-success text-success-foreground">Conciliado</Badge>
                  ) : (
                    <Badge className="mt-1 text-[10px] bg-amber-500 text-white">Abandonado</Badge>
                  )}
                </div>
              </div>

              {(o.mp_payment_id || o.mp_preference_id) && (
                <div className="text-xs space-y-1 bg-muted/40 rounded p-2">
                  {o.mp_payment_id && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">MP payment_id</span>
                      <button onClick={() => copy(o.mp_payment_id!)} className="font-mono truncate hover:underline flex items-center gap-1">
                        {o.mp_payment_id}<Copy className="h-3 w-3 shrink-0" />
                      </button>
                    </div>
                  )}
                  {o.mp_preference_id && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">MP preference_id</span>
                      <button onClick={() => copy(o.mp_preference_id!)} className="font-mono truncate hover:underline flex items-center gap-1">
                        {o.mp_preference_id}<Copy className="h-3 w-3 shrink-0" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {o.reconciled_note && (
                <div className="text-xs italic text-muted-foreground">"{o.reconciled_note}"</div>
              )}

              {!o.reconciled_at && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => { setEditing(o); setNote(""); }}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Marcar como conciliado
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) { setEditing(null); setNote(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Conciliar pedido</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Confirme que esse PIX não entrou na sua conta (ou já foi tratado).
              Deixe uma nota se quiser (ex.: "verificado no extrato — sem cobrança").
            </p>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota opcional" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={reconcile}>Conciliar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
