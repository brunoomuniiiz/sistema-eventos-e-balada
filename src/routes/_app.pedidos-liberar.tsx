import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Loader2, Printer, ArrowLeft, Package, Layers, User, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { orderLookupByToken, orderRelease } from "@/lojinha/api";
import { formatBRL } from "@/lib/format";
import { formatOrderNo } from "@/lib/print-receipt";
import { printPrepSlips } from "@/lib/order-print";

type Search = { token?: string };

export const Route = createFileRoute("/_app/pedidos-liberar")({
  component: ReleasePage,
  validateSearch: (s: Record<string, unknown>): Search => ({
    token: typeof s.token === "string" ? s.token : undefined,
  }),
});

function ReleasePage() {
  const { token } = useSearch({ from: "/_app/pedidos-liberar" });
  const navigate = useNavigate();
  const { can, loading: pLoading } = usePermissions();
  const [releasing, setReleasing] = useState(false);
  const [released, setReleased] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["order-lookup", token],
    enabled: !!token,
    queryFn: () => orderLookupByToken(token!),
  });

  if (pLoading) return null;
  if (!can("vendas") && !can("lojinha")) {
    return <PageHeader title="Liberar pedido" subtitle="Sem permissão" />;
  }

  if (!token) {
    return (
      <div className="p-4">
        <PageHeader title="Liberar pedido" subtitle="Token ausente" />
        <Link to="/lojinha"><Button variant="outline"><ArrowLeft className="h-4 w-4" />Voltar</Button></Link>
      </div>
    );
  }

  if (isLoading) {
    return <div className="grid place-items-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (error || !data || !data.ok) {
    return (
      <div className="p-4 space-y-3">
        <PageHeader title="Pedido não encontrado" subtitle="QR inválido ou expirado" />
        <Button variant="outline" onClick={() => navigate({ to: "/lojinha" })}><ArrowLeft className="h-4 w-4" />Voltar</Button>
      </div>
    );
  }

  const combos = data.items.filter((i) => i.product_type === "combo");
  const hasCombos = combos.length > 0;
  const totalUnits = combos.reduce((s, c) => s + c.quantity, 0);

  async function handleRelease() {
    if (!data || !data.ok) return;
    setReleasing(true);
    try {
      const res = await orderRelease(data.source, data.id);
      if (res.prep_slips.length > 0) {
        const ok = printPrepSlips(res.prep_slips);
        if (!ok) {
          toast.warning("Habilite popups para imprimir as fichas de preparo");
        }
      }
      setReleased(true);
      toast.success(`Pedido ${formatOrderNo(res.daily_number)} entregue!`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao liberar pedido");
    } finally {
      setReleasing(false);
    }
  }

  // Auto-return to scanner after release
  useEffect(() => {
    if (!released) return;
    const h = setTimeout(() => {
      navigate({ to: "/vendas", search: { tab: "scanner" } });
    }, 1500);
    return () => clearTimeout(h);
  }, [released, navigate]);

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title={`Pedido ${formatOrderNo(data.daily_number)}`}
        subtitle={`${data.source === "sale" ? "Balcão" : "Lojinha online"} · ${formatBRL(data.total)}`}
      />

      {data.customer_name && data.customer_name !== "Balcão" && (
        <Card><CardContent className="p-3 text-sm">
          Cliente: <strong>{data.customer_name}</strong>
          {data.customer_phone && <span className="text-muted-foreground"> · {data.customer_phone}</span>}
        </CardContent></Card>
      )}

      {(data.status === "released" || data.status === "delivered") && (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="p-3 space-y-1 text-sm">
            <div className="font-bold text-success flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Produto já entregue
            </div>
            {data.delivered_by_name && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <User className="h-3 w-3" /> Entregue por <strong className="text-foreground">{data.delivered_by_name}</strong>
              </div>
            )}
            {data.delivered_at && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> {format(new Date(data.delivered_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-3 divide-y">
        {data.items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 py-2 text-sm">
            {it.product_type === "combo" ? <Layers className="h-4 w-4 text-primary" /> : <Package className="h-4 w-4 text-muted-foreground" />}
            <div className="flex-1 min-w-0">
              <div className="font-medium">{it.product_name}</div>
              <div className="text-xs text-muted-foreground">
                {it.product_type === "combo" ? "Combo — imprime ficha de preparo" : "Item simples — só baixa digital"}
              </div>
            </div>
            <div className="font-bold">×{it.quantity}</div>
          </div>
        ))}
      </CardContent></Card>

      {hasCombos ? (
        <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 text-sm flex items-start gap-2">
          <Printer className="h-4 w-4 text-primary mt-0.5" />
          <span>Ao liberar, serão impressas <strong>{totalUnits} ficha(s)</strong> de preparo (uma por combo).</span>
        </div>
      ) : (
        <div className="p-3 rounded-lg border bg-muted/40 text-sm">
          Sem combos — apenas baixa digital, nada será impresso.
        </div>
      )}

      {released ? (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-success" />
            <div>
              <div className="font-bold text-success">Pedido liberado!</div>
              <div className="text-xs text-muted-foreground">Pronto para entrega.</div>
            </div>
            <Button className="ml-auto" variant="outline" onClick={() => navigate({ to: "/lojinha" })}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="fixed bottom-20 md:bottom-6 left-4 right-4 max-w-md mx-auto">
          <Button
            size="lg"
            className="w-full h-14 text-base font-bold shadow-2xl"
            disabled={releasing || data.status === "released" || data.status === "delivered"}
            onClick={handleRelease}
          >
            {releasing ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
            {data.status === "released" || data.status === "delivered"
              ? "Já liberado"
              : hasCombos ? "Liberar e imprimir" : "Liberar pedido"}
          </Button>
          {(data.status === "released" || data.status === "delivered") && (
            <Badge className="absolute -top-3 right-2">Já liberado</Badge>
          )}
        </div>
      )}
    </div>
  );
}
