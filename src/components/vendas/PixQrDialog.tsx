import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Check, Loader2, X, KeyRound, QrCode as QrIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createPixCharge, getPixChargeStatus, cancelPixCharge } from "@/lib/pix.functions";
import { simulatePixApproval } from "@/lib/pix-public.functions";
import { formatBRL } from "@/lib/format";
import { AuthorizationDialog } from "@/components/AuthorizationDialog";
import { usePermissions } from "@/hooks/usePermissions";

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
  onChaveApproved?: (info: { notes: string; authorizedByName: string }) => void | Promise<void>;
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
  onChaveApproved,
}: Props) {
  const { canPixChave } = usePermissions();
  const chaveEnabled = !!onChaveApproved && canPixChave;
  const [tab, setTab] = useState<"qr" | "chave">("qr");
  const [chaveNotes, setChaveNotes] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [chaveLoading, setChaveLoading] = useState(false);
  const create = useServerFn(createPixCharge);
  const checkStatus = useServerFn(getPixChargeStatus);
  const cancel = useServerFn(cancelPixCharge);
  const simulate = useServerFn(simulatePixApproval);
  const [simulating, setSimulating] = useState(false);

  const [charge, setCharge] = useState<Charge | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "cancelled">("pending");
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      setCharge(null);
      setStatus("pending");
      setCopied(false);
      setTab("qr");
      setChaveNotes("");
      return;
    }
    if (tab !== "qr") return;
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
    toast.success("Código Pix copiado");
    setTimeout(() => setCopied(false), 1500);
  };

  const handleClose = async () => {
    if (charge && status === "pending") {
      try { await cancel({ data: { chargeId: charge.id } }); } catch { /* noop */ }
    }
    onOpenChange(false);
  };

  const mmss = remaining == null ? "" : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  const QrPane = (
    creating || !charge ? (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ) : status === "approved" ? (
      <div className="flex flex-col items-center gap-2 py-8">
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
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
      </div>
    ) : (
      <div className="flex flex-col items-center gap-3">
        {charge.qr_code_base64 && (
          <div className="bg-white p-2 rounded-lg">
            <img
              src={`data:image/png;base64,${charge.qr_code_base64}`}
              alt="QR Code PIX"
              className="w-48 h-48 sm:w-52 sm:h-52 block"
            />
          </div>
        )}
        {charge.qr_code && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={copy}
          >
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? "Copiado!" : "Copiar código Pix"}
          </Button>
        )}
        <div className="w-full flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Aguardando…
          </span>
          {remaining != null && <span>Expira em {mmss}</span>}
        </div>
        <div className="w-full flex items-center justify-between gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  );

  const ChavePane = (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground">
        Use quando o cliente pagou via chave PIX fora do app. Dono autoriza com PIN.
      </div>
      <Textarea
        value={chaveNotes}
        onChange={(e) => setChaveNotes(e.target.value)}
        placeholder="Observação (opcional)"
        rows={2}
      />
      <Button
        className="w-full"
        size="sm"
        disabled={chaveLoading}
        onClick={() => setAuthOpen(true)}
      >
        {chaveLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Confirmar recebimento ({formatBRL(amount)})
      </Button>
      <AuthorizationDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        scope="operation"
        title="Autorizar PIX por chave"
        description="Confirme com o PIN do dono que o pagamento foi recebido."
        onApproved={async (_token, authorizedByName) => {
          setChaveLoading(true);
          try {
            await onChaveApproved?.({ notes: chaveNotes, authorizedByName });
            onOpenChange(false);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro");
          } finally {
            setChaveLoading(false);
          }
        }}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-[94vw] sm:max-w-sm max-h-[94vh] p-4 gap-3 overflow-hidden flex flex-col">
        <DialogHeader className="space-y-0">
          <div className="flex items-baseline justify-between gap-2">
            <DialogTitle className="text-base">Pagamento PIX</DialogTitle>
            <span className="font-bold text-lg text-primary">{formatBRL(amount)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{description}</p>
        </DialogHeader>

        {chaveEnabled ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "qr" | "chave")} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2 h-8">
              <TabsTrigger value="qr" className="text-xs"><QrIcon className="h-3.5 w-3.5 mr-1" />QR Code</TabsTrigger>
              <TabsTrigger value="chave" className="text-xs"><KeyRound className="h-3.5 w-3.5 mr-1" />Chave PIX</TabsTrigger>
            </TabsList>
            <TabsContent value="qr" className="mt-3 flex-1">{QrPane}</TabsContent>
            <TabsContent value="chave" className="mt-3 flex-1">{ChavePane}</TabsContent>
          </Tabs>
        ) : (
          QrPane
        )}
      </DialogContent>
    </Dialog>
  );
}
