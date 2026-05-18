import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, ShoppingBag, Store, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { getStorefront, reserveCartItem, createOrder, type StorefrontProduct } from "@/lojinha/api";
import { getCart, setCart, getCartToken, getCustomer, saveCustomer, resetCart, type CartItem } from "@/lojinha/lib/cart";

export const Route = createFileRoute("/loja/$slug")({
  component: StorefrontPage,
});

function StorefrontPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [cart, setCartState] = useState<CartItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [customer, setCustomerState] = useState({ name: "", email: "", phone: "" });
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    setCartState(getCart(slug));
    setToken(getCartToken(slug));
    const c = getCustomer();
    if (c) setCustomerState(c);
  }, [slug]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["lojinha-storefront", slug],
    queryFn: () => getStorefront(slug),
    refetchInterval: 30_000,
  });

  const productsById = useMemo(() => {
    const m = new Map<string, StorefrontProduct>();
    (data?.products ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [data]);

  const cartTotal = useMemo(
    () => cart.reduce((s, it) => s + (productsById.get(it.product_id)?.price ?? 0) * it.quantity, 0),
    [cart, productsById]
  );
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  async function changeQty(productId: string, nextQty: number) {
    if (!token) return;
    const p = productsById.get(productId);
    if (!p) return;
    const current = cart.find((c) => c.product_id === productId)?.quantity ?? 0;
    if (nextQty > 0 && nextQty > current + p.available_qty) {
      toast.error("Estoque insuficiente");
      return;
    }
    try {
      const res = await reserveCartItem(slug, token, productId, nextQty);
      if (!res.ok) {
        toast.error(res.reason === "sem_estoque" ? "Estoque insuficiente" : "Não foi possível reservar");
        return;
      }
      const next = nextQty <= 0
        ? cart.filter((c) => c.product_id !== productId)
        : cart.find((c) => c.product_id === productId)
          ? cart.map((c) => (c.product_id === productId ? { ...c, quantity: nextQty } : c))
          : [...cart, { product_id: productId, quantity: nextQty }];
      setCartState(next);
      setCart(slug, next);
      refetch();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao atualizar carrinho");
    }
  }

  async function handleCheckout() {
    if (!customer.name.trim() || !customer.phone.trim()) {
      toast.error("Preencha nome e WhatsApp");
      return;
    }
    saveCustomer(customer);
    setCreating(true);
    try {
      const res = await createOrder(slug, token, customer);
      // Limpa carrinho local (reserva fica até pagar; aqui simplificamos)
      resetCart(slug);
      navigate({ to: "/loja/$slug/pedido/$orderId", params: { slug, orderId: res.order_id } });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Erro ao criar pedido");
    } finally {
      setCreating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6 text-center">
        <div>
          <Store className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-xl font-bold">Loja não encontrada</h1>
          <p className="text-sm text-muted-foreground mt-1">Verifique o link.</p>
        </div>
      </div>
    );
  }

  const accent = data.settings.accent_color || "#e94560";

  return (
    <div className="min-h-screen bg-background pb-32">
      <header
        className="px-4 py-8 text-white"
        style={{ background: `linear-gradient(135deg, ${accent}, #1a1a2e)` }}
      >
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <div className="h-12 w-12 rounded-xl bg-white/15 grid place-items-center backdrop-blur">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{data.settings.store_name || "Loja"}</h1>
            <p className="text-sm opacity-80">Peça pelo app e retire no balcão</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {data.products.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            Nenhum produto disponível no momento.
          </div>
        )}
        {data.products.map((p) => {
          const inCart = cart.find((c) => c.product_id === p.id)?.quantity ?? 0;
          const soldOut = p.available_qty <= 0 && inCart === 0;
          return (
            <Card key={p.id} className="overflow-hidden">
              <CardContent className="p-3 flex gap-3">
                {p.photo_url ? (
                  <img src={p.photo_url} alt={p.name} className="h-20 w-20 rounded-lg object-cover" />
                ) : (
                  <div className="h-20 w-20 rounded-lg bg-secondary grid place-items-center">
                    <ShoppingBag className="h-7 w-7 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  {p.description && <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>}
                  <div className="mt-1 font-bold" style={{ color: accent }}>{formatBRL(p.price)}</div>
                </div>
                <div className="flex flex-col items-center justify-center gap-1">
                  {soldOut ? (
                    <span className="text-xs text-destructive">Esgotado</span>
                  ) : inCart === 0 ? (
                    <Button size="sm" onClick={() => changeQty(p.id, 1)} style={{ background: accent }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(p.id, inCart - 1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="font-bold w-5 text-center">{inCart}</span>
                      <Button size="icon" className="h-7 w-7" style={{ background: accent }} onClick={() => changeQty(p.id, inCart + 1)} disabled={p.available_qty <= 0}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </main>

      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border z-40">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button className="w-full h-12 text-base" style={{ background: accent }}>
                <ShoppingBag className="h-5 w-5 mr-2" />
                Finalizar · {cartCount} item{cartCount > 1 ? "s" : ""} · {formatBRL(cartTotal)}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Seu pedido</SheetTitle>
              </SheetHeader>
              <div className="py-4 space-y-2">
                {cart.map((it) => {
                  const p = productsById.get(it.product_id);
                  if (!p) return null;
                  return (
                    <div key={it.product_id} className="flex justify-between text-sm">
                      <span>{p.name} × {it.quantity}</span>
                      <span className="font-medium">{formatBRL(p.price * it.quantity)}</span>
                    </div>
                  );
                })}
                <div className="border-t pt-2 flex justify-between font-bold">
                  <span>Total</span>
                  <span>{formatBRL(cartTotal)}</span>
                </div>
              </div>
              <div className="space-y-3 pb-4">
                <div>
                  <Label>Nome *</Label>
                  <Input value={customer.name} onChange={(e) => setCustomerState({ ...customer, name: e.target.value })} placeholder="Seu nome" />
                </div>
                <div>
                  <Label>WhatsApp *</Label>
                  <Input value={customer.phone} onChange={(e) => setCustomerState({ ...customer, phone: e.target.value })} placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input type="email" value={customer.email} onChange={(e) => setCustomerState({ ...customer, email: e.target.value })} placeholder="opcional" />
                </div>
              </div>
              <SheetFooter>
                <Button className="w-full h-12" style={{ background: accent }} disabled={creating} onClick={handleCheckout}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pagar"}
                </Button>
              </SheetFooter>
              <p className="text-xs text-muted-foreground text-center pt-2">
                Pagamento via Mercado Pago (em configuração).
              </p>
            </SheetContent>
          </Sheet>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground py-4">
        <Link to="/" className="hover:underline">NightOps Lojinha</Link>
      </p>
    </div>
  );
}
