import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Minus, Trash2, ShoppingBag, Search, QrCode, CreditCard, CheckCircle2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { createPosOrder, confirmDeliveryPos, markPosPaid } from "@/lojinha/api";

type Product = {
  id: string;
  name: string;
  price: number;
  online_price: number | null;
  photo_url: string | null;
  category_id: string | null;
  category_name: string | null;
  sell_online: boolean;
  is_available: boolean;
};

type CartItem = { product_id: string; product_name: string; unit_price: number; quantity: number };

type Step = "cart" | "method" | "waiting" | "delivered";

export function LojinhaPosView() {
  const { ownerId, lojinhaCanSell, lojinhaPaymentMethods, lojinhaPointDeviceId, loading } = usePermissions();
  const qc = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("__all__");
  const [step, setStep] = useState<Step>("cart");
  const [method, setMethod] = useState<"pix" | "card" | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["lojinha-pos-products", ownerId],
    enabled: !!ownerId && lojinhaCanSell,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, online_price, photo_url, category_id, sell_online, is_available, category:product_categories(name)")
        .eq("sell_online", true)
        .eq("is_available", true)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p,
        category_name: (p as { category?: { name?: string } | null }).category?.name ?? null,
      })) as Product[];
    },
  });

  // Poll status do pedido quando estiver aguardando pagamento
  const { data: orderStatus } = useQuery({
    queryKey: ["lojinha-pos-order-status", orderId],
    enabled: !!orderId && step === "waiting",
    refetchInterval: 2500,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lojinha_orders")
        .select("status, paid_at")
        .eq("id", orderId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const totalItems = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    products.forEach((p) => {
      const name = p.category_name ?? "Outros";
      if (!seen.has(name)) { seen.add(name); out.push(name); }
    });
    return out.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const cat = p.category_name ?? "Outros";
      if (activeCategory !== "__all__" && cat !== activeCategory) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [products, search, activeCategory]);

  const addToCart = (p: Product) => {
    const price = Number(p.online_price ?? p.price);
    setCart((prev) => {
      const ex = prev.find((i) => i.product_id === p.id);
      if (ex) return prev.map((i) => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: p.id, product_name: p.name, unit_price: price, quantity: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) => prev.flatMap((i) => {
      if (i.product_id !== id) return [i];
      const q = i.quantity + delta;
      return q <= 0 ? [] : [{ ...i, quantity: q }];
    }));
  };

  const reset = () => {
    setCart([]);
    setStep("cart");
    setMethod(null);
    setOrderId(null);
    setOrderTotal(0);
  };

  const startCharge = async (m: "pix" | "card") => {
    if (cart.length === 0) return;
    if (m === "card" && !lojinhaPointDeviceId) {
      toast.error("Você não tem maquininha vinculada");
      return;
    }
    setBusy(true);
    try {
      const items = cart.map((i) => ({ product_id: i.product_id, quantity: i.quantity }));
      const res = await createPosOrder(items, m, m === "card" ? lojinhaPointDeviceId : null);
      setOrderId(res.order_id);
      setOrderTotal(Number(res.total));
      setMethod(m);
      setStep("waiting");
      toast.success(m === "pix" ? "Pedido criado — gerando QR Pix" : "Pedido criado — enviando para a maquininha");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar pedido");
    } finally {
      setBusy(false);
    }
  };

  // Simulação enquanto MP não está conectado: botão manual de "confirmar pagamento"
  const confirmPaymentManual = async () => {
    if (!orderId) return;
    setBusy(true);
    try {
      await markPosPaid(orderId, "manual-" + Date.now());
      toast.success("Pagamento confirmado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  const onDelivered = async () => {
    if (!orderId) return;
    setBusy(true);
    try {
      await confirmDeliveryPos(orderId);
      setStep("delivered");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["pdv-stock-total"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (orderStatus?.status === "paid") {
      // já marcou como pago via webhook
    }
  }, [orderStatus?.status]);

  if (loading) return <div className="grid place-items-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!lojinhaCanSell) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Você não tem permissão para vender no balcão da lojinha.</CardContent></Card>;
  }

  // --- step: delivered ---
  if (step === "delivered") {
    return (
      <div className="max-w-md mx-auto py-8 text-center space-y-4">
        <CheckCircle2 className="h-20 w-20 text-success mx-auto" />
        <h2 className="text-2xl font-bold">Produto entregue!</h2>
        <p className="text-muted-foreground">Venda registrada com sucesso.</p>
        <Button size="lg" className="w-full" onClick={reset}>Nova venda</Button>
      </div>
    );
  }

  // --- step: waiting (esperando pagamento ou pago aguardando entrega) ---
  if (step === "waiting") {
    const isPaid = orderStatus?.status === "paid" || orderStatus?.status === "delivered";
    return (
      <div className="max-w-md mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setStep("cart"); setOrderId(null); }} disabled={busy}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Cancelar
        </Button>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-3xl font-bold">{formatBRL(orderTotal)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {method === "pix" ? "Pix Mercado Pago" : "Cartão (Point Smart)"}
            </div>
          </CardContent>
        </Card>

        {!isPaid ? (
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <div className="font-medium">
                {method === "pix" ? "Aguardando pagamento Pix…" : "Aguardando cartão na maquininha…"}
              </div>
              <p className="text-xs text-muted-foreground">
                {method === "pix"
                  ? "Quando o Mercado Pago estiver conectado, o QR Pix aparece aqui para o cliente apontar a câmera."
                  : "Quando o Mercado Pago estiver conectado, a maquininha acorda sozinha e mostra o valor para o cliente."}
              </p>
              <Button variant="outline" className="w-full" onClick={confirmPaymentManual} disabled={busy}>
                {busy ? "..." : "Confirmar pagamento manualmente (teste)"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-success/40 bg-success/5">
            <CardContent className="p-6 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
              <div className="text-lg font-bold text-success">Pagamento confirmado!</div>
              <p className="text-sm">Entregue o produto ao cliente e clique abaixo.</p>
              <Button size="lg" className="w-full h-14 text-base" onClick={onDelivered} disabled={busy}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entreguei o produto"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // --- step: method ---
  if (step === "method") {
    const allowPix = lojinhaPaymentMethods.includes("pix");
    const allowCard = lojinhaPaymentMethods.includes("card");
    return (
      <div className="max-w-md mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setStep("cart")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-xs text-muted-foreground">Total a cobrar</div>
            <div className="text-3xl font-bold">{formatBRL(subtotal)}</div>
          </CardContent>
        </Card>
        <div className="grid gap-2">
          {allowPix && (
            <Button size="lg" className="h-20 text-base" onClick={() => startCharge("pix")} disabled={busy}>
              <QrCode className="h-6 w-6 mr-2" /> Pix
            </Button>
          )}
          {allowCard && (
            <Button
              size="lg" variant="outline" className="h-20 text-base"
              onClick={() => startCharge("card")}
              disabled={busy || !lojinhaPointDeviceId}
            >
              <CreditCard className="h-6 w-6 mr-2" />
              Cartão {lojinhaPointDeviceId ? "(Point Smart)" : "(sem maquininha)"}
            </Button>
          )}
          {!allowPix && !allowCard && (
            <p className="text-sm text-center text-muted-foreground">Nenhum método de pagamento habilitado.</p>
          )}
        </div>
      </div>
    );
  }

  // --- step: cart ---
  return (
    <div className="space-y-3 pb-32">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar produto…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10" />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Nenhum produto disponível para venda online
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {filtered.map((p) => {
            const inCart = cart.find((i) => i.product_id === p.id);
            const price = Number(p.online_price ?? p.price);
            return (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className={`relative text-left rounded-xl border p-3 transition-all active:scale-95 ${inCart ? "border-primary bg-primary/5" : "border-border bg-card"}`}
              >
                {inCart && <Badge className="absolute top-1.5 right-1.5">{inCart.quantity}</Badge>}
                <div className="font-medium text-sm line-clamp-2 min-h-[2.5rem]">{p.name}</div>
                <div className="text-primary font-bold mt-1">{formatBRL(price)}</div>
              </button>
            );
          })}
        </div>
      )}

      {cart.length > 0 && (
        <div className="fixed bottom-20 md:bottom-4 left-0 right-0 px-4 z-40">
          <Card className="max-w-2xl mx-auto shadow-lg">
            <CardContent className="p-3 space-y-2">
              <div className="max-h-40 overflow-y-auto space-y-1">
                {cart.map((i) => (
                  <div key={i.product_id} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 truncate">{i.product_name}</div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQty(i.product_id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center">{i.quantity}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQty(i.product_id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <span className="w-16 text-right text-xs">{formatBRL(i.unit_price * i.quantity)}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCart((p) => p.filter((x) => x.product_id !== i.product_id))}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button className="w-full h-12 text-base" onClick={() => setStep("method")}>
                Cobrar {totalItems} {totalItems === 1 ? "item" : "itens"} · {formatBRL(subtotal)}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
