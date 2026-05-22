import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Repeat, CheckCircle2, Clock, Building2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { ExpenseFormDialog } from "./ExpenseFormDialog";
import { PayExpenseDialog } from "./PayExpenseDialog";

type Kind = "fixed" | "variable";

const PAYMENT_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "Pix", debito: "Débito",
  credito: "Crédito", boleto: "Boleto", transferencia: "Transferência",
};

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function recentMonths(n = 6) {
  const arr: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    arr.push({
      value: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`,
      label: format(dt, "MMMM 'de' yyyy", { locale: ptBR }),
    });
  }
  return arr;
}

type ExpenseRow = {
  id: string;
  category_name: string;
  amount: number;
  paid: boolean;
  paid_at: string | null;
  paid_amount: number | null;
  interest_amount: number;
  reference_month: string | null;
  expense_date: string;
  payment_method: string | null;
  description: string | null;
  supplier_name: string | null;
  recurrence: string;
  installment_index: number | null;
  installment_total: number | null;
  is_investment: boolean;
};

export function ExpensesTab({ kind }: { kind: Kind }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [payTarget, setPayTarget] = useState<ExpenseRow | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { start, end } = monthRange(month);

  const { data: rows = [] } = useQuery<ExpenseRow[]>({
    queryKey: ["bar-expenses", user?.id, kind, month],
    enabled: !!user,
    queryFn: async () => {
      // Busca por competência (reference_month) com fallback para expense_date
      const { data, error } = await supabase
        .from("bar_expenses")
        .select("id, category_name, amount, paid, paid_at, paid_amount, interest_amount, reference_month, expense_date, payment_method, description, supplier_name, recurrence, installment_index, installment_total, is_investment")
        .eq("kind", kind)
        .or(`and(reference_month.gte.${start},reference_month.lte.${end}),and(reference_month.is.null,expense_date.gte.${start},expense_date.lte.${end})`)
        .order("reference_month", { ascending: false, nullsFirst: false })
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpenseRow[];
    },
  });

  // Juros pagos NO mês selecionado (regime de caixa — usa paid_at)
  const { data: interestPaidInMonth = 0 } = useQuery({
    queryKey: ["bar-expenses-interest-month", user?.id, kind, month],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bar_expenses")
        .select("interest_amount, paid_at")
        .eq("kind", kind)
        .eq("paid", true)
        .gt("interest_amount", 0)
        .gte("paid_at", `${start}T00:00:00`)
        .lte("paid_at", `${end}T23:59:59`);
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + Number(r.interest_amount ?? 0), 0);
    },
  });

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    const paid = rows.filter((r) => r.paid).reduce((s, r) => s + Number(r.amount), 0);
    const pending = total - paid;
    const byCategory = new Map<string, number>();
    for (const r of rows) {
      byCategory.set(r.category_name, (byCategory.get(r.category_name) ?? 0) + Number(r.amount));
    }
    return {
      total, paid, pending,
      categories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [rows]);

  const undoPay = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bar_expenses")
        .update({ paid: false, paid_at: null, paid_amount: null, interest_amount: 0 })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bar-expenses"] });
      qc.invalidateQueries({ queryKey: ["bar-expenses-interest-month"] });
      qc.invalidateQueries({ queryKey: ["bar-expenses-month-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bar_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento removido");
      qc.invalidateQueries({ queryKey: ["bar-expenses"] });
      qc.invalidateQueries({ queryKey: ["bar-expenses-interest-month"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {recentMonths(12).map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="ml-auto" onClick={() => setOpenForm(true)}>
          <Plus className="h-4 w-4" /> Novo lançamento
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total do mês</div>
          <div className="text-xl font-bold mt-1">{formatBRL(totals.total)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">por competência</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Pago</div>
          <div className="text-xl font-bold mt-1 text-success">{formatBRL(totals.paid)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">A pagar</div>
          <div className="text-xl font-bold mt-1 text-destructive">{formatBRL(totals.pending)}</div>
        </CardContent></Card>
        <Card className="border-amber-500/30"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Juros & multa
          </div>
          <div className="text-xl font-bold mt-1 text-amber-500">{formatBRL(Number(interestPaidInMonth))}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">pagos neste mês</div>
        </CardContent></Card>
      </div>

      {totals.categories.length > 0 && (
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground mb-2">Por categoria</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {totals.categories.map(([name, val]) => (
              <div key={name} className="flex items-center justify-between text-sm p-2 rounded bg-secondary/30">
                <span className="truncate">{name}</span>
                <span className="font-semibold">{formatBRL(val)}</span>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Nenhum lançamento neste mês. Clique em "Novo lançamento".
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const refDate = r.reference_month ?? r.expense_date;
            const isLate = r.paid && r.paid_at && refDate
              ? new Date(r.paid_at).getMonth() !== new Date(refDate).getMonth()
                || new Date(r.paid_at).getFullYear() !== new Date(refDate).getFullYear()
              : false;
            return (
              <Card key={r.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (r.paid) {
                        if (confirm("Desfazer pagamento desta despesa?")) undoPay.mutate(r.id);
                      } else {
                        setPayTarget(r);
                      }
                    }}
                    className={`h-9 w-9 rounded-full grid place-items-center shrink-0 ${
                      r.paid ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                    }`}
                    title={r.paid ? "Pago — clique para desfazer" : "A pagar — clique para registrar"}
                  >
                    {r.paid ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{r.category_name}</span>
                      {r.installment_index && r.installment_total && (
                        <Badge variant="secondary" className="text-[10px]">
                          {r.installment_index}/{r.installment_total}
                        </Badge>
                      )}
                      {r.recurrence === "monthly" && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Repeat className="h-3 w-3" /> mensal
                        </Badge>
                      )}
                      {r.is_investment && (
                        <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30">
                          investimento
                        </Badge>
                      )}
                      {r.supplier_name && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Building2 className="h-3 w-3" /> {r.supplier_name}
                        </Badge>
                      )}
                      {isLate && (
                        <Badge className="gap-1 text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
                          atrasado
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {format(new Date(refDate), "MMM/yyyy", { locale: ptBR })}
                      {r.payment_method ? ` · ${PAYMENT_LABEL[r.payment_method] ?? r.payment_method}` : ""}
                      {r.paid && r.paid_at ? ` · pago em ${format(new Date(r.paid_at), "dd/MM", { locale: ptBR })}` : ""}
                      {r.description ? ` · ${r.description}` : ""}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-destructive">{formatBRL(Number(r.amount))}</div>
                    {Number(r.interest_amount) > 0 && (
                      <div className="text-[10px] text-amber-500 font-medium">
                        +{formatBRL(Number(r.interest_amount))} juros
                      </div>
                    )}
                  </div>

                  <Button size="icon" variant="ghost"
                    onClick={() => { if (confirm("Remover este lançamento?")) remove.mutate(r.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ExpenseFormDialog open={openForm} onOpenChange={setOpenForm} kind={kind} />
      <PayExpenseDialog
        expense={payTarget}
        open={!!payTarget}
        onOpenChange={(b) => { if (!b) setPayTarget(null); }}
      />
    </div>
  );
}
