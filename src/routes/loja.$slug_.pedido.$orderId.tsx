import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Clock, Copy, Check, Loader2, Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getOrder } from "@/lojinha/api";
import { formatBRL } from "@/lib/format";
import { createPublicPixCharge, getPublicPixChargeStatus, simulatePixApproval } from "@/lib/pix-public.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/loja/$slug_/pedido/$orderId")({
  component: OrderPage,
});

function OrderPage() {
  const { slug, orderId } = Route.useParams();

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["lojinha-order", orderId],
    queryFn: () => getOrder(orderId),
    refetchInterval: (q) => (q.state.data?.order?.status === "pending" ? 3000 : 15_000),
  });

  useEffect(() => {
    const ch = supabase
      .channel(`lojinha-order-${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lojinha_orders", filter: `id=eq.${orderId}` }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "lojinha_order_units", filter: `order_id=eq.${orderId}` }, () => refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orderId, refetch]);

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <p>Pedido não encontrado.</p>
      </div>
    );
  }

  const { order, items } = data;
  const isPaid = order.status === "paid" || order.status === "delivered";
  const isPending = order.status === "pending";
  const dailyNo = (order as unknown as { daily_number?: number | null }).daily_number ?? null;
  const pickupToken = (order as unknown as { pickup_token?: string | null }).pickup_token ?? null;
  const orderNoLabel = dailyNo != null ? "#" + String(dailyNo).padStart(3, "0") : null;

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="bg-gradient-primary px-4 py-6 text-primary-foreground">
        <div className="max-w-xl mx-auto">
          <Link to="/loja/$slug" params={{ slug }} className="text-xs opacity-80 hover:underline flex items-center gap-1">
            <Store className="h-3 w-3" /> Voltar à loja
          </Link>
          <h1 className="text-2xl font-bold mt-2">Pedido {orderNoLabel ?? ""}</h1>
          <p className="text-sm opacity-80">{order.customer_name}</p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 space-y-4">
        {isPending && <PixCheckoutPanel orderId={orderId} onPaid={() => refetch()} />}

        {isPaid && pickupToken && (
          <Card className="border-success/40 bg-success/5">
            <CardContent className="p-4 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-6 w-6 text-success" />
              <div>
                <div className="font-bold text-success text-lg">Pagamento confirmado</div>
                <div className="text-xs text-muted-foreground">Mostre este QR ao garçom para retirar seu pedido.</div>
              </div>
              {orderNoLabel && <div className="text-3xl font-black tracking-widest">{orderNoLabel}</div>}
              <div className="bg-white p-3 rounded-lg">
                <QRCodeSVG value={pickupToken} size={220} level="M" />
              </div>
              <div className="w-full space-y-2 pt-2 border-t">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground text-left">Código de retirada</div>
                <div className="font-mono text-xs break-all bg-muted rounded p-2 text-left">{pickupToken}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={async () => {
                    await navigator.clipboard.writeText(pickupToken);
                    toast.success("Código copiado");
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" /> Copiar código de retirada
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Câmera do garçom não leu? Toque em "Copiar código" e peça pra ele colar na tela dele.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        {isPaid && !pickupToken && (
          <Card className="border-success/40 bg-success/5">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-success" />
              <div>
                <div className="font-medium">Pedido entregue</div>
                <div className="text-xs text-muted-foreground">Obrigado! Aproveite.</div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-2">Itens</div>
            {items.map((i) => (
              <div key={i.id} className="flex justify-between text-sm py-1">
                <span>{i.product_name_snapshot} × {i.quantity}</span>
                <span>{formatBRL(i.unit_price * i.quantity)}</span>
              </div>
            ))}
            <div className="border-t mt-2 pt-2 flex justify-between font-bold">
              <span>Total</span>
              <span>{formatBRL(order.total)}</span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

type Charge = {
  id: string;
  qr_code: string | null;
  qr_code_base64: string | null;
  expires_at: string | null;
  amount: number;
  status: string;
};

function PixCheckoutPanel({ orderId, onPaid }: { orderId: string; onPaid: () => void }) {
  const create = useServerFn(createPublicPixCharge);
  const check = useServerFn(getPublicPixChargeStatus);
  const simulate = useServerFn(simulatePixApproval);
  const [simulating, setSimulating] = useState(false);
  const [charge, setCharge] = useState<Charge | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    create({ data: { orderId } })
      .then((c) => setCharge(c as Charge))
      .catch((e: Error) => toast.error(e.message || "Falha ao gerar PIX"))
      .finally(() => setLoading(false));
  }, [orderId, create]);

  // Polling de status
  useEffect(() => {
    if (!charge || charge.status !== "pending") return;
    const h = setInterval(async () => {
      try {
        const s = await check({ data: { orderId } });
        if (s?.status === "approved") {
          clearInterval(h);
          onPaid();
        } else if (s?.status === "cancelled" || s?.status === "expired") {
          clearInterval(h);
          setCharge((c) => (c ? { ...c, status: s.status } : c));
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(h);
  }, [charge, orderId, check, onPaid]);

  // Countdown
  useEffect(() => {
    if (!charge?.expires_at) return;
    const exp = new Date(charge.expires_at).getTime();
    const tick = () => setRemaining(Math.max(0, Math.round((exp - Date.now()) / 1000)));
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

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Gerando PIX…</span>
        </CardContent>
      </Card>
    );
  }

  if (!charge) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-4">
          <div className="font-medium">Não foi possível gerar o PIX</div>
          <p className="text-xs text-muted-foreground">Atualize a página para tentar novamente.</p>
        </CardContent>
      </Card>
    );
  }

  const mmss = remaining == null ? "" : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <Card className="border-primary/40">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary animate-pulse" />
          <div>
            <div className="font-medium">Pague com PIX para liberar o pedido</div>
            <div className="text-xs text-muted-foreground">Total: <strong>{formatBRL(charge.amount)}</strong></div>
          </div>
        </div>

        {charge.qr_code_base64 && (
          <div className="flex justify-center bg-white p-3 rounded-lg">
            <img
              src={`data:image/png;base64,${charge.qr_code_base64}`}
              alt="QR Code PIX"
              className="w-56 h-56"
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
            Aguardando confirmação…
          </div>
          {remaining != null && <div>Expira em {mmss}</div>}
        </div>

        <Button
          variant="outline"
          className="w-full border-dashed border-amber-500/60 text-amber-600 hover:bg-amber-500/10"
          disabled={simulating}
          onClick={async () => {
            setSimulating(true);
            try {
              await simulate({ data: { chargeId: charge.id } });
              toast.success("Pagamento simulado aprovado");
              onPaid();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Falha ao simular");
            } finally {
              setSimulating(false);
            }
          }}
        >
          {simulating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          [TESTE] Simular Pagamento Aprovado
        </Button>
      </CardContent>
    </Card>
  );
}
