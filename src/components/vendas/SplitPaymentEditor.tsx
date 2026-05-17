import { Banknote, CreditCard, Smartphone, Plus, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatBRL } from "@/lib/format";

export type PaymentMethod = "dinheiro" | "debito" | "credito" | "pix";

export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
}

const METHODS: { key: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { key: "dinheiro", label: "Dinheiro", icon: Banknote },
  { key: "debito", label: "Débito", icon: CreditCard },
  { key: "credito", label: "Crédito", icon: CreditCard },
  { key: "pix", label: "Pix", icon: Smartphone },
];

interface Props {
  total: number;
  payments: PaymentLine[];
  onChange: (next: PaymentLine[]) => void;
  canSellCash: boolean;
}

export function SplitPaymentEditor({ total, payments, onChange, canSellCash }: Props) {
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const dinheiroPaid = payments
    .filter((p) => p.method === "dinheiro")
    .reduce((s, p) => s + p.amount, 0);
  const otherPaid = paid - dinheiroPaid;
  const remaining = +(total - paid).toFixed(2);
  // dinheiro pode passar (gera troco) — outros não
  const change =
    otherPaid <= total && dinheiroPaid > 0 && paid > total ? +(paid - total).toFixed(2) : 0;

  const addLine = (method: PaymentMethod) => {
    const fill = Math.max(0, +(total - paid).toFixed(2));
    onChange([...payments, { method, amount: fill }]);
  };

  const updateLine = (idx: number, amount: number) => {
    onChange(payments.map((p, i) => (i === idx ? { ...p, amount } : p)));
  };

  const removeLine = (idx: number) => {
    onChange(payments.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Pagamento
      </div>

      <div className="grid grid-cols-2 gap-2">
        {METHODS.filter((m) => m.key !== "dinheiro" || canSellCash).map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => addLine(m.key)}
            className="flex items-center gap-2 p-3 rounded-xl border bg-card hover:border-primary/50 transition"
          >
            <m.icon className="h-4 w-4" />
            <span className="font-medium text-sm">{m.label}</span>
            <Plus className="h-4 w-4 ml-auto" />
          </button>
        ))}
      </div>

      {payments.length > 0 && (
        <div className="space-y-2">
          {payments.map((p, idx) => {
            const meta = METHODS.find((m) => m.key === p.method)!;
            return (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 rounded-lg border bg-card"
              >
                <meta.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium w-20">{meta.label}</span>
                <CurrencyInput
                  value={p.amount}
                  onChange={(v) => updateLine(idx, v)}
                  className="flex-1 h-9 text-right"
                />
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeLine(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm">
        <span className="text-muted-foreground">Total da venda</span>
        <span className="font-semibold">{formatBRL(total)}</span>
      </div>
      {remaining > 0.005 ? (
        <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 text-sm">
          <span className="text-amber-600 font-medium">Falta</span>
          <span className="font-bold text-amber-600">{formatBRL(remaining)}</span>
        </div>
      ) : change > 0.005 ? (
        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 text-sm">
          <span className="text-emerald-600 font-medium">Troco</span>
          <span className="font-bold text-emerald-600">{formatBRL(change)}</span>
        </div>
      ) : paid > 0 ? (
        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 text-sm">
          <span className="text-emerald-600 font-medium">Pago integralmente</span>
        </div>
      ) : null}
    </div>
  );
}

export function isSplitValid(total: number, payments: PaymentLine[]) {
  if (payments.length === 0) return false;
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const dinheiro = payments.filter((p) => p.method === "dinheiro").reduce((s, p) => s + p.amount, 0);
  const others = paid - dinheiro;
  // outros não podem exceder total; dinheiro pode (troco)
  if (others > total + 0.005) return false;
  return paid + 0.005 >= total;
}

export function dominantMethod(payments: PaymentLine[]): PaymentMethod {
  if (payments.length === 0) return "dinheiro";
  const sums: Record<string, number> = {};
  payments.forEach((p) => (sums[p.method] = (sums[p.method] ?? 0) + p.amount));
  return Object.entries(sums).sort((a, b) => b[1] - a[1])[0][0] as PaymentMethod;
}
