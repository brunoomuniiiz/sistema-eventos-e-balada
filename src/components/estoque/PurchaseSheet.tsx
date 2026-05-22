import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Plus, Pencil, Trash2, ShoppingCart, Check, X } from "lucide-react";
import { formatBRL } from "@/lib/format";

const NEW = "__new__";

const PAYMENTS = [
  { v: "dinheiro", l: "Dinheiro" },
  { v: "pix", l: "Pix" },
  { v: "debito", l: "Débito" },
  { v: "credito", l: "Crédito" },
  { v: "boleto", l: "Boleto" },
  { v: "transferencia", l: "Transferência" },
] as const;

type ProductOpt = { id: string; name: string; cost_price: number; unit: string };
type CartItem = {
  product_id: string;
  product_name_snapshot: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
};

export function PurchaseSheet({
  open, onOpenChange, ownerId,
}: { open: boolean; onOpenChange: (b: boolean) => void; ownerId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [priceMode, setPriceMode] = useState<"total" | "unit">("total");
  const [priceValue, setPriceValue] = useState<number>(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Review form (despesa)
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [paid, setPaid] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  // Reset on open
  useEffect(() => {
    if (open) {
      setSearch(""); setPickedId(null); setQty(1);
      setPriceMode("total"); setPriceValue(0);
      setCart([]); setEditingIdx(null);
      setReviewOpen(false);
      setSupplierId(""); setNewSupplierName("");
      setCategoryId(""); setNewCategoryName("");
      setPaid(true); setPaymentMethod("pix");
      setExpenseDate(new Date().toISOString().slice(0, 10));
      setDueDate(""); setNotes("");
    }
  }, [open]);

  const { data: products = [] } = useQuery({
    queryKey: ["products-buy", ownerId],
    enabled: !!ownerId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, cost_price, unit, product_type, track_stock")
        .order("name");
      if (error) throw error;
      return (data as Array<ProductOpt & { product_type: string; track_stock: boolean }>)
        .filter((p) => p.product_type === "simple" && p.track_stock);
    },
  });

  const { data: defaultLoc } = useQuery({
    queryKey: ["default-location", ownerId],
    enabled: !!ownerId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_locations")
        .select("id, name, is_default")
        .order("is_default", { ascending: false })
        .order("name")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", ownerId],
    enabled: !!ownerId && reviewOpen,
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["bar-expense-categories", ownerId, "variable"],
    enabled: !!ownerId && reviewOpen,
    queryFn: async () => {
      const { data } = await supabase
        .from("bar_expense_categories")
        .select("id, name")
        .eq("kind", "variable")
        .order("sort_order").order("name");
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return products.slice(0, 20);
    return products.filter((p) => p.name.toLowerCase().includes(s)).slice(0, 20);
  }, [products, search]);

  const picked = products.find((p) => p.id === pickedId);

  const unitCost = priceMode === "unit" ? priceValue : (qty > 0 ? priceValue / qty : 0);
  const totalCost = priceMode === "total" ? priceValue : priceValue * qty;

  const addOrUpdate = () => {
    if (!picked) return toast.error("Selecione um produto");
    if (!qty || qty <= 0) return toast.error("Quantidade inválida");
    if (!priceValue || priceValue <= 0) return toast.error("Informe o valor pago");
    const item: CartItem = {
      product_id: picked.id,
      product_name_snapshot: picked.name,
      quantity: qty,
      unit_cost: Number(unitCost.toFixed(4)),
      total_cost: Number(totalCost.toFixed(2)),
    };
    if (editingIdx !== null) {
      setCart((c) => c.map((x, i) => i === editingIdx ? item : x));
      setEditingIdx(null);
    } else {
      setCart((c) => [...c, item]);
    }
    setPickedId(null); setSearch(""); setQty(1); setPriceValue(0);
  };

  const editLine = (idx: number) => {
    const it = cart[idx];
    setPickedId(it.product_id);
    setSearch(it.product_name_snapshot);
    setQty(it.quantity);
    setPriceMode("total");
    setPriceValue(it.total_cost);
    setEditingIdx(idx);
  };

  const removeLine = (idx: number) => {
    setCart((c) => c.filter((_, i) => i !== idx));
    if (editingIdx === idx) {
      setEditingIdx(null); setPickedId(null); setSearch(""); setQty(1); setPriceValue(0);
    }
  };

  const subtotal = useMemo(
    () => cart.reduce((s, x) => s + x.total_cost, 0),
    [cart],
  );

  const confirmPurchase = async () => {
    if (!user || !ownerId) return;
    if (cart.length === 0) return toast.error("Adicione itens à compra");
    if (!defaultLoc?.id) return toast.error("Crie um local de estoque primeiro");
    setSaving(true);
    try {
      // Cria fornecedor novo se necessário
      let finalSupplierId: string | null = null;
      let finalSupplierName: string | null = null;
      if (supplierId === NEW) {
        const n = newSupplierName.trim();
        if (!n) throw new Error("Informe o nome do fornecedor");
        const { data, error } = await supabase
          .from("suppliers").insert({ user_id: ownerId, name: n })
          .select("id, name").single();
        if (error) throw error;
        finalSupplierId = data.id; finalSupplierName = data.name;
      } else if (supplierId) {
        const s = suppliers.find((x) => x.id === supplierId);
        finalSupplierId = s?.id ?? null;
        finalSupplierName = s?.name ?? null;
      }

      // Cria categoria nova se necessário
      let finalCategoryId: string | null = null;
      let finalCategoryName = "Compra de mercadoria";
      if (categoryId === NEW) {
        const n = newCategoryName.trim();
        if (!n) throw new Error("Informe o nome da categoria");
        const { data, error } = await supabase
          .from("bar_expense_categories")
          .insert({ user_id: ownerId, name: n, kind: "variable" })
          .select("id, name").single();
        if (error) throw error;
        finalCategoryId = data.id; finalCategoryName = data.name;
      } else if (categoryId) {
        const c = categories.find((x) => x.id === categoryId);
        finalCategoryId = c?.id ?? null;
        finalCategoryName = c?.name ?? finalCategoryName;
      }

      const { error } = await supabase.rpc("register_stock_purchase", {
        _supplier_id: finalSupplierId,
        _supplier_name: finalSupplierName,
        _location_id: defaultLoc.id,
        _items: cart as never,
        _expense_category_id: finalCategoryId,
        _expense_category_name: finalCategoryName,
        _payment_method: paymentMethod,
        _paid: paid,
        _expense_date: expenseDate,
        _due_date: paid ? null : (dueDate || null),
        _notes: notes.trim() || null,
      });
      if (error) throw error;

      toast.success("Compra registrada");
      qc.invalidateQueries({ queryKey: ["products-full"] });
      qc.invalidateQueries({ queryKey: ["product_stock"] });
      qc.invalidateQueries({ queryKey: ["bar-expenses"] });
      qc.invalidateQueries({ queryKey: ["stock_purchases"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" /> Entrada de compra
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {/* Add item area */}
            <div className="rounded-lg border p-3 space-y-3 bg-card/40">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                {editingIdx !== null ? "Editar item" : "Adicionar item"}
              </div>

              <div>
                <Label>Produto</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Buscar produto..."
                    value={picked ? picked.name : search}
                    onChange={(e) => { setSearch(e.target.value); setPickedId(null); }}
                  />
                </div>
                {!picked && search && (
                  <div className="mt-1 max-h-48 overflow-y-auto rounded border divide-y">
                    {filtered.length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground text-center">
                        Nenhum produto. Cadastre antes em Produtos.
                      </div>
                    ) : filtered.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setPickedId(p.id); setSearch(""); }}
                        className="w-full text-left p-2 hover:bg-secondary/40 text-sm flex items-center justify-between"
                      >
                        <span>{p.name}</span>
                        <span className="text-xs text-muted-foreground">{formatBRL(Number(p.cost_price))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quantidade</Label>
                  <Input
                    type="number" min={0.01} step="0.01" value={qty}
                    onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Valor pago</Label>
                  <CurrencyInput value={priceValue} onChange={setPriceValue} />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 p-2 rounded border bg-background/60">
                <div className="text-xs">
                  <strong>{priceMode === "total" ? "Valor total" : "Valor por unidade"}</strong>
                  <span className="text-muted-foreground"> · clique para alternar</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={priceMode === "total" ? "font-semibold" : "text-muted-foreground"}>Total</span>
                  <Switch
                    checked={priceMode === "unit"}
                    onCheckedChange={(v) => setPriceMode(v ? "unit" : "total")}
                  />
                  <span className={priceMode === "unit" ? "font-semibold" : "text-muted-foreground"}>Unitário</span>
                </div>
              </div>

              {priceValue > 0 && qty > 0 && (
                <div className="text-xs text-muted-foreground flex justify-between">
                  <span>Unitário: <strong className="text-foreground">{formatBRL(unitCost)}</strong></span>
                  <span>Total: <strong className="text-foreground">{formatBRL(totalCost)}</strong></span>
                </div>
              )}

              <div className="flex gap-2">
                {editingIdx !== null && (
                  <Button variant="ghost" onClick={() => {
                    setEditingIdx(null); setPickedId(null); setSearch(""); setQty(1); setPriceValue(0);
                  }}>
                    <X className="h-4 w-4" /> Cancelar
                  </Button>
                )}
                <Button onClick={addOrUpdate} className="flex-1" disabled={!picked || !qty || !priceValue}>
                  {editingIdx !== null ? <><Check className="h-4 w-4" /> Salvar item</> : <><Plus className="h-4 w-4" /> Adicionar à compra</>}
                </Button>
              </div>
            </div>

            {/* Cart */}
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Itens da compra ({cart.length})
              </div>
              {cart.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded">
                  Nenhum item ainda
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded border bg-card">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{it.product_name_snapshot}</div>
                        <div className="text-xs text-muted-foreground">
                          {it.quantity}× {formatBRL(it.unit_cost)} = <strong className="text-foreground">{formatBRL(it.total_cost)}</strong>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => editLine(idx)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => removeLine(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Subtotal</span>
                    <span className="font-semibold text-lg">{formatBRL(subtotal)}</span>
                  </div>
                </div>
              )}
            </div>

            <Button
              className="w-full" size="lg"
              disabled={cart.length === 0}
              onClick={() => setReviewOpen(true)}
            >
              Revisar e confirmar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar compra · {formatBRL(subtotal)}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Fornecedor</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Sem fornecedor" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  <SelectItem value={NEW}>+ Novo fornecedor…</SelectItem>
                </SelectContent>
              </Select>
              {supplierId === NEW && (
                <Input className="mt-2" placeholder="Nome do fornecedor"
                  value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} />
              )}
            </div>

            <div>
              <Label>Categoria da despesa</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Compra de mercadoria" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  <SelectItem value={NEW}>+ Nova categoria…</SelectItem>
                </SelectContent>
              </Select>
              {categoryId === NEW && (
                <Input className="mt-2" placeholder="Nome da categoria"
                  value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
              )}
            </div>

            <div className="flex items-center justify-between p-3 rounded border">
              <div>
                <div className="font-medium text-sm">Já paguei</div>
                <div className="text-xs text-muted-foreground">Desligue para marcar como a pagar</div>
              </div>
              <Switch checked={paid} onCheckedChange={setPaid} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENTS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data da compra</Label>
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
              </div>
            </div>

            {!paid && (
              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}

            <div>
              <Label>Observação (opcional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Voltar</Button>
            <Button onClick={confirmPurchase} disabled={saving}>
              {saving ? "Salvando…" : "Confirmar compra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
