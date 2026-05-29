import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Undo2, AlertTriangle, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { refundLojinhaOrder } from "@/lib/refund.functions";
import { useOperationPin } from "@/hooks/useOperationPin";
import { printReceipt, printPrepSlips, qrSvgString } from "@/lib/order-print";
import { usePermissions } from "@/hooks/usePermissions";

export type UnifiedSale = {
  id: string;
  channel: "presencial" | "online" | "pos";
  daily_number: number | null;
  total: number;
  payment_method: string | null;
  category: string | null;
  status: string;
  created_at: string;
  seller_name: string | null;
  customer_name: string | null;
};

function methodLabel(m: string | null) {
  if (!m) return "—";
  return { dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito", pix: "Pix",
           "pix-online": "Pix online", maquininha: "Maquininha" }[m] ?? m;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sale: UnifiedSale | null;
  onRequestUnlock: () => void;
  onDone: () => void;
}

export function UnifiedSaleDetailSheet({ open, onOpenChange, sale, onRequestUnlock, onDone }: Props) {
  const qc = useQueryClient();
  const { token: pinToken } = useOperationPin();
  const refundOnlineFn = useServerFn(refundLojinhaOrder);

  const [mode, setMode] = useState<"none" | "total" | "partial">("none");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const isOnline = sale?.channel === "online" || sale?.channel === "pos";

  // Items + payments (lazy)
  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ["sale-detail", sale?.channel, sale?.id],
    enabled: open && !!sale,
    queryFn: async () => {
      if (!sale) return null;
      if (isOnline) {
        const [items, order] = await Promise.all([
          supabase.from("lojinha_order_items")
            .select("id, product_name_snapshot, unit_price, quantity")
            .eq("order_id", sale.id),
          supabase.from("lojinha_orders")
            .select("refund_amount, refunded_reason")
            .eq("id", sale.id).maybeSingle(),
        ]);
        return {
          items: (items.data ?? []).map((i) => ({
            name: i.product_name_snapshot,
            qty: i.quantity,
            unit: Number(i.unit_price),
            subtotal: Number(i.unit_price) * i.quantity,
          })),
          payments: sale.payment_method
            ? [{ method: sale.payment_method, amount: Number(sale.total) }]
            : [],
          refund_amount: order.data?.refund_amount ? Number(order.data.refund_amount) : 0,
          refund_reason: order.data?.refunded_reason ?? null,
        };
      } else {
        const [items, pays] = await Promise.all([
          supabase.from("sale_items")
            .select("id, product_name, unit_price, quantity, subtotal")
            .eq("sale_id", sale.id),
          supabase.from("sale_payments")
            .select("method, amount")
            .eq("sale_id", sale.id),
        ]);
        return {
          items: (items.data ?? []).map((i) => ({
            name: i.product_name,
            qty: i.quantity,
            unit: Number(i.unit_price),
            subtotal: Number(i.subtotal),
          })),
          payments: (pays.data ?? []).map((p) => ({ method: p.method as string, amount: Number(p.amount) })),
          refund_amount: 0,
          refund_reason: null as string | null,
        };
      }
    },
  });

  if (!sale) return null;
  const cancelled = sale.status === "cancelled" || sale.status === "refunded";
  const canRefund = !cancelled && Number(sale.total) > 0;

  const doRefund = async () => {
    if (!pinToken) { onRequestUnlock(); return; }
    let amt: number | null = null;
    if (mode === "partial") {
      const v = Number((amount || "0").replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) return toast.error("Valor inválido");
      if (v > Number(sale.total)) return toast.error("Valor maior que a venda");
      amt = v;
    }
    setLoading(true);
    try {
      if (isOnline) {
        const r = await refundOnlineFn({
          data: { orderId: sale.id, amount: amt ?? undefined, reason: reason.trim() || "Estorno solicitado" },
        });
        toast.success(`Estornado ${formatBRL(r.amount)} no Mercado Pago`);
      } else {
        const { error } = await supabase.rpc("refund_pdv_sale", {
          _sale_id: sale.id,
          _amount: amt as unknown as number,
          _reason: (reason || null) as unknown as string,
          _grant_token: pinToken,
        });
        if (error) throw error;
        toast.success(amt == null ? "Venda estornada" : `Estornado ${formatBRL(amt)}`);
      }
      setMode("none"); setAmount(""); setReason("");
      qc.invalidateQueries({ queryKey: ["unified-history"] });
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Venda {sale.daily_number != null ? `#${String(sale.daily_number).padStart(3, "0")}` : ""}
            <Badge variant="outline" className="text-[10px]">{sale.channel.toUpperCase()}</Badge>
            {cancelled && <Badge variant="destructive">Estornada</Badge>}
          </SheetTitle>
          <SheetDescription>
            {new Date(sale.created_at).toLocaleString("pt-BR")} · {sale.seller_name ?? "—"}
            {sale.customer_name ? ` → ${sale.customer_name}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="rounded-lg border border-border p-3 flex-1">
              <div className="text-[11px] uppercase text-muted-foreground">Total</div>
              <div className="text-3xl font-bold text-gradient">{formatBRL(Number(sale.total))}</div>
              {details && details.refund_amount > 0 && (
                <div className="text-xs text-amber-500 mt-1">Já estornado: {formatBRL(details.refund_amount)}</div>
              )}
            </div>
            
            {!cancelled && (
              <Button 
                variant="outline" 
                size="icon" 
                className="h-12 w-12 shrink-0" 
                onClick={handlePrint}
                disabled={printing || detailsLoading}
              >
                {printing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
              </Button>
            )}
          </div>

          {detailsLoading ? (
            <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : details && details.items.length > 0 ? (
            <div>
              <div className="text-xs font-semibold mb-1.5">Produtos ({details.items.length})</div>
              <div className="space-y-1">
                {details.items.map((i, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm gap-2">
                    <span className="flex-1 truncate">{i.qty}× {i.name}</span>
                    <span className="font-semibold shrink-0">{formatBRL(i.subtotal)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {details && details.payments.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1.5">Pagamento</div>
              <div className="space-y-1">
                {details.payments.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm">
                    <span>{methodLabel(p.method)}</span>
                    <span className="font-semibold">{formatBRL(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cancelled && details?.refund_reason && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
              <div className="flex items-center gap-1 font-semibold text-destructive mb-1">
                <AlertTriangle className="h-3 w-3" /> Motivo
              </div>
              {details.refund_reason}
            </div>
          )}

          {canRefund && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="text-xs font-semibold flex items-center gap-1">
                  <Undo2 className="h-3.5 w-3.5" /> Estornar
                  {isOnline && <Badge variant="outline" className="text-[9px] ml-1">via Mercado Pago</Badge>}
                </div>
                {mode === "none" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setMode("total")}>Estornar tudo</Button>
                    <Button variant="outline" onClick={() => setMode("partial")}>Parcial (valor)</Button>
                  </div>
                )}
                {mode === "partial" && (
                  <div>
                    <Label>Valor a estornar</Label>
                    <Input
                      type="number" inputMode="decimal" step="0.50" placeholder="0,00"
                      value={amount} onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                )}
                {mode !== "none" && (
                  <div>
                    <Label>Motivo {isOnline ? "*" : "(opcional)"}</Label>
                    <Input
                      value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder="Ex: cobrado errado, cliente desistiu"
                    />
                  </div>
                )}
                {mode !== "none" && (
                  <SheetFooter className="flex gap-2 mt-2">
                    <Button variant="ghost" onClick={() => setMode("none")}>Voltar</Button>
                    <Button
                      onClick={doRefund} disabled={loading || (isOnline && !reason.trim())}
                      className="bg-destructive text-destructive-foreground"
                    >
                      {loading ? "Processando..." : pinToken ? "Confirmar estorno" : "Desbloquear com PIN"}
                    </Button>
                  </SheetFooter>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
