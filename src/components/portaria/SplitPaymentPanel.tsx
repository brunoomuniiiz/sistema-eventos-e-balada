import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Banknote, CreditCard, Smartphone, QrCode, X, Check } from "lucide-react";
import { formatBRL } from "@/lib/format";

export type PaymentMethod = "dinheiro" | "debito" | "credito" | "pix";

export type SplitLine = {
  key: string;
  method: PaymentMethod;
  amount: number;
};

const METHODS: { k: PaymentMethod; l: string; icon: typeof Banknote }[] = [
  { k: "dinheiro", l: "Dinheiro", icon: Banknote },
  { k: "debito",   l: "Débito",   icon: CreditCard },
  { k: "credito",  l: "Crédito",  icon: CreditCard },
  { k: "pix",      l: "Pix",      icon: QrCode },
];

interface Props {
  total: number;
  accepted: PaymentMethod[];
  payments: SplitLine[];
  setPayments: (p: SplitLine[]) => void;
  onPixRequested: (amount: number) => void; // dispara o PixQrDialog externo
}

export function SplitPaymentPanel({ total, accepted, payments, setPayments, onPixRequested }: Props) {
  const paid = useMemo(() => payments.reduce((s, p) => s + p.amount, 0), [payments]);
  const remaining = Math.max(0, +(total - paid).toFixed(2));

  const [picking, setPicking] = useState<PaymentMethod | null>(null);
  const [inputAmount, setInputAmount] = useState("");

  const startPick = (m: PaymentMethod) => {
    setPicking(m);
    setInputAmount(remaining.toFixed(2));
  };

  const confirmPick = () => {
    if (!picking) return;
    const v = Number((inputAmount || "0").replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return;
    const amt = Math.min(v, remaining);
    if (picking === "pix") {
      onPixRequested(amt);
    } else {
      setPayments([...payments, { key: `${picking}-${Date.now()}`, method: picking, amount: amt }]);
    }
    setPicking(null);
    setInputAmount("");
  };

  const removeLine = (key: string) =>
    setPayments(payments.filter((p) => p.key !== key));

  const methodsAvailable = METHODS.filter((m) => accepted.includes(m.k));

  return (
    <div className="space-y-3">
      <Card className="bg-card/70">
        <CardContent className="p-4 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{formatBRL(total)}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase text-muted-foreground">Falta</div>
            <div className={`text-2xl font-bold ${remaining <= 0 ? "text-emerald-500" : "text-amber-400"}`}>
              {formatBRL(remaining)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Linhas de pagamento */}
      {payments.length > 0 && (
        <div className="space-y-1.5">
          {payments.map((p) => {
            const M = METHODS.find((m) => m.k === p.method)!;
            const Icon = M.icon;
            return (
              <div key={p.key} className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="font-medium">{M.l}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{formatBRL(p.amount)}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeLine(p.key)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Seletor de método */}
      {remaining > 0 && (
        picking ? (
          <Card className="border-primary/40">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">{METHODS.find((m) => m.k === picking)!.l}</Badge>
                <span className="text-muted-foreground">Quanto nesse?</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  step="0.50"
                  value={inputAmount}
                  onChange={(e) => setInputAmount(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmPick(); }}
                  className="h-12 text-lg flex-1"
                />
                <Button onClick={confirmPick} className="h-12">
                  <Check className="h-4 w-4" /> OK
                </Button>
                <Button onClick={() => { setPicking(null); setInputAmount(""); }} variant="ghost" className="h-12">
                  Cancelar
                </Button>
              </div>
              <div className="flex gap-1.5 text-xs">
                {[0.25, 0.5, 1].map((f) => (
                  <button
                    key={f}
                    onClick={() => setInputAmount((remaining * f).toFixed(2))}
                    className="px-2 py-1 rounded border border-border hover:border-primary/60 text-muted-foreground"
                  >
                    {f === 1 ? "Tudo" : `${f * 100}%`}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {methodsAvailable.map((m) => {
              const Icon = m.icon;
              return (
                <Button
                  key={m.k}
                  variant="outline"
                  onClick={() => startPick(m.k)}
                  className="h-16 flex-col gap-1"
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs">{m.l}</span>
                </Button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
