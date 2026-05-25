import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Undo2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

export type PortariaSale = {
  id: string;
  created_at: string;
  total: number;
  status: string;
  employee_name: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  items: { id: string; gender: string | null; amount: number; ticket_type_id: string | null }[];
  payments: { method: string; amount: number }[];
};

function methodLabel(m: string) {
  return { dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito", pix: "Pix" }[m] ?? m;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sale: PortariaSale | null;
  grantToken: string | null;
  onRequestUnlock: () => void;
  onDone: () => void;
}

export function SaleDetailSheet({ open, onOpenChange, sale, grantToken, onRequestUnlock, onDone }: Props) {
  const [mode, setMode] = useState<"none" | "total" | "partial">("none");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  if (!sale) return null;
  const cancelled = sale.status === "cancelled";

  const refund = async () => {
    if (!grantToken) { onRequestUnlock(); return; }
    let amt: number | null = null;
    if (mode === "partial") {
      const v = Number((amount || "0").replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) return toast.error("Valor inválido");
      if (v > Number(sale.total)) return toast.error("Valor maior que a venda");
      amt = v;
    }
    setLoading(true);
    try {
      const { error } = await supabase.rpc("refund_event_sale", {
        _sale_id: sale.id,
        _amount: amt as unknown as number,
        _reason: (reason || null) as unknown as string,
        _grant_token: grantToken,
      });
      if (error) throw error;
      toast.success(amt == null ? "Venda estornada" : `Estornado ${formatBRL(amt)}`);
      setMode("none"); setAmount(""); setReason("");
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
            Detalhe da venda
            {cancelled && <Badge variant="destructive">Estornada</Badge>}
          </SheetTitle>
          <SheetDescription>
            {new Date(sale.created_at).toLocaleString("pt-BR")} · por {sale.employee_name ?? "—"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] uppercase text-muted-foreground">Total</div>
            <div className="text-3xl font-bold text-gradient">{formatBRL(Number(sale.total))}</div>
          </div>

          <div>
            <div className="text-xs font-semibold mb-1.5">Ingressos ({sale.items.length})</div>
            <div className="space-y-1">
              {sale.items.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm">
                  <span>
                    {i.gender === "F" ? "Feminino" : i.gender === "M" ? "Masculino" : "Entrada"}
                  </span>
                  <span className="font-semibold">{formatBRL(Number(i.amount))}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold mb-1.5">Pagamento</div>
            <div className="space-y-1">
              {sale.payments.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm">
                  <span>{methodLabel(p.method)}</span>
                  <span className="font-semibold">{formatBRL(Number(p.amount))}</span>
                </div>
              ))}
            </div>
          </div>

          {cancelled && sale.cancelled_reason && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
              <div className="flex items-center gap-1 font-semibold text-destructive mb-1">
                <AlertTriangle className="h-3 w-3" /> Motivo
              </div>
              {sale.cancelled_reason}
            </div>
          )}

          {!cancelled && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="text-xs font-semibold flex items-center gap-1">
                  <Undo2 className="h-3.5 w-3.5" /> Estornar
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
                      type="number"
                      inputMode="decimal"
                      step="0.50"
                      placeholder="0,00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                )}
                {mode !== "none" && (
                  <div>
                    <Label>Motivo (opcional)</Label>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: cobrado errado" />
                  </div>
                )}
                {mode !== "none" && (
                  <SheetFooter className="flex gap-2 mt-2">
                    <Button variant="ghost" onClick={() => setMode("none")}>Voltar</Button>
                    <Button onClick={refund} disabled={loading} className="bg-destructive text-destructive-foreground">
                      {loading ? "Processando..." : grantToken ? "Confirmar estorno" : "Desbloquear com PIN"}
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
