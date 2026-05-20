import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createPixCharge, getPixChargeStatus, cancelPixCharge } from "@/lib/pix.functions";
import { formatBRL } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  description: string;
  origin: "pdv" | "lojinha";
  sector: string;
  orderId?: string | null;
  salePayload?: unknown;
  onApproved: (chargeId: string) => void | Promise<void>;
};

type Charge = {
  id: string;
  qr_code: string | null;
  qr_code_base64: string | null;
  expires_at: string | null;
  amount: number;
};

export function PixQrDialog({
  open,
  onOpenChange,
  amount,
  description,
  origin,
  sector,
  orderId,
  salePayload,
  onApproved,
}: Props) {
  const create = useServerFn(createPixCharge);
  const checkStatus = useServerFn(getPixChargeStatus);
  const cancel = useServerFn(cancelPixCharge);

  const [charge, setCharge] = useState<Charge | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "cancelled">("pending");
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const startedRef = useRef(false);

  // Gera cobrança ao abrir
  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      setCharge(null);
      setStatus("pending");
      setCopied(false);
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    setCreating(true);
    create({
      data: {
        amount,
        description,
        origin,
        sector,
        orderId: orderId ?? null,
        salePayload: salePayload ?? null,
      },
    })
      .then((c) => {
        setCharge({
          id: c.id,
          qr_code: c.qr_code,
          qr_code_base64: c.qr_code_base64,
          expires_at: c.expires_at,
          amount: Number(c.amount),
        });
      })
      .catch((e: Error) => {
        toast.error(e.message || "Falha ao gerar PIX");
        onOpenChange(false);
      })
      .finally(() => setCreating(false));
  }, [open, amount, description, origin, sector, orderId, salePayload, create, onOpenChange]);

  // Polling de status
  useEffect(() => {
    if (!open || !charge || status !== "pending") return;
    const handle = setInterval(async () => {
      try {
        const s = await checkStatus({ data: { chargeId: charge.id } });
        if (s.status === "approved") {
          setStatus("approved");
          clearInterval(handle);
          await onApproved(charge.id);
          setTimeout(() => onOpenChange(false), 1200);
        } else if (s.status === "rejected" || s.status === "cancelled") {
          setStatus(s.status);
          clearInterval(handle);
        }
      } catch {
        /* mantém polling */
      }
    }, 3000);
    return () => clearInterval(handle);
  }, [open, charge, status, checkStatus, onApproved, onOpenChange]);

  // Countdown
  useEffect(() => {
    if (!charge?.expires_at) return;
    const exp = new Date(charge.expires_at).getTime();
    const tick = () => {
      const s = Math.max(0, Math.round((exp - Date.now()) / 1000));
      setRemaining(s);
    };
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [charge?.expires_at]);

  const copy = async () => {
    if (!charge?.qr_code) return;
    await navigator.clipboard.writeText(charge.qr_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleClose = async () => {
    if (charge && status === "pending") {
      try { await cancel({ data: { chargeId: charge.id } }); } catch { /* noop */ }
    }
    onOpenChange(false);
  };

  const mmss = remaining == null ? "" : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pagamento PIX</DialogTitle>
          <DialogDescription>
            {description} · <strong>{formatBRL(amount)}</strong>
          </DialogDescription>
        </DialogHeader>

        {creating || !charge ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : status === "approved" ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="rounded-full bg-emerald-500/10 p-4">
              <Check className="h-10 w-10 text-emerald-500" />
            </div>
            <div className="font-semibold text-lg">Pagamento aprovado!</div>
            <div className="text-sm text-muted-foreground">{formatBRL(charge.amount)}</div>
          </div>
        ) : status === "rejected" || status === "cancelled" ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="rounded-full bg-destructive/10 p-4">
              <X className="h-10 w-10 text-destructive" />
            </div>
            <div className="font-semibold">Pagamento {status === "rejected" ? "recusado" : "cancelado"}</div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {charge.qr_code_base64 && (
              <div className="flex justify-center bg-white p-3 rounded-lg">
                <img
                  src={`data:image/png;base64,${charge.qr_code_base64}`}
                  alt="QR Code PIX"
                  className="w-64 h-64"
                />
              </div>
            )}
            {charge.qr_code && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Pix copia-e-cola</div>
                <div className="flex gap-2">
                  <code className="flex-1 text-[10px] bg-muted rounded px-2 py-2 truncate font-mono">
                    {charge.qr_code}
                  </code>
                  <Button size="icon" variant="outline" onClick={copy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Aguardando pagamento…
              </div>
              {remaining != null && <div>Expira em {mmss}</div>}
            </div>
            <Button variant="outline" className="w-full" onClick={handleClose}>
              Cancelar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
