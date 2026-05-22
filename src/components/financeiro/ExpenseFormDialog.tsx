import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { AlertTriangle, Sparkles } from "lucide-react";

type Kind = "fixed" | "variable";

// "a_pagar" não é um método real — é um marcador de "ainda não pago"
const PAYMENTS = [
  { v: "a_pagar", l: "A pagar (ainda não pago)" },
  { v: "dinheiro", l: "Dinheiro" },
  { v: "pix", l: "Pix" },
  { v: "debito", l: "Débito" },
  { v: "credito", l: "Crédito" },
  { v: "boleto", l: "Boleto" },
  { v: "transferencia", l: "Transferência" },
] as const;

const NEW = "__new__";

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthOptions(n = 18) {
  const arr: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = -3; i < n - 3; i++) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    arr.push({
      value: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`,
      label: format(dt, "MMMM 'de' yyyy", { locale: ptBR }),
    });
  }
  return arr;
}

function monthValueToDate(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function addMonthsToYM(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Mode = "once" | "installments";

export function ExpenseFormDialog({
  open, onOpenChange, kind,
}: { open: boolean; onOpenChange: (b: boolean) => void; kind: Kind }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>("once");
  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [referenceMonth, setReferenceMonth] = useState(currentMonthValue);
  const [dueDay, setDueDay] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("a_pagar");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [recurrence, setRecurrence] = useState<"once" | "monthly">("once");
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [notes, setNotes] = useState("");
  // parcelado
  const [installmentTotal, setInstallmentTotal] = useState<number>(12);
  const [isInvestment, setIsInvestment] = useState(false);

  const paid = paymentMethod !== "a_pagar";

  useEffect(() => {
    if (open) {
      setMode("once");
      setCategoryId(""); setNewCategoryName(""); setAmount(0); setDescription("");
      setReferenceMonth(currentMonthValue()); setDueDay("");
      setPaymentMethod("a_pagar");
      setPaidAt(new Date().toISOString().slice(0, 10)); setPaidAmount(0);
      setRecurrence("once");
      setSupplierId(""); setNewSupplierName(""); setNotes("");
      setInstallmentTotal(12); setIsInvestment(false);
    }
  }, [open, kind]);

  useEffect(() => {
    if (paid && paidAmount === 0 && amount > 0) setPaidAmount(amount);
  }, [amount, paid, paidAmount]);

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

  const interest = useMemo(
    () => (paid && paidAmount > amount ? Math.max(0, paidAmount - amount) : 0),
    [paid, paidAmount, amount],
  );

  const resolveCategory = async () => {
    if (!user) throw new Error("Não autenticado");
    if (categoryId === NEW) {
      const n = newCategoryName.trim();
      if (!n) throw new Error("Informe o nome da nova categoria");
      const { data: c, error } = await supabase
        .from("bar_expense_categories")
        .insert({ user_id: user.id, name: n, kind })
        .select().single();
      if (error) throw error;
      return { id: c.id as string, name: c.name as string };
    }
    const c = categories.find((x) => x.id === categoryId);
    if (!c) throw new Error("Selecione uma categoria");
    return { id: c.id as string, name: c.name as string };
  };

  const resolveSupplier = async () => {
    if (!user || kind !== "variable") return { id: null as string | null, name: null as string | null };
    if (supplierId === NEW) {
      const n = newSupplierName.trim();
      if (!n) throw new Error("Informe o nome do novo fornecedor");
      const { data: s, error } = await supabase
        .from("suppliers").insert({ user_id: user.id, name: n })
        .select().single();
      if (error) throw error;
      return { id: s.id as string, name: s.name as string };
    }
    if (supplierId) {
      const s = suppliers.find((x) => x.id === supplierId);
      return { id: s?.id ?? null, name: s?.name ?? null };
    }
    return { id: null, name: null };
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const value = amount;
      if (!value || value <= 0) throw new Error("Informe um valor original válido");

      const cat = await resolveCategory();
      const sup = await resolveSupplier();

      if (mode === "installments") {
        if (!installmentTotal || installmentTotal < 2) throw new Error("Mínimo 2 parcelas");
        if (installmentTotal > 60) throw new Error("Máximo 60 parcelas");

        const groupId = crypto.randomUUID();
        const baseDesc = description.trim();
        const rows = Array.from({ length: installmentTotal }).map((_, i) => {
          const ymIns = addMonthsToYM(referenceMonth, i);
          return {
            user_id: user.id,
            kind,
            category_id: cat.id,
            category_name: cat.name,
            supplier_id: sup.id,
            supplier_name: sup.name,
            amount: value,
            description: (baseDesc ? `${baseDesc} · ` : "") + `${i + 1}/${installmentTotal}`,
            expense_date: monthValueToDate(ymIns),
            reference_month: monthValueToDate(ymIns),
            due_date: dueDay ? `${ymIns}-${dueDay.padStart(2, "0")}` : null,
            payment_method: "a_pagar",
            paid: false,
            paid_at: null,
            paid_amount: null,
            interest_amount: 0,
            recurrence: "installment",
            installment_total: installmentTotal,
            installment_index: i + 1,
            installment_group_id: groupId,
            is_investment: isInvestment,
            notes: notes.trim() || null,
            created_by: user.id,
          };
        });
        const { error } = await supabase.from("bar_expenses").insert(rows);
        if (error) throw error;
        return;
      }

      // Modo único
      const refMonthDate = monthValueToDate(referenceMonth);
      const finalPaidAmount = paid ? (paidAmount > 0 ? paidAmount : value) : null;
      const finalInterest = paid && finalPaidAmount && finalPaidAmount > value
        ? finalPaidAmount - value
        : 0;

      const { error } = await supabase.from("bar_expenses").insert({
        user_id: user.id,
        kind,
        category_id: cat.id,
        category_name: cat.name,
        supplier_id: sup.id,
        supplier_name: sup.name,
        amount: value,
        description: description.trim() || null,
        expense_date: refMonthDate,
        reference_month: refMonthDate,
        due_date: dueDay ? `${referenceMonth}-${dueDay.padStart(2, "0")}` : null,
        payment_method: paid ? paymentMethod : "a_pagar",
        paid,
        paid_at: paid ? new Date(paidAt + "T12:00:00").toISOString() : null,
        paid_amount: finalPaidAmount,
        interest_amount: finalInterest,
        recurrence,
        is_investment: isInvestment,
        notes: notes.trim() || null,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(mode === "installments" ? `${installmentTotal} parcelas criadas` : "Lançamento salvo");
      qc.invalidateQueries({ queryKey: ["bar-expenses"] });
      qc.invalidateQueries({ queryKey: ["bar-expenses-month-summary"] });
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

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="once">Lançamento único</TabsTrigger>
            <TabsTrigger value="installments">Parcelado</TabsTrigger>
          </TabsList>

          {/* ============ COMUM ============ */}
          <div className="space-y-3 mt-3">
            <div>
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
              <Label>{mode === "installments" ? "Valor da parcela" : "Valor original"}</Label>
              <CurrencyInput value={amount} onChange={setAmount} />
              <p className="text-[10px] text-muted-foreground mt-1">
                Sem juros/multa — afeta o lucro do mês de competência
              </p>
            </div>

            <div>
              <Label>{mode === "installments" ? "1ª parcela em" : "Mês de competência"}</Label>
              <Select value={referenceMonth} onValueChange={setReferenceMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions(18).map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {kind === "variable" && (
              <div>
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

            <div>
              <Label>Descrição (opcional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder={mode === "installments" ? "Ex: Som JBL" : "Ex: Conta de luz - fev"} />
            </div>
          </div>

          <TabsContent value="once" className="space-y-3 mt-3">
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENTS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Escolha "A pagar" para deixar a conta aberta (vai pro vermelho na lista).
              </p>
            </div>

            {paid && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data do pagamento</Label>
                  <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                </div>
                <div>
                  <Label>Valor pago</Label>
                  <CurrencyInput value={paidAmount} onChange={setPaidAmount} />
                </div>
                {interest > 0 && (
                  <div className="col-span-2 flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <div>
                      <div className="font-medium">Juros / multa: {formatBRL(interest)}</div>
                      <div className="text-xs opacity-80">Separado no relatório do mês do pagamento.</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {kind === "fixed" && (
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="font-medium text-sm">Recorrente mensal</div>
                  <div className="text-xs text-muted-foreground">Marque para identificar contas mensais (aluguel, INSS…)</div>
                </div>
                <Switch checked={recurrence === "monthly"}
                  onCheckedChange={(b) => setRecurrence(b ? "monthly" : "once")} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="installments" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nº de parcelas</Label>
                <Input
                  type="number" min={2} max={60}
                  value={installmentTotal}
                  onChange={(e) => setInstallmentTotal(Math.max(2, Math.min(60, Number(e.target.value) || 2)))}
                />
              </div>
              <div>
                <Label>Dia do vencimento (opcional)</Label>
                <Input type="number" min={1} max={28} placeholder="Ex: 10"
                  value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
              </div>
            </div>
            {installmentTotal >= 2 && amount > 0 && (
              <div className="text-xs p-2 rounded bg-secondary/40 text-muted-foreground">
                Vou criar <span className="font-semibold text-foreground">{installmentTotal} contas a pagar</span> de{" "}
                <span className="font-semibold text-foreground">{formatBRL(amount)}</span>, começando em{" "}
                <span className="font-semibold text-foreground">
                  {format(new Date(monthValueToDate(referenceMonth)), "MMM/yyyy", { locale: ptBR })}
                </span>
                . Total: <span className="font-semibold text-foreground">{formatBRL(amount * installmentTotal)}</span>.
              </div>
            )}
          </TabsContent>

          {/* ============ INVESTIMENTO ============ */}
          <div className="mt-3 flex items-start gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm">É um investimento?</div>
                <Switch checked={isInvestment} onCheckedChange={setIsInvestment} />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Investimentos (som, freezer, reforma) <strong>não baixam o lucro</strong> do mês — ficam num card separado. Quando acabar de pagar, o lucro sobe automaticamente.
              </div>
            </div>
          </div>

          <div className="mt-3">
            <Label>Observações (opcional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : mode === "installments" ? `Criar ${installmentTotal} parcelas` : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
