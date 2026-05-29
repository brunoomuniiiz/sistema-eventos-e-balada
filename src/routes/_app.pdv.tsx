import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";

import { toast } from "sonner";
import {
  Plus, Minus, Trash2, ShoppingBag, Wallet, Layers, Percent, Lock, Search, Image as ImageIcon, Printer, Settings2
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AuthorizationDialog } from "@/components/AuthorizationDialog";
import { useOperationPin } from "@/hooks/useOperationPin";
import { formatBRL } from "@/lib/format";
import { OpenCashDialog } from "@/components/vendas/OpenCashDialog";
import { WithdrawalDialog } from "@/components/vendas/WithdrawalDialog";
import { SplitPaymentEditor, isSplitValid, dominantMethod, type PaymentLine } from "@/components/vendas/SplitPaymentEditor";
import { PixQrDialog } from "@/components/vendas/PixQrDialog";
import { PromoterCreditPicker } from "@/components/vendas/PromoterCreditPicker";
import { ConsumacaoTargetDialog, type ConsumacaoTarget } from "@/components/vendas/ConsumacaoTargetDialog";
import { useQuery as useQueryRQ } from "@tanstack/react-query";
import { ProductCard } from "@/components/sales/ProductCard";
import { CategoryChipBar } from "@/components/sales/CategoryChipBar";
import { 
  getPrintConfig, 
  savePrintConfig, 
  printWithRawBT, 
  generateThermalTicket, 
  concatUint8Arrays,
  type PrintConfig 
} from "@/lib/thermal-print";
import { shouldPrintItem } from "@/lib/print-rules";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_app/pdv")({
  component: PdvView,
});

// PaymentMethod vem do SplitPaymentEditor

type Product = {
  id: string;
  name: string;
  price: number;
  product_type: "simple" | "combo";
  track_stock: boolean;
  cost_price: number;
  category_id: string | null;
  is_available: boolean;
  photo_url: string | null;
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
  const { ownerId, can, canDiscount, maxDiscountPercent, canSellCash, acceptedMethods, canPromoterCredit, canConsumacao, realIsOwner, loading, displayName } = usePermissions();
  const qc = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string>("none");
  const [discountInput, setDiscountInput] = useState<string>("");
  const [discountMode, setDiscountMode] = useState<"percent" | "value">("percent");
  const [discountValueInput, setDiscountValueInput] = useState<number>(0);
  const [openCash, setOpenCash] = useState(false);
  const [openWithdraw, setOpenWithdraw] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQ, setSearchQ] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [pixOpen, setPixOpen] = useState(false);
  const [promoterPickerOpen, setPromoterPickerOpen] = useState(false);
  const [promoterPickerMax, setPromoterPickerMax] = useState(0);
  const [consumacaoOpen, setConsumacaoOpen] = useState(false);
  const [printConfig, setPrintConfig] = useState<PrintConfig>(getPrintConfig());
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(true);
  const { token: pinToken, setUnlocked: setPinUnlocked } = useOperationPin();
  const [pinDialog, setPinDialog] = useState<{ open: boolean; pendingProduct: Product | null }>({
    open: false,
    pendingProduct: null,
  });


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

  const { data: products = [], error: productsError, isLoading: productsLoading } = useQuery({
    queryKey: ["pdv-products", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, product_type, track_stock, cost_price, category_id, is_available, photo_url, ativo_geral, disponivel_venda, is_sellable")
        .eq("ativo_geral", true)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!ownerId && can("vendas"),
  });


  // Estoque agregado em todos os locais (vendedor é cego — não escolhe local)
  const { data: stockData = { map: {}, hasRows: new Set<string>() } } = useQuery({
    queryKey: ["pdv-stock-total", ownerId],
    enabled: !!ownerId && can("vendas"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stock")
        .select("product_id, quantity");
      if (error) throw error;
      const map: Record<string, number> = {};
      const hasRows = new Set<string>();
      (data ?? []).forEach((r) => {
        map[r.product_id] = (map[r.product_id] ?? 0) + r.quantity;
        hasRows.add(r.product_id);
      });
      return { map, hasRows };
    },
  });
  const stockMap = stockData.map;
  const productsWithStockRows = stockData.hasRows;

  // Componentes de todos os combos para calcular estoque virtual
  // Usa RPC para não exigir permissão de estoque do vendedor
  const { data: comboItems = [] } = useQuery({
    queryKey: ["pdv-combo-items", ownerId],
    enabled: !!ownerId && can("vendas"),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_combo_items_for_sales");
      if (error) throw error;
      return (data ?? []) as { combo_product_id: string; component_product_id: string; quantity: number }[];
    },
  });

  // mapa de track_stock por produto (para checar componentes do combo)
  const productTrackMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    products.forEach((p) => { map[p.id] = !!p.track_stock; });
    return map;
  }, [products]);

  // stock virtual: combo => min(stock_componente / qty), considerando apenas
  // componentes efetivamente rastreados (track_stock=true E com linhas em product_stock).
  // Combos cujos componentes não têm rastreio efetivo ficam ilimitados.
  const comboStockMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    const grouped = new Map<string, { component_product_id: string; quantity: number }[]>();
    comboItems.forEach((ci) => {
      const list = grouped.get(ci.combo_product_id) ?? [];
      list.push({ component_product_id: ci.component_product_id, quantity: Number(ci.quantity) });
      grouped.set(ci.combo_product_id, list);
    });
    grouped.forEach((items, comboId) => {
      let min = Infinity;
      let anyTracked = false;
      for (const it of items) {
        const tracked = productTrackMap[it.component_product_id] && productsWithStockRows.has(it.component_product_id);
        if (!tracked) continue;
        anyTracked = true;
        const stock = stockMap[it.component_product_id] ?? 0;
        const qty = it.quantity > 0 ? it.quantity : 1;
        min = Math.min(min, Math.floor(stock / qty));
      }
      map[comboId] = anyTracked ? (Number.isFinite(min) ? min : 0) : null;
    });
    return map;
  }, [comboItems, stockMap, productTrackMap, productsWithStockRows]);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const totalItems = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);

  const discountPercent = useMemo(() => {
    if (!canDiscount) return 0;
    if (discountMode === "percent") {
      const v = Number(discountInput.replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) return 0;
      return Math.min(v, maxDiscountPercent);
    }
    if (subtotal <= 0 || discountValueInput <= 0) return 0;
    const pct = (discountValueInput / subtotal) * 100;
    return Math.min(pct, maxDiscountPercent);
  }, [discountInput, discountValueInput, discountMode, subtotal, canDiscount, maxDiscountPercent]);

  const discountValue = useMemo(() => +(subtotal * discountPercent / 100).toFixed(2), [subtotal, discountPercent]);
  const total = useMemo(() => +(subtotal - discountValue).toFixed(2), [subtotal, discountValue]);

  const addToCart = (p: Product) => {
    // Se for produto de teste, exige PIN se ainda não estiver desbloqueado nesta sessão
    if (p.name.toUpperCase().includes("TESTE") && !pinToken) {
      setPinDialog({ open: true, pendingProduct: p });
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        return prev.map((i) => (i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_name: p.name,
          unit_price: Number(p.price),
          cost_price: Number(p.cost_price ?? 0),
          quantity: 1,
        },
      ];
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

  // Filtragem de produtos por estoque global - Agora mostra todos, mas marca como esgotado
  const filteredProducts = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    const cat = categoryFilter;

    return products.filter((p) => {
      if (cat !== "all" && p.category_id !== cat) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [products, searchQ, categoryFilter]);

  const recordSale = async (chaveInfo?: { notes: string; authorizedByName: string }) => {
    if (!user || !ownerId) return;
    if (!locationId || !session) return;
    setSubmitting(true);
    try {
      // Se PIX foi confirmado via chave (PIN do dono), troca método para "pix_chave"
      const effectivePayments = chaveInfo
        ? payments.map((p) => p.method === "pix" ? { ...p, method: "pix_chave" as unknown as typeof p.method } : p)
        : payments;
      const dominant = dominantMethod(effectivePayments as typeof payments);
      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          user_id: ownerId,
          employee_id: null,
          employee_name: user.email ?? null,
          payment_method: dominant,
          total,
          location_id: locationId,
          event_id: eventId === "none" ? null : eventId,
          category: eventId === "none" ? "bar" : "evento",
          discount_percent: discountPercent,
          discount_value: discountValue,
          discount_by: discountPercent > 0 ? user.id : null,
          session_id: session.id,
          notes: chaveInfo ? `PIX chave (${chaveInfo.authorizedByName})${chaveInfo.notes ? ` — ${chaveInfo.notes}` : ""}` : null,
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

      let remaining = total;
      const payRows: { user_id: string; sale_id: string; method: string; amount: number; promoter_id?: string; terminal_id?: string | null }[] = [];
      const ordered = [...effectivePayments].sort((a, b) =>
        a.method === "dinheiro" ? 1 : b.method === "dinheiro" ? -1 : 0
      );
      for (const p of ordered) {
        const amt = p.method === "dinheiro" ? Math.min(p.amount, Math.max(0, remaining)) : p.amount;
        if (amt > 0) {
          payRows.push({
            user_id: ownerId,
            sale_id: sale.id,
            method: p.method,
            amount: +amt.toFixed(2),
            ...(p.promoter_id ? { promoter_id: p.promoter_id } : {}),
            ...(p.terminal_id ? { terminal_id: p.terminal_id } : {}),
          });
          remaining = +(remaining - amt).toFixed(2);
        }
      }
      if (payRows.length > 0) {
        const { error: payErr } = await supabase.from("sale_payments").insert(payRows);
        if (payErr) throw payErr;
      }

      // Registra consumo de crédito: abate primeiro do bucket campanha, depois nomes
      for (const p of payments) {
        if (p.method === "promoter_credit" && p.promoter_id && p.amount > 0) {
          let remainingCredit = p.amount;
          if (p.campaign_id) {
            const { data: cb } = await supabase.rpc("promoter_campaign_balance", {
              _promoter_id: p.promoter_id, _campaign_id: p.campaign_id,
            });
            const fromCamp = Math.min(Number(cb ?? 0), remainingCredit);
            if (fromCamp > 0) {
              const { error } = await supabase.rpc("redeem_promoter_credit_v2", {
                _promoter_id: p.promoter_id, _sale_id: sale.id,
                _amount: +fromCamp.toFixed(2), _campaign_id: p.campaign_id,
              });
              if (error) throw error;
              remainingCredit = +(remainingCredit - fromCamp).toFixed(2);
            }
          }
          if (remainingCredit > 0) {
            const { error } = await supabase.rpc("redeem_promoter_credit_v2", {
              _promoter_id: p.promoter_id, _sale_id: sale.id,
              _amount: remainingCredit, _campaign_id: undefined as any,
            });
            if (error) throw error;
          }
        }
      }

      const dailyNo = (sale as { daily_number?: number | null }).daily_number ?? null;
      toast.success(
        `Venda ${dailyNo != null ? "#" + String(dailyNo).padStart(3, "0") : ""} de ${formatBRL(total)} registrada!`,
      );
      // Abre cupom imprimível
      try {
        if (printConfig.method === 'rawbt' && autoPrintEnabled) {
          const { data: bar } = await supabase.from("bar_settings").select("bar_name").maybeSingle();
          
          const tickets: Uint8Array[] = [];
          
          const effectivePayments = chaveInfo
            ? payments.map((p) => p.method === "pix" ? { ...p, method: "pix_chave" as unknown as typeof p.method } : p)
            : payments;
          const dominant = dominantMethod(effectivePayments as typeof payments);

          for (const item of cart) {
            const shouldPrint = await shouldPrintItem(user.id, "sale", null, item.product_id);
            if (!shouldPrint) continue;

            const productDetails = products.find(p => p.id === item.product_id);

            for (let i = 0; i < item.quantity; i++) {
              tickets.push(generateThermalTicket({
                bar_name: (bar as any)?.bar_name ?? null,
                daily_number: dailyNo,
                product_name: item.product_name,
                description: (productDetails as any)?.pickup_description || (productDetails as any)?.description || null,
                waiter: displayName || user.email?.split('@')[0] || 'Vendedor',
                qr_token: (sale as any).pickup_token,
                is_test: item.product_name.includes("TESTE IMPRESSORA"),
                payment_method: dominant,
              }));
            }
          }
          if (tickets.length > 0) {
            printWithRawBT(concatUint8Arrays(tickets));
          }
        } else {
          window.open(`/pdv/cupom/${sale.id}`, "_blank");
        }
      } catch { /* ignore popup block */ }

      setCart([]);
      setPayments([]);
      setDiscountInput("");
      setDiscountValueInput(0);
      qc.invalidateQueries({ queryKey: ["pdv-stock-total"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      refetchSession();
      setCartOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar venda");
    } finally {
      setSubmitting(false);
    }
  };

  const saveConsumacao = async (target: ConsumacaoTarget, recipientName: string | null) => {
    if (!user || !ownerId) return;
    if (!locationId || !session) return toast.error("Abra o caixa antes");
    if (cart.length === 0) return toast.error("Adicione produtos");
    const evId = eventId === "none" ? null : eventId;
    if (!evId) return toast.error("Vincule a sessão a um evento para lançar consumação");
    setSubmitting(true);
    try {
      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          user_id: ownerId,
          employee_name: user.email ?? null,
          payment_method: "dinheiro",
          total: 0,
          location_id: locationId,
          event_id: evId,
          category: "consumacao",
          consumacao_target: target,
          consumacao_recipient_name: recipientName,
          session_id: session.id,
        } as never)
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
        subtotal: 0,
        cost_price_snapshot: i.cost_price,
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) throw itemsErr;
      toast.success(`Consumação registrada (${target})`);
      setCart([]);
      setPayments([]);
      qc.invalidateQueries({ queryKey: ["pdv-stock-total"] });
      qc.invalidateQueries({ queryKey: ["event-consumacao", evId] });
      setCartOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao lançar consumação");
    } finally {
      setSubmitting(false);
    }
  };

  const finalize = async () => {
    if (!user || !ownerId) return;
    if (cart.length === 0) return toast.error("Adicione pelo menos um produto");
    if (payments.length === 0) return toast.error("Adicione formas de pagamento");
    if (!isSplitValid(total, payments)) return toast.error("Pagamento não confere com o total");
    if (!locationId) return toast.error("Selecione um local");
    if (!session) return toast.error("Abra o caixa antes de vender");
    const hasCash = payments.some((p) => p.method === "dinheiro");
    if (hasCash && !canSellCash) return toast.error("Você não tem permissão para vender em dinheiro");

    // Se o pagamento for 100% PIX, dispara cobrança Mercado Pago e só registra a venda após aprovação
    const onlyPix = payments.length > 0 && payments.every((p) => p.method === "pix");
    if (onlyPix) {
      setPixOpen(true);
      return;
    }

    await recordSale();
  };

  if (loading) return null;
  if (!can("vendas")) {
    return <PageHeader title="PDV" subtitle="Você não tem permissão para acessar esta página" />;
  }

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden pb-32">
      <PageHeader title="Venda Rápida" subtitle="Toque para adicionar ao carrinho" />

      <OpenCashDialog open={openCash} onOpenChange={setOpenCash} onOpened={() => refetchSession()} />
      <WithdrawalDialog open={openWithdraw} onOpenChange={setOpenWithdraw} onDone={() => refetchSession()} />
      <PixQrDialog
        open={pixOpen}
        onOpenChange={setPixOpen}
        amount={total}
        description={`Venda PDV · ${cart.length} ${cart.length === 1 ? "item" : "itens"}`}
        origin="pdv"
        sector="bar"
        onApproved={async () => { await recordSale(); }}
        onChaveApproved={async (info) => { await recordSale(info); }}
      />

      <AuthorizationDialog
        open={pinDialog.open}
        onOpenChange={(open) => setPinDialog((prev) => ({ ...prev, open }))}
        scope="operation"
        title="Produto de Teste"
        description="Este é um produto restrito. Digite o PIN para usá-lo."
        onApproved={(token, name) => {
          setPinUnlocked(token, name);
          if (pinDialog.pendingProduct) {
            addToCart(pinDialog.pendingProduct);
          }
          setPinDialog({ open: false, pendingProduct: null });
        }}
      />

      {session && (
        <div className="mb-3 flex flex-wrap items-center gap-2 p-2 sm:p-3 rounded-xl border bg-card/60">
          <Wallet className="h-4 w-4 text-primary" />
          <div className="text-xs min-w-0 flex-1">
            <div className="font-medium">Caixa aberto</div>
            <div className="text-muted-foreground truncate">
              Inicial {formatBRL(Number(session.opening_amount))} · Vendas {formatBRL(Number(session.sales_total))} · Sangrias {formatBRL(Number(session.withdrawals_total))}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpenWithdraw(true)}>
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

      {/* Content */}
      {acceptedMethods.length === 0 && !realIsOwner ? (
        <Card className="m-4">
          <CardContent className="py-20 text-center space-y-4">
            <Lock className="h-12 w-12 mx-auto text-amber-500 opacity-50" />
            <div className="space-y-1">
              <h3 className="text-lg font-bold">Sem permissão de recebimento</h3>
              <p className="text-sm text-muted-foreground">Você não possui formas de pagamento autorizadas para realizar vendas.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Configurações de Impressão (Flutuante no Mobile) */}
          <div className="fixed bottom-24 right-4 z-50 md:static md:mb-4">
            <Dialog>
              <DialogTrigger asChild>
                <Button size="icon" variant="secondary" className="h-12 w-12 rounded-full shadow-lg border-2 border-primary/20 bg-background/80 backdrop-blur-sm">
                  <Printer className="h-6 w-6" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[350px] rounded-xl">
                <DialogHeader>
                  <DialogTitle>Configurações de Impressora</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pdv-auto-print">Auto-Imprimir Vendas</Label>
                    <Switch 
                      id="pdv-auto-print" 
                      checked={autoPrintEnabled} 
                      onCheckedChange={setAutoPrintEnabled} 
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Método de Impressão</Label>
                    <Select 
                      value={printConfig.method} 
                      onValueChange={(val: 'system' | 'rawbt') => {
                        const next = { ...printConfig, method: val };
                        setPrintConfig(next);
                        savePrintConfig(next);
                        toast.success("Configuração salva");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o método" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">Sistema (PDF/Navegador)</SelectItem>
                        <SelectItem value="rawbt">RawBT (Android Térmica)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Largura do Papel</Label>
                    <Select 
                      value={printConfig.paperWidth} 
                      onValueChange={(val: '58mm' | '80mm') => {
                        const next = { ...printConfig, paperWidth: val };
                        setPrintConfig(next);
                        savePrintConfig(next);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a largura" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="58mm">58mm (Mini Impressora)</SelectItem>
                        <SelectItem value="80mm">80mm (Mesa/POS)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Chips de categorias */}
          <div className="mb-3 w-full max-w-full min-w-0 overflow-x-hidden">
            <CategoryChipBar
              items={[
                { id: "all", label: "Todas" },
                ...categories.map((c) => ({ id: c.id, label: c.name })),
                { id: "none", label: "Sem categoria" },
              ]}
              activeId={categoryFilter}
              onChange={setCategoryFilter}
            />
          </div>

          {/* Busca por produto */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
        </>
      )}

      {acceptedMethods.length > 0 || realIsOwner ? (
        <>
          {productsError ? (
            <Card className="p-8 text-center text-destructive">
              <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <div className="font-semibold mb-1">Erro ao carregar produtos</div>
              <div className="text-xs opacity-80">{productsError.message}</div>
            </Card>
          ) : productsLoading ? (
            <Card className="p-8 text-center text-muted-foreground">
              Carregando produtos…
            </Card>
          ) : products.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-50" />
              Nenhum produto cadastrado
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-24">
            {filteredProducts
              .map((p) => {
                const inCart = cart.find((i) => i.product_id === p.id);
                const isCombo = p.product_type === "combo";
                const comboStock = isCombo ? comboStockMap[p.id] : undefined;
                const tracked = isCombo
                  ? (comboStock !== null && comboStock !== undefined)
                  : (p.track_stock && productsWithStockRows.has(p.id));
                const stockTotal = isCombo ? (comboStock ?? 0) : (stockMap[p.id] ?? 0);
                const outOfStock = tracked && stockTotal <= 0;
                const stockStatus: "ok" | "low" | "last" | "out" = outOfStock
                  ? "out"
                  : tracked && stockTotal === 1
                  ? "last"
                  : tracked && stockTotal <= 10
                  ? "low"
                  : "ok";
                const stockText = outOfStock
                  ? "Esgotado"
                  : tracked && stockTotal === 1
                  ? "Última unidade"
                  : tracked && stockTotal <= 10
                  ? `Últimas ${stockTotal}`
                  : null;
                return (
                  <ProductCard
                    key={p.id}
                    product={{ id: p.id, name: p.name, price: Number(p.price), photo_url: p.photo_url }}
                    inCartQty={inCart?.quantity ?? 0}
                    stockStatus={stockStatus}
                    stockText={stockText}
                    badge={
                      <div className="flex gap-1">
                        {isCombo && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-secondary text-muted-foreground shrink-0 flex items-center gap-0.5">
                            <Layers className="h-2.5 w-2.5" /> Combo
                          </span>
                        )}
                        {p.name.toUpperCase().includes("TESTE") && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 shrink-0 flex items-center gap-0.5 font-bold border border-amber-500/20">
                            <Lock className="h-2.5 w-2.5" /> TESTE
                          </span>
                        )}
                      </div>
                    }
                    onAdd={() => addToCart(p)}
                    onInc={() => addToCart(p)}
                    onDec={() => updateQty(p.id, -1)}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : null}



      {/* FAB do carrinho */}
      {cart.length > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-20 md:bottom-6 right-4 z-30 flex items-center gap-3 pl-4 pr-5 py-3 rounded-2xl bg-gradient-primary text-primary-foreground shadow-2xl glow-primary active:scale-95 transition"
        >
          <div className="relative">
            <ShoppingBag className="h-5 w-5" />
            <span className="absolute -top-2 -right-2 h-5 min-w-[20px] px-1 rounded-full bg-background text-foreground text-[10px] font-bold grid place-items-center">
              {totalItems}
            </span>
          </div>
          <span className="font-bold text-sm">{formatBRL(total)}</span>
        </button>
      )}

      {/* Drawer/Sheet do checkout */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md p-0 flex flex-col gap-0"
        >
          <SheetHeader className="px-4 sm:px-6 py-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              Carrinho
              <Badge variant="secondary" className="ml-auto mr-6">
                {totalItems} {totalItems === 1 ? "item" : "itens"}
              </Badge>
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
            {cart.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-12">
                Nenhum item no carrinho
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((i) => (
                  <div key={i.product_id} className="flex items-center gap-2 p-2 rounded-lg bg-card border">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{i.product_name}</div>
                      <div className="text-xs text-muted-foreground">{formatBRL(i.unit_price * i.quantity)}</div>
                    </div>
                    <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => updateQty(i.product_id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center font-semibold">{i.quantity}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => updateQty(i.product_id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => removeItem(i.product_id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Desconto */}
            <div>
              <Label className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Percent className="h-3 w-3" /> Desconto
                {!canDiscount && <Lock className="h-3 w-3 ml-1" />}
              </Label>
              {canDiscount ? (
                <div className="space-y-2">
                  <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
                    <button
                      type="button"
                      onClick={() => setDiscountMode("percent")}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition ${discountMode === "percent" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountMode("value")}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition ${discountMode === "value" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                    >
                      R$
                    </button>
                  </div>
                  {discountMode === "percent" ? (
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
                    <div className="space-y-1">
                      <CurrencyInput
                        value={discountValueInput}
                        onChange={setDiscountValueInput}
                        className="h-10"
                      />
                      {subtotal > 0 && discountValueInput > 0 && (discountValueInput / subtotal) * 100 > maxDiscountPercent && (
                        <p className="text-xs text-amber-600">
                          Limitado a {maxDiscountPercent}% ({formatBRL(subtotal * maxDiscountPercent / 100)})
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic">Sem permissão para aplicar desconto</div>
              )}
            </div>

            <SplitPaymentEditor
              total={total}
              payments={payments}
              onChange={setPayments}
              canSellCash={canSellCash}
              acceptedMethods={acceptedMethods}
              canPromoterCredit={canPromoterCredit}
              onPickPromoterCredit={(max) => {
                setPromoterPickerMax(max);
                setPromoterPickerOpen(true);
              }}
            />

            <PromoterCreditPicker
              open={promoterPickerOpen}
              onOpenChange={setPromoterPickerOpen}
              maxAmount={promoterPickerMax}
              cart={cart.map((i) => ({ product_id: i.product_id, unit_price: i.unit_price, quantity: i.quantity }))}
              eventId={eventId === "none" ? null : eventId}
              onPick={(promoter_id, promoter_name, amount, campaign_id) => {
                setPayments([...payments, { method: "promoter_credit", amount, promoter_id, promoter_name, campaign_id }]);
              }}
            />
          </div>

          <div className="border-t p-4 sm:p-6 space-y-3 bg-card/50">
            {discountValue > 0 && (
              <div className="flex items-center justify-between text-xs text-emerald-500">
                <span>Desconto ({discountPercent}%)</span>
                <span>-{formatBRL(discountValue)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold text-gradient">{formatBRL(total)}</span>
            </div>
            <Button
              size="lg"
              className="w-full h-14 text-base font-bold"
              onClick={async () => {
                await finalize();
                if (cart.length === 0) setCartOpen(false);
              }}
              disabled={submitting || !locationId || cart.length === 0 || !isSplitValid(total, payments)}
            >
              <Wallet className="h-5 w-5" />
              {submitting ? "Registrando..." : `Finalizar ${formatBRL(total)}`}
            </Button>
            {canConsumacao && eventId !== "none" && cart.length > 0 && (
              <Button
                size="lg"
                variant="outline"
                className="w-full h-12 text-sm font-semibold"
                onClick={() => setConsumacaoOpen(true)}
                disabled={submitting}
              >
                Lançar como Consumação (sem cobrar)
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <ConsumacaoTargetDialog
        open={consumacaoOpen}
        onOpenChange={setConsumacaoOpen}
        onPick={(target, recipientName) => { void saveConsumacao(target, recipientName); }}
      />
    </div>
  );
}
