import { useState, useEffect, useRef } from "react";
import { Banknote, CreditCard, Smartphone, Plus, Trash2, ArrowLeft, X } from "lucide-react";
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
  acceptedMethods?: PaymentMethod[];
}

export function SplitPaymentEditor({ total, payments, onChange, canSellCash, acceptedMethods }: Props) {
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const dinheiroPaid = payments
    .filter((p) => p.method === "dinheiro")
    .reduce((s, p) => s + p.amount, 0);
  const otherPaid = paid - dinheiroPaid;
  const remaining = +(total - paid).toFixed(2);
  const change =
    otherPaid <= total && dinheiroPaid > 0 && paid > total ? +(paid - total).toFixed(2) : 0;

  const [wizardStep, setWizardStep] = useState<null | "amount" | "method">(null);
  const [wizardAmount, setWizardAmount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const openWizard = () => {
    setWizardAmount(Math.max(0, remaining));
    setWizardStep("amount");
  };
  const closeWizard = () => {
    setWizardStep(null);
    setWizardAmount(0);
  };

  useEffect(() => {
    if (wizardStep === "amount") {
      // foco e select para facilitar substituir
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [wizardStep]);

  const pickMethod = (method: PaymentMethod) => {
    if (wizardAmount <= 0) return;
    onChange([...payments, { method, amount: +wizardAmount.toFixed(2) }]);
    closeWizard();
  };

  const removeLine = (idx: number) => {
    onChange(payments.filter((_, i) => i !== idx));
  };

  const availableMethods = METHODS.filter((m) => {
    if (m.key === "dinheiro" && !canSellCash) return false;
    if (acceptedMethods && !acceptedMethods.includes(m.key)) return false;
    return true;
  });

  // ---------- Wizard overlay ----------
  if (wizardStep) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <Button variant="ghost" size="icon" onClick={wizardStep === "method" ? () => setWizardStep("amount") : closeWizard}>
            {wizardStep === "method" ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </Button>
          <div className="text-sm text-muted-foreground">
            {wizardStep === "amount" ? "Valor do pagamento" : "Forma de pagamento"}
          </div>
          <div className="w-10" />
        </div>

        {wizardStep === "amount" ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
            <div className="text-sm text-muted-foreground">Falta {formatBRL(remaining)}</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Quanto vai pagar?</div>
            <CurrencyInput
              ref={inputRef}
              value={wizardAmount}
              onChange={setWizardAmount}
              className="text-center text-5xl font-bold h-20 w-full max-w-xs border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <div className="flex gap-2 w-full max-w-xs">
              {[remaining, remaining / 2, 10, 20, 50, 100]
                .filter((v) => v > 0)
                .slice(0, 4)
                .map((v, i) => (
                  <button
                    key={i}
                    onClick={() => setWizardAmount(+v.toFixed(2))}
                    className="flex-1 py-2 rounded-lg border bg-card text-xs"
                  >
                    {formatBRL(v)}
                  </button>
                ))}
            </div>
            <Button
              size="lg"
              className="w-full max-w-xs h-14 text-base font-bold mt-4"
              disabled={wizardAmount <= 0}
              onClick={() => setWizardStep("method")}
            >
              Avançar
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-6 gap-4">
            <div className="text-center text-sm text-muted-foreground">
              Pagar <span className="font-bold text-foreground text-lg">{formatBRL(wizardAmount)}</span> com
            </div>
            <div className="grid grid-cols-2 gap-3 flex-1 content-start">
              {availableMethods.map((m) => (
                <button
                  key={m.key}
                  onClick={() => pickMethod(m.key)}
                  className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 bg-card hover:border-primary active:scale-95 transition min-h-[140px]"
                >
                  <m.icon className="h-10 w-10 text-primary" />
                  <span className="font-semibold">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- Resumo ----------
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Pagamento
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Total</span>
          <span>{formatBRL(total)}</span>
        </div>
        {remaining > 0.005 ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-amber-600 font-medium">Falta</span>
            <span className="text-2xl font-bold text-amber-600">{formatBRL(remaining)}</span>
          </div>
        ) : change > 0.005 ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-emerald-600 font-medium">Troco</span>
            <span className="text-2xl font-bold text-emerald-600">{formatBRL(change)}</span>
          </div>
        ) : paid > 0 ? (
          <div className="text-sm text-emerald-600 font-medium text-center py-1">
            Pago integralmente
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-1">
            Adicione um pagamento
          </div>
        )}
      </div>

      {payments.length > 0 && (
        <div className="space-y-2">
          {payments.map((p, idx) => {
            const meta = METHODS.find((m) => m.key === p.method)!;
            return (
              <div
                key={idx}
                className="flex items-center gap-2 p-3 rounded-lg border bg-card"
              >
                <meta.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium flex-1">{meta.label}</span>
                <span className="font-semibold">{formatBRL(p.amount)}</span>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeLine(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {remaining > 0.005 && (
        <Button
          variant="outline"
          size="lg"
          className="w-full h-14 text-base"
          onClick={openWizard}
          disabled={total <= 0}
        >
          <Plus className="h-5 w-5" />
          Adicionar pagamento
        </Button>
      )}
    </div>
  );
}

export function isSplitValid(total: number, payments: PaymentLine[]) {
  if (payments.length === 0) return false;
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const dinheiro = payments.filter((p) => p.method === "dinheiro").reduce((s, p) => s + p.amount, 0);
  const others = paid - dinheiro;
  if (others > total + 0.005) return false;
  return paid + 0.005 >= total;
}

export function dominantMethod(payments: PaymentLine[]): PaymentMethod {
  if (payments.length === 0) return "dinheiro";
  const sums: Record<string, number> = {};
  payments.forEach((p) => (sums[p.method] = (sums[p.method] ?? 0) + p.amount));
  return Object.entries(sums).sort((a, b) => b[1] - a[1])[0][0] as PaymentMethod;
}
