import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Kind = "fixed" | "variable";

const PAYMENTS = [
  { v: "dinheiro", l: "Dinheiro" },
  { v: "pix", l: "Pix" },
  { v: "debito", l: "Débito" },
  { v: "credito", l: "Crédito" },
  { v: "boleto", l: "Boleto" },
  { v: "transferencia", l: "Transferência" },
] as const;

const NEW = "__new__";

export function ExpenseFormDialog({
  open, onOpenChange, kind,
}: { open: boolean; onOpenChange: (b: boolean) => void; kind: Kind }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [paid, setPaid] = useState(true);
  const [recurrence, setRecurrence] = useState<"once" | "monthly">("once");
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setCategoryId(""); setNewCategoryName(""); setAmount(0); setDescription("");
      setExpenseDate(new Date().toISOString().slice(0, 10)); setDueDate("");
      setPaymentMethod("pix"); setPaid(true); setRecurrence("once");
      setSupplierId(""); setNewSupplierName(""); setNotes("");
    }
  }, [open, kind]);

  const { data: categories = [] } = useQuery({
    queryKey: ["bar-expense-categories", user?.id, kind],
    enabled: !!user && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bar_expense_categories")
        .select("id, name")
        .eq("kind", kind)
        .order("sort_order").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", user?.id],
    enabled: !!user && open && kind === "variable",
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const value = amount;
      if (!value || value <= 0) throw new Error("Informe um valor válido");

      let finalCategoryId: string | null = null;
      let finalCategoryName = "";
      if (categoryId === NEW) {
        const n = newCategoryName.trim();
        if (!n) throw new Error("Informe o nome da nova categoria");
        const { data: c, error } = await supabase
          .from("bar_expense_categories")
          .insert({ user_id: user.id, name: n, kind })
          .select().single();
        if (error) throw error;
        finalCategoryId = c.id; finalCategoryName = c.name;
      } else {
        const c = categories.find((x) => x.id === categoryId);
        if (!c) throw new Error("Selecione uma categoria");
        finalCategoryId = c.id; finalCategoryName = c.name;
      }

      let finalSupplierId: string | null = null;
      let finalSupplierName: string | null = null;
      if (kind === "variable") {
        if (supplierId === NEW) {
          const n = newSupplierName.trim();
          if (!n) throw new Error("Informe o nome do novo fornecedor");
          const { data: s, error } = await supabase
            .from("suppliers").insert({ user_id: user.id, name: n })
            .select().single();
          if (error) throw error;
          finalSupplierId = s.id; finalSupplierName = s.name;
        } else if (supplierId) {
          const s = suppliers.find((x) => x.id === supplierId);
          finalSupplierId = s?.id ?? null;
          finalSupplierName = s?.name ?? null;
        }
      }

      const { error } = await supabase.from("bar_expenses").insert({
        user_id: user.id,
        kind,
        category_id: finalCategoryId,
        category_name: finalCategoryName,
        supplier_id: finalSupplierId,
        supplier_name: finalSupplierName,
        amount: value,
        description: description.trim() || null,
        expense_date: expenseDate,
        due_date: dueDate || null,
        payment_method: paymentMethod || null,
        paid,
        paid_at: paid ? new Date().toISOString() : null,
        recurrence,
        notes: notes.trim() || null,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento salvo");
      qc.invalidateQueries({ queryKey: ["bar-expenses"] });
      qc.invalidateQueries({ queryKey: ["bar-expense-categories"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const title = kind === "fixed" ? "Novo custo fixo" : "Novo custo variável";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  <SelectItem value={NEW}>+ Nova categoria…</SelectItem>
                </SelectContent>
              </Select>
              {categoryId === NEW && (
                <Input className="mt-2" placeholder="Nome da nova categoria"
                  value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
              )}
            </div>

            <div>
              <Label>Valor</Label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>
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
              <Label>Data de competência</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
            {kind === "fixed" && (
              <div>
                <Label>Vencimento (opcional)</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}

            {kind === "variable" && (
              <div className="col-span-2">
                <Label>Fornecedor (opcional)</Label>
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
            )}

            <div className="col-span-2">
              <Label>Descrição (opcional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder={kind === "fixed" ? "Ex: Conta de luz - novembro" : "Ex: Compra de Heineken 600ml"} />
            </div>

            <div className="col-span-2 flex items-center justify-between p-3 rounded-lg border">
              <div>
                <div className="font-medium text-sm">Já foi pago?</div>
                <div className="text-xs text-muted-foreground">Desligue para marcar como a pagar</div>
              </div>
              <Switch checked={paid} onCheckedChange={setPaid} />
            </div>

            {kind === "fixed" && (
              <div className="col-span-2 flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="font-medium text-sm">Recorrente mensal</div>
                  <div className="text-xs text-muted-foreground">Marque para identificar contas mensais</div>
                </div>
                <Switch checked={recurrence === "monthly"}
                  onCheckedChange={(b) => setRecurrence(b ? "monthly" : "once")} />
              </div>
            )}

            <div className="col-span-2">
              <Label>Observações (opcional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar lançamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
