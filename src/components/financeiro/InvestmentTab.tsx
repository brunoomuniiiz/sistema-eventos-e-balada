import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles, Plus, ChevronDown, ChevronRight, CheckCircle2,
  Clock, Trash2, Wrench,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { InvestmentFormDialog } from "./InvestmentFormDialog";
import { PayExpenseDialog } from "./PayExpenseDialog";

type Row = {
  id: string;
  user_id: string;
  category_name: string;
  category_id: string | null;
  investment_name: string | null;
  supplier_name: string | null;
  total_amount: number | null;
  amount: number;
  description: string | null;
  paid: boolean;
  paid_at: string | null;
  paid_amount: number | null;
  interest_amount: number;
  reference_month: string | null;
  expense_date: string;
  due_date: string | null;
  payment_method: string | null;
  installment_index: number | null;
  installment_total: number | null;
  installment_group_id: string | null;
  is_investment: boolean;
  notes: string | null;
  recurrence: string;
};

type Group = {
  key: string;
  name: string;
  category: string;
  seller: string | null;
  total: number;
  paid: number;
  pending: number;
  installmentsCount: number;
  installmentsPaid: number;
  items: Row[];
};

export function InvestmentTab() {
  const { user } = useAuth();
  const { isOwner, canFinLancarDespesas } = usePermissions();
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [payTarget, setPayTarget] = useState<Row | null>(null);

  const canEdit = isOwner || canFinLancarDespesas;

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["investments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bar_expenses")
        .select("*")
        .eq("is_investment", true)
        .order("expense_date", { ascending: false })
        .order("installment_index", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: offsetsByExpense = {} } = useQuery<Record<string, number>>({
    queryKey: ["investments-offsets", user?.id, rows.length],
    enabled: !!user && rows.length > 0,
    queryFn: async () => {
      const ids = rows.map((r) => r.id);
      const { data, error } = await supabase
        .from("expense_offsets")
        .select("expense_id, amount")
        .in("expense_id", ids);
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const o of data ?? []) {
        m[o.expense_id] = (m[o.expense_id] ?? 0) + Number(o.amount);
      }
      return m;
    },
  });

  const groups: Group[] = useMemo(() => {
    const byKey = new Map<string, Group>();
    for (const r of rows) {
      const key = r.installment_group_id ?? r.id;
      const name = r.investment_name?.trim()
        || r.description?.replace(/\s*·\s*\d+\/\d+\s*$/, "").trim()
        || r.category_name;
      const g = byKey.get(key) ?? {
        key,
        name,
        category: r.category_name,
        seller: r.supplier_name,
        total: 0,
        paid: 0,
        pending: 0,
        installmentsCount: 0,
        installmentsPaid: 0,
        items: [],
      };
      g.items.push(r);
      g.total += Number(r.amount);
      g.installmentsCount += 1;
      if (r.paid) {
        g.paid += Number(r.paid_amount ?? r.amount);
        g.installmentsPaid += 1;
      } else {
        g.pending += Number(r.amount);
      }
      if (r.investment_name) g.name = r.investment_name;
      byKey.set(key, g);
    }
    // Use total_amount when available (more accurate for parcelas)
    for (const g of byKey.values()) {
      const t = g.items[0]?.total_amount;
      if (t && Number(t) > 0 && g.installmentsCount > 1) {
        g.total = Number(t);
        g.pending = Math.max(0, g.total - g.paid);
      }
      g.items.sort((a, b) => (a.installment_index ?? 0) - (b.installment_index ?? 0));
    }
    return [...byKey.values()].sort((a, b) => {
      const ad = a.items[0]?.expense_date ?? "";
      const bd = b.items[0]?.expense_date ?? "";
      return bd.localeCompare(ad);
    });
  }, [rows]);

  const totals = useMemo(() => {
    const total = groups.reduce((s, g) => s + g.total, 0);
    const paid = groups.reduce((s, g) => s + g.paid, 0);
    return { total, paid, pending: total - paid };
  }, [groups]);

  const removeGroup = useMutation({
    mutationFn: async (key: string) => {
      const g = groups.find((x) => x.key === key);
      if (!g) return;
      const ids = g.items.map((i) => i.id);
      const { error } = await supabase.from("bar_expenses").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Investimento removido");
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["bar-expenses-month-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const undoPay = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bar_expenses")
        .update({ paid: false, paid_at: null, paid_amount: null, interest_amount: 0, payment_method: "a_pagar" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["bar-expenses-month-summary"] });
    },
  });

  const toggle = (k: string) => {
    const n = new Set(expanded);
    if (n.has(k)) n.delete(k); else n.add(k);
    setExpanded(n);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Equipamentos, obras e melhorias. Não baixam o lucro do mês.
        </p>
        {canEdit && (
          <Button onClick={() => setOpenForm(true)}>
            <Plus className="h-4 w-4" /> Novo investimento
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total investido</div>
          <div className="text-xl font-bold mt-1">{formatBRL(totals.total)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Já pago</div>
          <div className="text-xl font-bold mt-1 text-success">{formatBRL(totals.paid)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">A pagar</div>
          <div className="text-xl font-bold mt-1 text-destructive">{formatBRL(totals.pending)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Bens registrados</div>
          <div className="text-xl font-bold mt-1">{groups.length}</div>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-12">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p>Nenhum investimento registrado.</p>
          <p className="text-xs mt-1">Som, equipamentos, obras… clique em "Novo investimento".</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const pct = g.total > 0 ? (g.paid / g.total) * 100 : 0;
            const isOpen = expanded.has(g.key);
            const isInstallment = g.installmentsCount > 1;
            return (
              <Card key={g.key}>
                <CardContent className="p-0">
                  <button
                    onClick={() => toggle(g.key)}
                    className="w-full p-3 flex items-center gap-3 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary grid place-items-center shrink-0">
                      <Wrench className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{g.name}</span>
                        <Badge variant="outline" className="text-[10px]">{g.category}</Badge>
                        {isInstallment && (
                          <Badge variant="secondary" className="text-[10px]">
                            {g.installmentsPaid}/{g.installmentsCount} pagas
                          </Badge>
                        )}
                        {g.seller && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            · {g.seller}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5">
                        <Progress value={pct} className="h-1.5" />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                        <span>
                          Pago <span className="text-success font-medium">{formatBRL(g.paid)}</span>
                          {" · "}
                          Saldo <span className="text-destructive font-medium">{formatBRL(g.pending)}</span>
                        </span>
                        <span className="font-medium text-foreground">{formatBRL(g.total)}</span>
                      </div>
                    </div>
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="border-t bg-muted/20 divide-y">
                      {g.items.map((it) => {
                        const offset = offsetsByExpense[it.id] ?? 0;
                        const refDate = it.reference_month ?? it.expense_date;
                        return (
                          <div key={it.id} className="p-2.5 flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (it.paid) {
                                  if (confirm("Desfazer pagamento desta parcela?")) undoPay.mutate(it.id);
                                } else {
                                  setPayTarget(it);
                                }
                              }}
                              className={`h-7 w-7 rounded-full grid place-items-center shrink-0 ${
                                it.paid ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                              }`}
                              title={it.paid ? "Pago — clique para desfazer" : "Pagar agora"}
                            >
                              {it.paid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium">
                                {it.installment_index && it.installment_total
                                  ? `Parcela ${it.installment_index}/${it.installment_total}`
                                  : "Pagamento à vista"}
                                {" · "}
                                <span className="text-muted-foreground">
                                  {format(new Date(refDate), "MMM/yyyy", { locale: ptBR })}
                                </span>
                              </div>
                              {offset > 0 && (
                                <div className="text-[10px] text-primary">
                                  Abatido em consumo: -{formatBRL(offset)}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold">{formatBRL(Number(it.amount))}</div>
                              {it.paid && it.paid_at && (
                                <div className="text-[10px] text-muted-foreground">
                                  pago {format(new Date(it.paid_at), "dd/MM", { locale: ptBR })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {canEdit && (
                        <div className="p-2 flex justify-end">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => {
                              if (confirm(`Remover o investimento "${g.name}" e todas as ${g.installmentsCount} parcelas?`)) {
                                removeGroup.mutate(g.key);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remover investimento
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <InvestmentFormDialog open={openForm} onOpenChange={setOpenForm} />
      <PayExpenseDialog
        expense={payTarget as never}
        open={!!payTarget}
        onOpenChange={(b) => { if (!b) setPayTarget(null); }}
      />
    </div>
  );
}
