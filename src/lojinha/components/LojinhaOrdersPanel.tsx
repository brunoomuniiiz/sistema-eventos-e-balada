import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Package, CheckCircle2, Printer, XCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatBRL } from "@/lib/format";
import { markOrderDelivered, abandonLojinhaOrder } from "@/lojinha/api";
import { deleteLojinhaOrder, deleteAllLojinhaOrders } from "@/lib/pix.functions";
import { printReceipt, qrSvgString } from "@/lib/order-print";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: "Aguardando pagamento", color: "bg-warning text-warning-foreground" },
  paid: { label: "Pago — pronto p/ retirada", color: "bg-success text-success-foreground" },
  delivered: { label: "Entregue", color: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelado", color: "bg-destructive text-destructive-foreground" },
};

const PRINTED_KEY = "lojinha-printed-orders";

function loadPrinted(): Set<string> {
  try {
    const raw = localStorage.getItem(PRINTED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function savePrinted(set: Set<string>) {
  try {
    localStorage.setItem(PRINTED_KEY, JSON.stringify([...set].slice(-200)));
  } catch {}
}

type OrderRow = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  total: number;
  status: string;
  created_at: string;
  daily_number: number | null;
  pickup_token: string | null;
  pickup_code: string | null;
  hasCombo: boolean;
  items: Array<{ name: string; quantity: number; unit_price: number; product_type: string }>;
};

export function LojinhaOrdersPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("paid");
  const [busy, setBusy] = useState<string | null>(null);
  const printedRef = useRef<Set<string>>(loadPrinted());
  const barNameRef = useRef<string | null>(null);

  // Fetch bar name once for receipts
  useEffect(() => {
    if (!user) return;
    supabase.from("bar_settings").select("bar_name").maybeSingle().then(({ data }) => {
      barNameRef.current = data?.bar_name ?? null;
    });
  }, [user]);

  const { data: orders = [], isLoading } = useQuery<OrderRow[]>({
    queryKey: ["lojinha-orders", user?.id, filter],
    enabled: !!user,
    refetchInterval: 8000,
    queryFn: async () => {
      let q = supabase
        .from("lojinha_orders")
        .select("id,customer_name,customer_phone,total,status,created_at,daily_number,pickup_token,pickup_code")
        .order("created_at", { ascending: false })
        .limit(50);
      if (filter === "all") q = q.not("status", "in", "(abandoned,cancelled)");
      else q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const { data: items } = await supabase
        .from("lojinha_order_items")
        .select("order_id,product_name_snapshot,quantity,unit_price,products(product_type)")
        .in("order_id", ids);

      const byOrder = new Map<string, OrderRow["items"]>();
      (items ?? []).forEach((it: any) => {
        const arr = byOrder.get(it.order_id) ?? [];
        arr.push({
          name: it.product_name_snapshot,
          quantity: it.quantity,
          unit_price: Number(it.unit_price),
          product_type: it.products?.product_type ?? "simple",
        });
        byOrder.set(it.order_id, arr);
      });

      return rows.map((r) => {
        const its = byOrder.get(r.id) ?? [];
        return {
          ...r,
          total: Number(r.total),
          items: its,
          hasCombo: its.some((i) => i.product_type === "combo"),
        } as OrderRow;
      });
    },
  });

  async function doPrint(o: OrderRow) {
    if (!o.pickup_token) {
      toast.error("Pedido sem token de retirada");
      return;
    }
    const qr = await qrSvgString(o.pickup_token);
    printReceipt({
      daily_number: o.daily_number,
      bar_name: barNameRef.current,
      items: o.items.map((i) => ({ product_name: i.name, quantity: i.quantity, unit_price: i.unit_price })),
      total: o.total,
      payment_method: "Online",
      qr_svg_string: qr,
      pickup_token: o.pickup_token,
      pickup_code: o.pickup_code,
    });
  }

  // Auto-print novos pedidos pagos com combo
  useEffect(() => {
    orders.forEach((o) => {
      if (o.status === "paid" && o.hasCombo && !printedRef.current.has(o.id) && o.pickup_token) {
        printedRef.current.add(o.id);
        savePrinted(printedRef.current);
        void doPrint(o).then(() => {
          toast.success(`Cupom impresso — pedido #${String(o.daily_number ?? "").padStart(3, "0")}`);
        });
      }
    });
  }, [orders]);

  async function handleDeliver(o: OrderRow) {
    setBusy(o.id);
    try {
      const r = await markOrderDelivered(o.id);
      if (r.ok) {
        toast.success("Pedido entregue");
        qc.invalidateQueries({ queryKey: ["lojinha-orders"] });
      } else {
        toast.error(r.reason ?? "Falha ao entregar");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function handleAbandon(o: OrderRow) {
    setBusy(o.id);
    try {
      const r = await abandonLojinhaOrder(o.id);
      if (r.ok) {
        toast.success(`Pedido #${String(o.daily_number ?? "").padStart(3, "0")} marcado como abandonado`);
        qc.invalidateQueries({ queryKey: ["lojinha-orders"] });
        qc.invalidateQueries({ queryKey: ["lojinha-abandoned"] });
      } else {
        toast.error(r.reason ?? "Não foi possível abandonar");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }


  return (
    <div className="space-y-3">
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="paid">Para entregar</TabsTrigger>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="delivered">Entregues</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && (
        <div className="grid place-items-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}

      {!isLoading && orders.length === 0 && (
        <div className="text-center text-muted-foreground py-12">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Nenhum pedido nesse filtro.
        </div>
      )}

      <div className="grid gap-2">
        {orders.map((o) => {
          const s = STATUS_LABEL[o.status] ?? { label: o.status, color: "bg-secondary" };
          const isPaid = o.status === "paid";
          return (
            <Card key={o.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {o.daily_number != null && (
                        <span className="text-primary font-bold mr-2">#{String(o.daily_number).padStart(3, "0")}</span>
                      )}
                      {o.customer_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(o.created_at), "dd/MM HH:mm", { locale: ptBR })} · {o.customer_phone || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {o.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold">{formatBRL(o.total)}</div>
                    <Badge className={`mt-1 text-[10px] ${s.color}`}>{s.label}</Badge>
                  </div>
                </div>

                {o.status === "pending" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="w-full text-destructive border-destructive/40 hover:bg-destructive/10" disabled={busy === o.id}>
                        <XCircle className="h-4 w-4 mr-1" /> Cliente abandonou
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Marcar como abandonado?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O pedido #{String(o.daily_number ?? "").padStart(3, "0")} sairá da lista de pendentes e o estoque será liberado. Ele aparecerá em "Abandonados" pro dono conferir.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleAbandon(o)}>Confirmar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {isPaid && !o.hasCombo && (
                  <Button
                    size="sm"
                    className="w-full bg-success text-success-foreground hover:bg-success/90"
                    onClick={() => handleDeliver(o)}
                    disabled={busy === o.id}
                  >
                    {busy === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Entregue</>}
                  </Button>
                )}

                {isPaid && o.hasCombo && (
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground text-center">
                      Cupom impresso — aguardando QR/código no scanner
                    </div>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => doPrint(o)}>
                      <Printer className="h-4 w-4 mr-1" /> Reimprimir cupom
                    </Button>
                  </div>
                )}

                {o.status === "delivered" && o.hasCombo && (
                  <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => doPrint(o)}>
                    <Printer className="h-3 w-3 mr-1" /> Reimprimir
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
