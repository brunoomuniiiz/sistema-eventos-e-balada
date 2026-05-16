import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Minus, Trash2, ShoppingBag, Wallet, Layers, Percent, Lock, Search, EyeOff,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { OpenCashDialog } from "@/components/vendas/OpenCashDialog";
import { WithdrawalDialog } from "@/components/vendas/WithdrawalDialog";
import { SplitPaymentEditor, isSplitValid, dominantMethod, type PaymentLine } from "@/components/vendas/SplitPaymentEditor";
import { useQuery as useQueryRQ } from "@tanstack/react-query";

export const Route = createFileRoute("/_app/pdv")({
  component: PdvView,
});

type PaymentMethod = "dinheiro" | "debito" | "credito" | "pix";

type Product = {
  id: string;
  name: string;
  price: number;
  product_type: "simple" | "combo";
  track_stock: boolean;
  cost_price: number;
  category_id: string | null;
  is_available: boolean;
};
type Category = { id: string; name: string; sort_order: number };

type CartItem = {
  product_id: string;
  product_name: string;
  unit_price: number;
  cost_price: number;
  quantity: number;
};

export function PdvView() {
  const { user } = useAuth();
  const { ownerId, can, canDiscount, maxDiscountPercent, canSellCash, loading } = usePermissions();
  const qc = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string>("none");
  const [discountInput, setDiscountInput] = useState<string>("");
  const [openCash, setOpenCash] = useState(false);
  const [openWithdraw, setOpenWithdraw] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQ, setSearchQ] = useState("");

  const { data: session, refetch: refetchSession } = useQueryRQ({
    queryKey: ["my-cash-session", user?.id],
    enabled: !!user && can("vendas"),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_open_session");
      if (error) throw error;
      return data as null | {
        id: string; opening_amount: number; opened_at: string;
        opening_notes: string | null; withdrawals_total: number; sales_total: number;
        event_id: string | null; event_name: string | null;
      };
    },
  });

  useEffect(() => {
    if (session === null && can("vendas") && !openCash) setOpenCash(true);
  }, [session, can, openCash]);

  // Vincula automaticamente o evento da sessão ao PDV
  useEffect(() => {
    if (session?.event_id) setEventId(session.event_id);
  }, [session?.event_id]);

  // Default location (for sale.location_id) — pega o padrão automaticamente, vendedor não escolhe
  const { data: defaultLocationId } = useQuery({
    queryKey: ["pdv-default-location", ownerId],
    enabled: !!ownerId && can("vendas"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_locations")
        .select("id, is_default")
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });

  useEffect(() => {
    if (defaultLocationId && !locationId) setLocationId(defaultLocationId);
  }, [defaultLocationId, locationId]);

  const { data: categories = [] } = useQuery({
    queryKey: ["pdv-categories", ownerId],
    enabled: !!ownerId && can("vendas"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id, name, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["pdv-products", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, product_type, track_stock, cost_price, category_id, is_available")
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!ownerId && can("vendas"),
  });

  // Estoque agregado em todos os locais (vendedor é cego — não escolhe local)
  const { data: stockMap = {} } = useQuery({
    queryKey: ["pdv-stock-total", ownerId],
    enabled: !!ownerId && can("vendas"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stock")
        .select("product_id, quantity");
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r) => {
        map[r.product_id] = (map[r.product_id] ?? 0) + r.quantity;
      });
      return map;
    },
  });

  // Componentes de todos os combos para calcular estoque virtual
  const { data: comboItems = [] } = useQuery({
    queryKey: ["pdv-combo-items", ownerId],
    enabled: !!ownerId && can("vendas"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("combo_items")
        .select("combo_product_id, component_product_id, quantity");
      if (error) throw error;
      return data as { combo_product_id: string; component_product_id: string; quantity: number }[];
    },
  });

  // stock virtual: combo => min(stock_componente / qty)
  const comboStockMap = useMemo(() => {
    const map: Record<string, number> = {};
    const grouped = new Map<string, { component_product_id: string; quantity: number }[]>();
    comboItems.forEach((ci) => {
      const list = grouped.get(ci.combo_product_id) ?? [];
      list.push({ component_product_id: ci.component_product_id, quantity: Number(ci.quantity) });
      grouped.set(ci.combo_product_id, list);
    });
    grouped.forEach((items, comboId) => {
      let min = Infinity;
      for (const it of items) {
        const stock = stockMap[it.component_product_id] ?? 0;
        const qty = it.quantity > 0 ? it.quantity : 1;
        min = Math.min(min, Math.floor(stock / qty));
      }
      map[comboId] = Number.isFinite(min) ? min : 0;
    });
    return map;
  }, [comboItems, stockMap]);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const totalItems = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);

  const discountPercent = useMemo(() => {
    if (!canDiscount) return 0;
    const v = Number(discountInput.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.min(v, maxDiscountPercent);
  }, [discountInput, canDiscount, maxDiscountPercent]);

  const discountValue = useMemo(() => +(subtotal * discountPercent / 100).toFixed(2), [subtotal, discountPercent]);
  const total = useMemo(() => +(subtotal - discountValue).toFixed(2), [subtotal, discountValue]);

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        return prev.map((i) => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        product_id: p.id,
        product_name: p.name,
        unit_price: Number(p.price),
        cost_price: Number(p.cost_price ?? 0),
        quantity: 1,
      }];
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
    if (!locationId) return toast.error("Selecione um local");
    if (!session) return toast.error("Abra o caixa antes de vender");
    if (payment === "dinheiro" && !canSellCash) return toast.error("Você não tem permissão para vender em dinheiro");

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
          location_id: locationId,
          event_id: eventId === "none" ? null : eventId,
          category: eventId === "none" ? "bar" : "evento",
          discount_percent: discountPercent,
          discount_value: discountValue,
          discount_by: discountPercent > 0 ? user.id : null,
          session_id: session.id,
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
        cost_price_snapshot: i.cost_price,
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) throw itemsErr;

      toast.success(`Venda de ${formatBRL(total)} registrada!`);
      setCart([]);
      setPayment(null);
      setDiscountInput("");
      qc.invalidateQueries({ queryKey: ["pdv-stock"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      refetchSession();
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

      <OpenCashDialog open={openCash} onOpenChange={setOpenCash} onOpened={() => refetchSession()} />
      <WithdrawalDialog open={openWithdraw} onOpenChange={setOpenWithdraw} onDone={() => refetchSession()} />

      {session && (
        <div className="mb-3 flex flex-wrap items-center gap-2 p-3 rounded-xl border bg-card/60">
          <Wallet className="h-4 w-4 text-primary" />
          <div className="text-xs">
            <div className="font-medium">Caixa aberto</div>
            <div className="text-muted-foreground">
              Inicial {formatBRL(Number(session.opening_amount))} · Vendas {formatBRL(Number(session.sales_total))} · Sangrias {formatBRL(Number(session.withdrawals_total))}
            </div>
          </div>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpenWithdraw(true)}>
            Sangria
          </Button>
        </div>
      )}
      {!session && (
        <div className="mb-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-sm flex items-center gap-2">
          <Lock className="h-4 w-4 text-amber-500" />
          <span className="flex-1">Caixa fechado. Abra para começar a vender.</span>
          <Button size="sm" onClick={() => setOpenCash(true)}>Abrir caixa</Button>
        </div>
      )}

      {/* Chips de categorias */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap border transition ${categoryFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
          >
            Todas
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap border transition ${categoryFilter === c.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
            >
              {c.name}
            </button>
          ))}
          <button
            onClick={() => setCategoryFilter("none")}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap border transition ${categoryFilter === "none" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
          >
            Sem categoria
          </button>
        </div>
      )}

      {products.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Nenhum produto cadastrado
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {products
            .filter((p) => {
              if (categoryFilter === "all") return true;
              if (categoryFilter === "none") return !p.category_id;
              return p.category_id === categoryFilter;
            })
            .map((p) => {
            const inCart = cart.find((i) => i.product_id === p.id);
            const isCombo = p.product_type === "combo";
            const stockTotal = isCombo ? (comboStockMap[p.id] ?? 0) : (stockMap[p.id] ?? 0);
            const tracked = isCombo || p.track_stock;
            const outOfStock = tracked && stockTotal <= 0;
            const lowStock = tracked && !outOfStock && stockTotal <= 10;
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
                {isCombo && (
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
                {lowStock && (
                  <div className="text-[11px] mt-0.5 text-amber-500">Últimas {stockTotal}</div>
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
            <details className="group" open>
              <summary className="flex items-center gap-3 p-4 cursor-pointer list-none">
                <div className="h-10 w-10 rounded-xl bg-gradient-primary grid place-items-center">
                  <ShoppingBag className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">{totalItems} {totalItems === 1 ? "item" : "itens"}</div>
                  <div className="font-bold text-lg">{formatBRL(total)}</div>
                  {discountValue > 0 && (
                    <div className="text-[11px] text-emerald-500">-{formatBRL(discountValue)} ({discountPercent}%)</div>
                  )}
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

                {/* Desconto */}
                <div>
                  <Label className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Percent className="h-3 w-3" /> Desconto
                    {!canDiscount && <Lock className="h-3 w-3 ml-1" />}
                  </Label>
                  {canDiscount ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={maxDiscountPercent}
                        step="0.1"
                        placeholder="0"
                        value={discountInput}
                        onChange={(e) => setDiscountInput(e.target.value)}
                        className="h-10"
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">% (máx {maxDiscountPercent}%)</span>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground italic">Sem permissão para aplicar desconto</div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">Pagamento</div>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENTS.map((p) => {
                      const active = payment === p.key;
                      const blocked = p.key === "dinheiro" && !canSellCash;
                      return (
                        <button
                          key={p.key}
                          onClick={() => !blocked && setPayment(p.key)}
                          disabled={blocked}
                          className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card border-border hover:border-primary/50"
                          } ${blocked ? "opacity-40 cursor-not-allowed" : ""}`}
                        >
                          <p.icon className="h-5 w-5" />
                          <span className="font-medium">{p.label}</span>
                          {blocked && <Lock className="h-3 w-3 ml-auto" />}
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
                  disabled={submitting || !payment || !locationId}
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
