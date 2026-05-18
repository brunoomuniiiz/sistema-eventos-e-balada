import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LockKeyhole, AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthorizationDialog } from "@/components/AuthorizationDialog";
import { SessionWithdrawalsCard } from "@/components/vendas/SessionWithdrawalsCard";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}

type Expected = {
  opening_amount: number;
  withdrawals_total: number;
  sales_count: number;
  sales_total: number;
  expected_dinheiro: number;
  expected_debito: number;
  expected_credito: number;
  expected_pix: number;
};

export function CashClosingDialog({ open, onOpenChange, onDone }: Props) {
  const [step, setStep] = useState<1 | 3>(1);
  const [din, setDin] = useState(0);
  const [deb, setDeb] = useState(0);
  const [cre, setCre] = useState(0);
  const [pix, setPix] = useState(0);
  const [notes, setNotes] = useState("");
  const [auth, setAuth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [expected, setExpected] = useState<Expected | null>(null);

  const reset = () => {
    setStep(1); setDin(0); setDeb(0); setCre(0); setPix(0);
    setNotes(""); setToken(null); setExpected(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const askAuth = () => setAuth(true);

  const onApproved = async (grantToken: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_session_expected_totals");
      if (error) throw error;
      setExpected(data as unknown as Expected);
      setToken(grantToken);
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar totais");
    } finally {
      setLoading(false);
    }
  };

  const confirmClose = async () => {
    if (!token) return toast.error("Autorização expirada, peça novamente");
    setLoading(true);
    try {
      const { error } = await supabase.rpc("close_cash_blind", {
        _declared_dinheiro: din,
        _declared_debito: deb,
        _declared_credito: cre,
        _declared_pix: pix,
        _grant_token: token,
        _notes: notes || undefined,
      });
      if (error) throw error;
      toast.success("Caixa fechado");
      reset();
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao fechar");
      // If token consumed/expired, force going back to step 1
      setToken(null);
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockKeyhole className="h-5 w-5 text-primary" />
              {step === 1 ? "Fechamento cego" : "Revisar fechamento"}
            </DialogTitle>
            <DialogDescription>
              {step === 1
                ? "Declare os totais sem ver o esperado. Requer autorização."
                : "Confira as diferenças antes de confirmar o fechamento."}
            </DialogDescription>
          </DialogHeader>

          {step === 1 && (
            <>
              <SessionWithdrawalsCard />
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Dinheiro</Label><CurrencyInput value={din} onChange={setDin} /></div>
                <div><Label>Débito</Label><CurrencyInput value={deb} onChange={setDeb} /></div>
                <div><Label>Crédito</Label><CurrencyInput value={cre} onChange={setCre} /></div>
                <div><Label>Pix</Label><CurrencyInput value={pix} onChange={setPix} /></div>
              </div>
              <div>
                <Label>Observação</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => handleClose(false)}>Cancelar</Button>
                <Button onClick={askAuth} disabled={loading}>Pedir autorização</Button>
              </DialogFooter>
            </>
          )}

          {step === 3 && expected && (
            <ReviewStep
              expected={expected}
              declared={{ din, deb, cre, pix }}
              onBack={() => setStep(1)}
              onConfirm={confirmClose}
              loading={loading}
            />
          )}
        </DialogContent>
      </Dialog>
      <AuthorizationDialog
        open={auth} onOpenChange={setAuth} scope="closing"
        title="Autorizar fechamento" description="Responsável digita e-mail e senha."
        onApproved={(t) => onApproved(t)}
      />
    </>
  );
}

function ReviewStep({
  expected, declared, onBack, onConfirm, loading,
}: {
  expected: Expected;
  declared: { din: number; deb: number; cre: number; pix: number };
  onBack: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const rows = [
    { key: "din", label: "Dinheiro", exp: Number(expected.expected_dinheiro), dec: declared.din, strict: true },
    { key: "deb", label: "Débito",   exp: Number(expected.expected_debito),   dec: declared.deb, strict: false },
    { key: "cre", label: "Crédito",  exp: Number(expected.expected_credito),  dec: declared.cre, strict: false },
    { key: "pix", label: "Pix",      exp: Number(expected.expected_pix),      dec: declared.pix, strict: false },
  ];

  const cashDiff = declared.din - Number(expected.expected_dinheiro);
  const cashOk = Math.abs(cashDiff) < 0.005;
  const anyShortage = rows.some((r) => !r.strict && r.dec - r.exp < -0.005);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card/60 p-3 text-xs space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Abertura</span><span>{formatBRL(expected.opening_amount)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Sangrias</span><span>− {formatBRL(expected.withdrawals_total)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Vendas ({expected.sales_count})</span><span>{formatBRL(expected.sales_total)}</span></div>
      </div>

      <div className="space-y-2">
        {rows.map((r) => {
          const diff = r.dec - r.exp;
          const isExact = Math.abs(diff) < 0.005;
          const isShortage = diff < -0.005;
          const isSurplus = diff > 0.005;
          let tone: "ok" | "warn" | "bad" = "ok";
          let msg: string | null = null;
          if (r.strict) {
            if (!isExact) { tone = "bad"; msg = "O dinheiro precisa estar correto."; }
          } else {
            if (isShortage) { tone = "bad"; msg = `Faltando ${formatBRL(-diff)} — verifique antes de confirmar.`; }
            else if (isSurplus) { tone = "warn"; msg = `Sobrando ${formatBRL(diff)}.`; }
          }
          return (
            <div key={r.key} className={cn(
              "rounded-lg border p-3",
              tone === "ok" && "border-border bg-card/40",
              tone === "warn" && "border-amber-500/40 bg-amber-500/5",
              tone === "bad" && "border-destructive/50 bg-destructive/10",
            )}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{r.label}</span>
                {tone === "ok" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {tone !== "ok" && <AlertTriangle className={cn("h-4 w-4", tone === "bad" ? "text-destructive" : "text-amber-500")} />}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><div className="text-muted-foreground">Esperado</div><div className="font-mono">{formatBRL(r.exp)}</div></div>
                <div><div className="text-muted-foreground">Declarado</div><div className="font-mono">{formatBRL(r.dec)}</div></div>
                <div>
                  <div className="text-muted-foreground">Diferença</div>
                  <div className={cn(
                    "font-mono",
                    isExact && "text-muted-foreground",
                    isSurplus && "text-emerald-600 dark:text-emerald-400",
                    isShortage && "text-destructive",
                  )}>
                    {isExact ? formatBRL(0) : (diff > 0 ? "+" : "") + formatBRL(diff)}
                  </div>
                </div>
              </div>
              {msg && <p className={cn("text-xs mt-2", tone === "bad" ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>{msg}</p>}
            </div>
          );
        })}
      </div>

      {(!cashOk || anyShortage) && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          Existem diferenças que precisam ser revisadas. Você ainda pode confirmar, mas o registro mostrará a discrepância.
        </div>
      )}

      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={onBack} disabled={loading}>
          <ArrowLeft className="h-4 w-4" /> Voltar e corrigir
        </Button>
        <Button onClick={onConfirm} disabled={loading} className="flex-1">
          {loading ? "Fechando..." : "Confirmar fechamento"}
        </Button>
      </DialogFooter>
    </div>
  );
}
