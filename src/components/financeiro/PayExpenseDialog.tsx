import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { AlertTriangle, ArrowDownRight } from "lucide-react";

const PAYMENTS = [
  { v: "dinheiro", l: "Dinheiro" },
  { v: "pix", l: "Pix" },
  { v: "debito", l: "Débito" },
  { v: "credito", l: "Crédito" },
  { v: "boleto", l: "Boleto" },
  { v: "transferencia", l: "Transferência" },
] as const;

type Expense = {
  id: string;
  amount: number;
  payment_method: string | null;
  category_name: string;
};

export function PayExpenseDialog({
  expense, open, onOpenChange,
}: { expense: Expense | null; open: boolean; onOpenChange: (b: boolean) => void }) {
  const qc = useQueryClient();
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("pix");

  const original = Number(expense?.amount ?? 0);

  // Abatimentos lançados para essa despesa (ex: consumo do cara do som)
  const { data: offsets = [] } = useQuery({
    queryKey: ["expense-offsets", expense?.id],
    enabled: open && !!expense?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_offsets")
        .select("id, amount, description, source_type, created_at")
        .eq("expense_id", expense!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const offsetsTotal = offsets.reduce((s, o) => s + Number(o.amount), 0);
  const suggested = Math.max(0, original - offsetsTotal);

  useEffect(() => {
    if (open && expense) {
      setPaidAt(new Date().toISOString().slice(0, 10));
      setPaymentMethod(
        expense.payment_method && expense.payment_method !== "a_pagar" ? expense.payment_method : "pix",
      );
    }
  }, [open, expense]);

  useEffect(() => {
    // Atualiza a sugestão quando offsets carregam
    if (open) setPaidAmount(suggested > 0 ? suggested : original);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggested, original]);

  const interest = Math.max(0, paidAmount - suggested);

  const save = useMutation({
    mutationFn: async () => {
      if (!expense) throw new Error("Nenhuma despesa");
      if (paidAmount < 0) throw new Error("Valor inválido");
      const { error } = await supabase.from("bar_expenses")
        .update({
          paid: true,
          paid_at: new Date(paidAt + "T12:00:00").toISOString(),
          paid_amount: paidAmount,
          interest_amount: interest,
          payment_method: paymentMethod,
        })
        .eq("id", expense.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pagamento registrado");
      qc.invalidateQueries({ queryKey: ["bar-expenses"] });
      qc.invalidateQueries({ queryKey: ["bar-expenses-month-summary"] });
      qc.invalidateQueries({ queryKey: ["bar-expenses-interest-month"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!expense) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {expense.category_name} · Valor original {formatBRL(original)}
          </p>
        </DialogHeader>

        <div className="space-y-3">
          {offsets.length > 0 && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/30 text-sm space-y-1">
              <div className="flex items-center gap-2 font-medium text-primary">
                <ArrowDownRight className="h-4 w-4" />
                Abatimentos neste compromisso
              </div>
              {offsets.map((o) => (
                <div key={o.id} className="flex justify-between text-xs">
                  <span className="text-muted-foreground truncate">{o.description ?? o.source_type}</span>
                  <span className="font-semibold">-{formatBRL(Number(o.amount))}</span>
                </div>
              ))}
              <div className="flex justify-between pt-1 mt-1 border-t border-primary/20 text-xs">
                <span>Sugestão a pagar</span>
                <span className="font-bold text-primary">{formatBRL(suggested)}</span>
              </div>
            </div>
          )}

          <div>
            <Label>Data do pagamento</Label>
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div>
            <Label>Valor efetivamente pago</Label>
            <CurrencyInput value={paidAmount} onChange={setPaidAmount} />
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

          {interest > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Juros / multa: {formatBRL(interest)}</div>
                <div className="text-xs opacity-80">A diferença será separada no relatório do mês.</div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Confirmar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
