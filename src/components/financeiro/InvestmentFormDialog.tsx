import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { Sparkles, Plus } from "lucide-react";

const NEW_CAT = "__new_cat__";

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

type Mode = "installments" | "once";

export function InvestmentFormDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>("installments");
  const [investmentName, setInvestmentName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [seller, setSeller] = useState("");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [installments, setInstallments] = useState<number>(12);
  const [firstMonth, setFirstMonth] = useState(currentMonthValue);
  const [dueDay, setDueDay] = useState<string>("");
  const [alreadyPaidCount, setAlreadyPaidCount] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [autoConsumacaoRecipient, setAutoConsumacaoRecipient] = useState("");
  const [autoConsumacaoTarget, setAutoConsumacaoTarget] = useState<string>("seguranca");

  useEffect(() => {
    if (open) {
      setMode("installments");
      setInvestmentName("");
      setCategoryId(""); setNewCategoryName("");
      setSeller("");
      setTotalAmount(0);
      setInstallments(12);
      setFirstMonth(currentMonthValue());
      setDueDay("");
      setAlreadyPaidCount(0);
      setNotes("");
      setAutoConsumacaoRecipient("");
      setAutoConsumacaoTarget("seguranca");
    }
  }, [open]);

  const { data: categories = [] } = useQuery({
    queryKey: ["investment-categories", user?.id],
    enabled: !!user && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bar_expense_categories")
        .select("id, name")
        .eq("kind", "investment")
        .order("sort_order").order("name");
      if (error) throw error;
      return data;
    },
  });

  const installmentValue = mode === "installments" && installments > 0
    ? totalAmount / installments
    : totalAmount;

  const resolveCategory = async () => {
    if (!user) throw new Error("Não autenticado");
    if (categoryId === NEW_CAT) {
      const n = newCategoryName.trim();
      if (!n) throw new Error("Informe o nome da nova categoria");
      const { data: c, error } = await supabase
        .from("bar_expense_categories")
        .insert({ user_id: user.id, name: n, kind: "investment" })
        .select().single();
      if (error) throw error;
      return { id: c.id as string, name: c.name as string };
    }
    const c = categories.find((x) => x.id === categoryId);
    if (!c) throw new Error("Selecione uma categoria");
    return { id: c.id as string, name: c.name as string };
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (!investmentName.trim()) throw new Error("Informe o nome do bem");
      if (!totalAmount || totalAmount <= 0) throw new Error("Informe o valor total");

      const cat = await resolveCategory();
      const sellerName = seller.trim() || null;
      const name = investmentName.trim();
      const noteText = notes.trim() || null;

      if (mode === "installments") {
        if (!installments || installments < 2) throw new Error("Mínimo 2 parcelas");
        if (installments > 60) throw new Error("Máximo 60 parcelas");
        if (alreadyPaidCount < 0 || alreadyPaidCount > installments) {
          throw new Error("Quantidade de parcelas pagas inválida");
        }

        const groupId = crypto.randomUUID();
        const value = totalAmount / installments;
        const nowIso = new Date().toISOString();

        const rows = Array.from({ length: installments }).map((_, i) => {
          const ymIns = addMonthsToYM(firstMonth, i);
          const isPaid = i < alreadyPaidCount;
          return {
            user_id: user.id,
            kind: "variable" as const,
            category_id: cat.id,
            category_name: cat.name,
            supplier_id: null,
            supplier_name: sellerName,
            investment_name: name,
            total_amount: totalAmount,
            amount: value,
            description: `${name} · ${i + 1}/${installments}`,
            expense_date: monthValueToDate(ymIns),
            reference_month: monthValueToDate(ymIns),
            due_date: dueDay ? `${ymIns}-${dueDay.padStart(2, "0")}` : null,
            payment_method: isPaid ? "dinheiro" : "a_pagar",
            paid: isPaid,
            paid_at: isPaid ? nowIso : null,
            paid_amount: isPaid ? value : null,
            interest_amount: 0,
            recurrence: "installment",
            installment_total: installments,
            installment_index: i + 1,
            installment_group_id: groupId,
            is_investment: true,
            notes: noteText,
            created_by: user.id,
            auto_consumacao_recipient: autoConsumacaoRecipient.trim() || null,
            auto_consumacao_target: autoConsumacaoRecipient.trim() ? autoConsumacaoTarget : null,
          };
        });
        const { error } = await supabase.from("bar_expenses").insert(rows as never);
        if (error) throw error;
        return;
      }

      // Pagamento único — já considera como pago (saiu do caixa)
      const refDate = monthValueToDate(firstMonth);
      const { error } = await supabase.from("bar_expenses").insert({
        user_id: user.id,
        kind: "variable",
        category_id: cat.id,
        category_name: cat.name,
        supplier_id: null,
        supplier_name: sellerName,
        investment_name: name,
        total_amount: totalAmount,
        amount: totalAmount,
        description: name,
        expense_date: refDate,
        reference_month: refDate,
        due_date: null,
        payment_method: "dinheiro",
        paid: true,
        paid_at: new Date().toISOString(),
        paid_amount: totalAmount,
        interest_amount: 0,
        recurrence: "once",
        is_investment: true,
        notes: noteText,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        mode === "installments"
          ? `Investimento criado: ${installments} parcelas`
          : "Investimento à vista registrado"
      );
      qc.invalidateQueries({ queryKey: ["bar-expenses"] });
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["investment-categories"] });
      qc.invalidateQueries({ queryKey: ["bar-expenses-month-summary"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Novo investimento
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Equipamentos, obras e melhorias. <strong>Não baixam o lucro do mês</strong> — ficam num card separado.
          </p>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div>
            <Label>Nome do bem</Label>
            <Input
              value={investmentName}
              onChange={(e) => setInvestmentName(e.target.value)}
              placeholder="Ex: Som JBL, Aumento de camarotes, Microfone Shure"
            />
          </div>

          <div>
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                <SelectItem value={NEW_CAT}>+ Criar nova categoria…</SelectItem>
              </SelectContent>
            </Select>
            {categoryId === NEW_CAT && (
              <Input
                className="mt-2"
                placeholder='Ex: "Iluminação", "Ar-condicionado"'
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
            )}
          </div>

          <div>
            <Label>Vendedor (opcional)</Label>
            <Input
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
              placeholder="Nome de quem te vendeu / construiu"
            />
          </div>

          <div>
            <Label>Valor total do investimento</Label>
            <CurrencyInput value={totalAmount} onChange={setTotalAmount} />
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="installments">Parcelado</TabsTrigger>
              <TabsTrigger value="once">Pagamento único</TabsTrigger>
            </TabsList>

            <TabsContent value="installments" className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nº de parcelas</Label>
                  <Input
                    type="number" min={2} max={60}
                    value={installments}
                    onChange={(e) => setInstallments(Math.max(2, Math.min(60, Number(e.target.value) || 2)))}
                  />
                </div>
                <div>
                  <Label>Dia do vencimento</Label>
                  <Input type="number" min={1} max={28} placeholder="Ex: 10"
                    value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
                </div>
              </div>

              <div>
                <Label>1ª parcela em</Label>
                <Select value={firstMonth} onValueChange={setFirstMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthOptions(18).map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Quantas parcelas eu já paguei? (opcional)</Label>
                <Input
                  type="number" min={0} max={installments}
                  value={alreadyPaidCount}
                  onChange={(e) => setAlreadyPaidCount(Math.max(0, Math.min(installments, Number(e.target.value) || 0)))}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  As {alreadyPaidCount > 0 ? `${alreadyPaidCount} primeiras` : "primeiras"} parcelas já serão marcadas como pagas.
                </p>
              </div>

              {installments >= 2 && totalAmount > 0 && (
                <div className="text-xs p-2 rounded bg-secondary/40 text-muted-foreground space-y-0.5">
                  <div>
                    <span className="font-semibold text-foreground">{installments} parcelas</span> de{" "}
                    <span className="font-semibold text-foreground">{formatBRL(installmentValue)}</span>
                  </div>
                  <div>
                    Total: <span className="font-semibold text-foreground">{formatBRL(totalAmount)}</span>
                    {alreadyPaidCount > 0 && (
                      <> · Já pago: <span className="font-semibold text-success">{formatBRL(installmentValue * alreadyPaidCount)}</span></>
                    )}
                  </div>
                  <div>
                    Saldo: <span className="font-semibold text-destructive">{formatBRL(installmentValue * (installments - alreadyPaidCount))}</span>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="once" className="space-y-3 mt-3">
              <div>
                <Label>Mês de referência</Label>
                <Select value={firstMonth} onValueChange={setFirstMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthOptions(18).map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs p-2 rounded bg-secondary/40 text-muted-foreground">
                Vai ser registrado como <span className="font-semibold text-success">pago à vista</span>{" "}
                no valor de <span className="font-semibold text-foreground">{formatBRL(totalAmount)}</span>.
              </div>
            </TabsContent>
          </Tabs>

          <div>
            <Label>Observação (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: comprado do João, nota anexada em..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Plus className="h-4 w-4" /> Criar investimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
