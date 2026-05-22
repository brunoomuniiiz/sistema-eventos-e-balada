import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, Search, Trash2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string | null;
}

interface CartItem {
  product_id: string;
  name: string;
  unit_price: number;
  cost_price: number;
  quantity: number;
}

export function SupplierConsumptionSheet({ open, onOpenChange, eventId }: Props) {
  const { user } = useAuth();
  const { ownerId } = usePermissions();
  const qc = useQueryClient();

  const [expenseId, setExpenseId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [note, setNote] = useState("");

  const { data: openExpenses = [] } = useQuery({
    queryKey: ["open-expenses-for-offset", ownerId],
    enabled: !!ownerId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bar_expenses")
        .select("id, category_name, supplier_name, amount, installment_index, installment_total, due_date, description")
        .eq("user_id", ownerId!)
        .eq("paid", false)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-for-supplier", ownerId],
    enabled: !!ownerId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, cost_price")
        .eq("user_id", ownerId!)
        .eq("ativo_geral", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 30);
  }, [products, search]);

  const total = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);

  const addProduct = (p: typeof products[number]) => {
    setCart((c) => {
      const ex = c.find((x) => x.product_id === p.id);
      if (ex) return c.map((x) => (x.product_id === p.id ? { ...x, quantity: x.quantity + 1 } : x));
      return [...c, { product_id: p.id, name: p.name, unit_price: Number(p.price), cost_price: Number(p.cost_price ?? 0), quantity: 1 }];
    });
  };

  const setQty = (id: string, delta: number) => {
    setCart((c) =>
      c
        .map((x) => (x.product_id === id ? { ...x, quantity: x.quantity + delta } : x))
        .filter((x) => x.quantity > 0)
    );
  };

  const remove = (id: string) => setCart((c) => c.filter((x) => x.product_id !== id));

  const selectedExpense = openExpenses.find((e) => e.id === expenseId);

  const reset = () => {
    setExpenseId("");
    setSearch("");
    setCart([]);
    setNote("");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!user || !ownerId) throw new Error("Sem usuário");
      if (!expenseId) throw new Error("Escolha a conta a abater");
      if (cart.length === 0) throw new Error("Adicione produtos");
      if (total <= 0) throw new Error("Total inválido");

      const supplierLabel = selectedExpense?.supplier_name || selectedExpense?.category_name || "fornecedor";

      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          user_id: ownerId,
          employee_name: user.email ?? null,
          payment_method: "dinheiro",
          total,
          category: "bar",
          event_id: eventId,
          notes: `Abate fornecedor: ${supplierLabel}${note ? " — " + note : ""}`,
        } as never)
        .select("id")
        .single();
      if (saleErr) throw saleErr;

      const items = cart.map((i) => ({
        user_id: ownerId,
        sale_id: sale.id,
        product_id: i.product_id,
        product_name: i.name,
        unit_price: i.unit_price,
        quantity: i.quantity,
        subtotal: i.unit_price * i.quantity,
        cost_price_snapshot: i.cost_price,
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(items as never);
      if (itemsErr) throw itemsErr;

      const { error: offErr } = await supabase.from("expense_offsets").insert({
        user_id: ownerId,
        expense_id: expenseId,
        amount: total,
        source_type: "supplier_consumption",
        source_id: sale.id,
        description: `Consumo ${supplierLabel} — ${format(new Date(), "dd/MM HH:mm")}${note ? " · " + note : ""}`,
        created_by: user.id,
      });
      if (offErr) throw offErr;
    },
    onSuccess: () => {
      toast.success(`Consumo de ${formatBRL(total)} abatido da parcela`);
      qc.invalidateQueries({ queryKey: ["bar-expenses"] });
      qc.invalidateQueries({ queryKey: ["open-expenses-for-offset"] });
      qc.invalidateQueries({ queryKey: ["event-costs-recent", eventId] });
      qc.invalidateQueries({ queryKey: ["financeiro-real"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-3 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" /> Consumo de fornecedor
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Abater de qual conta?</label>
          <Select value={expenseId} onValueChange={setExpenseId}>
            <SelectTrigger><SelectValue placeholder="Escolha a parcela em aberto" /></SelectTrigger>
            <SelectContent>
              {openExpenses.length === 0 && <div className="p-2 text-xs text-muted-foreground">Nenhuma conta em aberto</div>}
              {openExpenses.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {(e.supplier_name || e.category_name)}
                  {e.installment_index && e.installment_total ? ` ${e.installment_index}/${e.installment_total}` : ""}
                  {" — "}{formatBRL(Number(e.amount))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Buscar produto</label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome do produto" />
          </div>
          <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="w-full flex items-center justify-between gap-2 p-2 text-sm hover:bg-muted text-left"
              >
                <span className="truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatBRL(Number(p.price))}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="p-3 text-xs text-muted-foreground">Sem resultados</div>}
          </div>
        </div>

        {cart.length > 0 && (
          <div className="space-y-1 border rounded-md p-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Carrinho</div>
            {cart.map((i) => (
              <div key={i.product_id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{i.name}</span>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i.product_id, -1)}><Minus className="h-3 w-3" /></Button>
                <span className="w-6 text-center">{i.quantity}</span>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i.product_id, 1)}><Plus className="h-3 w-3" /></Button>
                <span className="w-20 text-right font-medium">{formatBRL(i.unit_price * i.quantity)}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(i.product_id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t mt-2 text-sm font-semibold">
              <span>Total a abater</span>
              <span>{formatBRL(total)}</span>
            </div>
          </div>
        )}

        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" />

        {selectedExpense && total > 0 && (
          <div className="text-xs text-muted-foreground bg-muted/40 p-2 rounded">
            Parcela original: <b>{formatBRL(Number(selectedExpense.amount))}</b><br />
            Abate: <b>-{formatBRL(total)}</b><br />
            Restante a pagar: <b>{formatBRL(Math.max(0, Number(selectedExpense.amount) - total))}</b>
          </div>
        )}

        <Button onClick={() => save.mutate()} disabled={save.isPending || cart.length === 0 || !expenseId} className="mt-auto">
          Lançar consumo e abater
        </Button>
      </SheetContent>
    </Sheet>
  );
}
