import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Minus, Trash2, ShoppingBag, Banknote, CreditCard, Smartphone, Wallet, Layers, Check } from "lucide-react";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_app/pdv")({
  component: PdvPage,
});

type PaymentMethod = "dinheiro" | "debito" | "credito" | "pix";

type Product = {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  product_type: "simple" | "combo";
  track_stock: boolean;
};

type CartItem = {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
};

const PAYMENTS: { key: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { key: "dinheiro", label: "Dinheiro", icon: Banknote },
  { key: "debito", label: "Débito", icon: CreditCard },
  { key: "credito", label: "Crédito", icon: CreditCard },
  { key: "pix", label: "Pix", icon: Smartphone },
];

function PdvPage() {
  const { user } = useAuth();
  const { ownerId, can, loading } = usePermissions();
  const qc = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock_quantity, product_type, track_stock")
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!ownerId && can("vendas"),
  });

  const total = useMemo(() => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const totalItems = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        return prev.map((i) => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product_id: p.id, product_name: p.name, unit_price: Number(p.price), quantity: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev.flatMap((i) => {
        if (i.product_id !== id) return [i];
        const q = i.quantity + delta;
        return q <= 0 ? [] : [{ ...i, quantity: q }];
      }),
    );
  };

  const removeItem = (id: string) => setCart((prev) => prev.filter((i) => i.product_id !== id));

  const finalize = async () => {
    if (!user || !ownerId) return;
    if (cart.length === 0) return toast.error("Adicione pelo menos um produto");
    if (!payment) return toast.error("Selecione a forma de pagamento");

    setSubmitting(true);
    try {
      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          user_id: ownerId,
          employee_id: null,
          employee_name: user.email ?? null,
          payment_method: payment,
          total,
        })
        .select()
        .single();
      if (saleErr) throw saleErr;

      const items = cart.map((i) => ({
        user_id: ownerId,
        sale_id: sale.id,
        product_id: i.product_id,
        product_name: i.product_name,
        unit_price: i.unit_price,
        quantity: i.quantity,
        subtotal: i.unit_price * i.quantity,
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) throw itemsErr;

      toast.success(`Venda de ${formatBRL(total)} registrada!`);
      setCart([]);
      setPayment(null);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar venda");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;
  if (!can("vendas")) {
    return <PageHeader title="PDV" subtitle="Você não tem permissão para acessar esta página" />;
  }

  return (
    <div className="pb-32">
      <PageHeader title="Venda Rápida" subtitle="Toque para adicionar ao carrinho" />

      {products.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Nenhum produto cadastrado no estoque
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.map((p) => {
            const inCart = cart.find((i) => i.product_id === p.id);
            const outOfStock = p.product_type === "simple" && p.track_stock && p.stock_quantity <= 0;
            return (
              <button
                key={p.id}
                onClick={() => !outOfStock && addToCart(p)}
                disabled={outOfStock}
                className={`relative p-4 rounded-2xl border text-left transition-all active:scale-95 ${
                  inCart
                    ? "bg-primary/10 border-primary shadow-[0_0_0_2px_var(--color-primary)]"
                    : "bg-card border-border hover:border-primary/50"
                } ${outOfStock ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {p.product_type === "combo" && (
                  <Badge variant="secondary" className="absolute top-2 right-2 gap-1 text-[10px]">
                    <Layers className="h-3 w-3" /> Combo
                  </Badge>
                )}
                {inCart && (
                  <div className="absolute top-2 left-2 h-6 w-6 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold">
                    {inCart.quantity}
                  </div>
                )}
                <div className="font-semibold leading-tight mt-6 line-clamp-2 min-h-[2.5rem]">{p.name}</div>
                <div className="text-lg font-bold text-gradient mt-1">{formatBRL(Number(p.price))}</div>
                {p.product_type === "simple" && p.track_stock && (
                  <div className={`text-[11px] mt-0.5 ${p.stock_quantity <= 5 ? "text-destructive" : "text-muted-foreground"}`}>
                    {outOfStock ? "Sem estoque" : `${p.stock_quantity} un.`}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Sticky cart bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-16 md:bottom-4 left-0 right-0 z-30 px-3">
          <div className="max-w-3xl mx-auto rounded-2xl glass border border-border shadow-2xl overflow-hidden">
            <details className="group">
              <summary className="flex items-center gap-3 p-4 cursor-pointer list-none">
                <div className="h-10 w-10 rounded-xl bg-gradient-primary grid place-items-center">
                  <ShoppingBag className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">{totalItems} {totalItems === 1 ? "item" : "itens"}</div>
                  <div className="font-bold text-lg">{formatBRL(total)}</div>
                </div>
                <span className="text-xs text-muted-foreground group-open:hidden">Ver</span>
                <span className="text-xs text-muted-foreground hidden group-open:inline">Fechar</span>
              </summary>

              <div className="px-4 pb-4 space-y-3 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  {cart.map((i) => (
                    <div key={i.product_id} className="flex items-center gap-2 p-2 rounded-lg bg-card border">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{i.product_name}</div>
                        <div className="text-xs text-muted-foreground">{formatBRL(i.unit_price * i.quantity)}</div>
                      </div>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(i.product_id, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center font-semibold">{i.quantity}</span>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(i.product_id, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeItem(i.product_id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">Pagamento</div>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENTS.map((p) => {
                      const active = payment === p.key;
                      return (
                        <button
                          key={p.key}
                          onClick={() => setPayment(p.key)}
                          className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card border-border hover:border-primary/50"
                          }`}
                        >
                          <p.icon className="h-5 w-5" />
                          <span className="font-medium">{p.label}</span>
                          {active && <Check className="h-4 w-4 ml-auto" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Button
                  size="lg"
                  className="w-full h-14 text-base font-bold"
                  onClick={finalize}
                  disabled={submitting || !payment}
                >
                  <Wallet className="h-5 w-5" />
                  {submitting ? "Registrando..." : `Finalizar ${formatBRL(total)}`}
                </Button>
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
