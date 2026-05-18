import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Clock, Loader2, Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getOrder } from "@/lojinha/api";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/loja/$slug/pedido/$orderId")({
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

  const { order, items, units } = data;
  const isPaid = order.status === "paid" || order.status === "delivered";

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="bg-gradient-primary px-4 py-6 text-primary-foreground">
        <div className="max-w-xl mx-auto">
          <Link to="/loja/$slug" params={{ slug }} className="text-xs opacity-80 hover:underline flex items-center gap-1">
            <Store className="h-3 w-3" /> Voltar à loja
          </Link>
          <h1 className="text-2xl font-bold mt-2">Pedido</h1>
          <p className="text-sm opacity-80">{order.customer_name}</p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 space-y-4">
        {!isPaid && (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-6 w-6 text-warning animate-pulse" />
              <div>
                <div className="font-medium">Aguardando pagamento</div>
                <div className="text-xs text-muted-foreground">
                  Assim que o pagamento for confirmado, os QR codes aparecerão aqui.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isPaid && (
          <Card className="border-success/40 bg-success/5">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-success" />
              <div>
                <div className="font-medium">Pagamento confirmado</div>
                <div className="text-xs text-muted-foreground">
                  Apresente cada QR code abaixo no balcão para retirar.
                </div>
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

        {units.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-bold mt-4">Seus QR codes ({units.length})</h2>
            {units.map((u, idx) => {
              const delivered = u.status === "delivered";
              return (
                <Card key={u.id} className={delivered ? "opacity-60" : ""}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="bg-white p-2 rounded-lg">
                      <QRCodeSVG value={u.qr_token} size={104} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">Unidade {idx + 1} de {units.length}</div>
                      <div className="font-medium">{u.product_name}</div>
                      {delivered ? (
                        <Badge variant="secondary" className="mt-1">Entregue</Badge>
                      ) : (
                        <Badge className="mt-1 bg-success text-success-foreground">Pronto p/ retirar</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
