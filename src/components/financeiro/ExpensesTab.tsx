import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Repeat, CheckCircle2, Clock, Building2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { ExpenseFormDialog } from "./ExpenseFormDialog";

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

export function ExpensesTab({ kind }: { kind: Kind }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { start, end } = monthRange(month);

  const { data: rows = [] } = useQuery({
    queryKey: ["bar-expenses", user?.id, kind, month],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bar_expenses")
        .select("*")
        .eq("kind", kind)
        .gte("expense_date", start)
        .lte("expense_date", end)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data;
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

  const togglePaid = useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { error } = await supabase.from("bar_expenses")
        .update({ paid, paid_at: paid ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bar-expenses"] }),
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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total do mês</div>
          <div className="text-xl font-bold mt-1">{formatBRL(totals.total)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Pago</div>
          <div className="text-xl font-bold mt-1 text-success">{formatBRL(totals.paid)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">A pagar</div>
          <div className="text-xl font-bold mt-1 text-destructive">{formatBRL(totals.pending)}</div>
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
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <button
                  onClick={() => togglePaid.mutate({ id: r.id, paid: !r.paid })}
                  className={`h-9 w-9 rounded-full grid place-items-center shrink-0 ${
                    r.paid ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                  }`}
                  title={r.paid ? "Pago" : "A pagar"}
                >
                  {r.paid ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.category_name}</span>
                    {r.recurrence === "monthly" && (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Repeat className="h-3 w-3" /> mensal
                      </Badge>
                    )}
                    {r.supplier_name && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Building2 className="h-3 w-3" /> {r.supplier_name}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {format(new Date(r.expense_date), "dd/MM", { locale: ptBR })}
                    {r.payment_method ? ` · ${PAYMENT_LABEL[r.payment_method] ?? r.payment_method}` : ""}
                    {r.description ? ` · ${r.description}` : ""}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-bold text-destructive">{formatBRL(Number(r.amount))}</div>
                </div>

                <Button size="icon" variant="ghost"
                  onClick={() => { if (confirm("Remover este lançamento?")) remove.mutate(r.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ExpenseFormDialog open={openForm} onOpenChange={setOpenForm} kind={kind} />
    </div>
  );
}
