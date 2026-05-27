import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Lock, Check, X, Wallet, CreditCard, QrCode, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

type Terminal = {
  terminal_id: string;
  label: string;
  owner_label: string | null;
  mode: string;
  system_total: number;
};
type PixChave = {
  sale_id: string;
  amount: number;
  created_at: string;
  daily_number: number | null;
};
type Breakdown = {
  staff_user_id: string;
  cash_expected: number;
  cash_sales: number;
  opening: number;
  withdrawals: number;
  pix_qr_total: number;
  terminals: Terminal[];
  pix_chave: PixChave[];
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  staffUserId: string;
  staffName: string;
  acceptsCash: boolean;
}

export function StaffClosingSheet({ open, onOpenChange, eventId, staffUserId, staffName, acceptsCash }: Props) {
  const qc = useQueryClient();

  const { data: bd, isLoading } = useQuery({
    queryKey: ["staff-closing-bd", eventId, staffUserId],
    enabled: open && !!eventId && !!staffUserId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_staff_closing_breakdown", {
        _event_id: eventId,
        _staff_user_id: staffUserId,
      });
      if (error) throw error;
      return data as unknown as Breakdown;
    },
  });

  const [cashCounted, setCashCounted] = useState(0);
  const [terminalValues, setTerminalValues] = useState<Record<string, number>>({});
  const [pixChaveStatus, setPixChaveStatus] = useState<Record<string, "received" | "refused">>({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!bd) return;
    setCashCounted(Number(bd.cash_expected) || 0);
    const t: Record<string, number> = {};
    bd.terminals.forEach((x) => (t[x.terminal_id] = Number(x.system_total) || 0));
    setTerminalValues(t);
    const p: Record<string, "received" | "refused"> = {};
    bd.pix_chave.forEach((x) => (p[x.sale_id] = "received"));
    setPixChaveStatus(p);
    setNotes("");
  }, [bd]);

  const cashDiff = useMemo(() => cashCounted - (bd?.cash_expected ?? 0), [cashCounted, bd]);

  const pixChaveTotals = useMemo(() => {
    if (!bd) return { received: 0, refused: 0 };
    let received = 0, refused = 0;
    bd.pix_chave.forEach((x) => {
      if (pixChaveStatus[x.sale_id] === "refused") refused += Number(x.amount);
      else received += Number(x.amount);
    });
    return { received, refused };
  }, [bd, pixChaveStatus]);

  const totalReported = useMemo(() => {
    if (!bd) return 0;
    const termsSum = Object.values(terminalValues).reduce((s, v) => s + v, 0);
    return cashCounted + termsSum + Number(bd.pix_qr_total) + pixChaveTotals.received;
  }, [bd, cashCounted, terminalValues, pixChaveTotals]);

  const totalSystem = useMemo(() => {
    if (!bd) return 0;
    const termsSum = bd.terminals.reduce((s, t) => s + Number(t.system_total), 0);
    return (
      Number(bd.cash_expected) +
      termsSum +
      Number(bd.pix_qr_total) +
      pixChaveTotals.received +
      pixChaveTotals.refused
    );
  }, [bd, pixChaveTotals]);

  const submitMut = useMutation({
    mutationFn: async () => {
      const refunded = Object.entries(pixChaveStatus)
        .filter(([, v]) => v === "refused")
        .map(([k]) => k);
      const { data, error } = await supabase.rpc("submit_staff_closing", {
        _event_id: eventId,
        _staff_user_id: staffUserId,
        _cash_counted: acceptsCash ? cashCounted : 0,
        _terminals: Object.entries(terminalValues).map(([terminal_id, reported_total]) => ({
          terminal_id,
          reported_total,
        })),
        _pix_chave_refunded: refunded,
        _notes: notes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`Fechamento de ${staffName} salvo`);
      qc.invalidateQueries({ queryKey: ["event-staff-to-close", eventId] });
      qc.invalidateQueries({ queryKey: ["staff-closing-bd", eventId, staffUserId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">Fechar {staffName}</SheetTitle>
          <SheetDescription>O relatório da maquininha é a verdade — ele sobrescreve o faturamento.</SheetDescription>
        </SheetHeader>

        {isLoading || !bd ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 mt-4">
            {/* Dinheiro */}
            {acceptsCash && (
              <section className="rounded-lg border bg-card/40 p-4 space-y-3">
                <div className="flex items-center gap-2 font-semibold">
                  <Wallet className="h-4 w-4 text-primary" /> Dinheiro
                </div>
                <div className="text-xs text-muted-foreground grid grid-cols-3 gap-2">
                  <div>Abertura<div className="font-mono text-foreground">{formatBRL(bd.opening)}</div></div>
                  <div>Vendas dinheiro<div className="font-mono text-foreground">{formatBRL(bd.cash_sales)}</div></div>
                  <div>Sangrias<div className="font-mono text-foreground">− {formatBRL(bd.withdrawals)}</div></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Esperado</Label>
                    <div className="h-10 rounded-md border bg-muted/40 px-3 flex items-center font-mono">
                      {formatBRL(bd.cash_expected)}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Contado na gaveta</Label>
                    <CurrencyInput value={cashCounted} onChange={setCashCounted} />
                  </div>
                </div>
                <div className={cn(
                  "text-xs rounded-md px-3 py-2",
                  Math.abs(cashDiff) < 0.005 && "bg-emerald-500/10 text-emerald-500",
                  cashDiff > 0.005 && "bg-emerald-500/10 text-emerald-500",
                  cashDiff < -0.005 && "bg-destructive/10 text-destructive",
                )}>
                  Diferença: {cashDiff > 0 ? "+" : ""}{formatBRL(cashDiff)} {cashDiff !== 0 && "(vai pro faturamento)"}
                </div>
              </section>
            )}

            {/* Maquininhas */}
            {bd.terminals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 font-semibold">
                  <CreditCard className="h-4 w-4 text-primary" /> Maquininhas
                </div>
                {bd.terminals.map((t) => {
                  const reported = terminalValues[t.terminal_id] ?? 0;
                  const diff = reported - Number(t.system_total);
                  return (
                    <div key={t.terminal_id} className="rounded-lg border bg-card/40 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-medium text-sm">{t.label}</div>
                          {t.owner_label && (
                            <div className="text-[11px] text-muted-foreground">CNPJ: {t.owner_label}</div>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {t.mode === "mp_integrated" ? "MP integrada" : "Manual"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[11px] flex items-center gap-1">
                            <Lock className="h-3 w-3" /> Sistema
                          </Label>
                          <div className="h-10 rounded-md border bg-muted/40 px-3 flex items-center font-mono text-sm">
                            {formatBRL(t.system_total)}
                          </div>
                        </div>
                        <div>
                          <Label className="text-[11px]">Relatório (verdade)</Label>
                          <CurrencyInput
                            value={reported}
                            onChange={(v) => setTerminalValues((s) => ({ ...s, [t.terminal_id]: v }))}
                          />
                        </div>
                      </div>
                      {Math.abs(diff) >= 0.005 && (
                        <div className={cn(
                          "text-[11px] rounded px-2 py-1",
                          diff > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500",
                        )}>
                          {diff > 0 ? "+" : ""}{formatBRL(diff)} de ajuste no faturamento
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* PIX QR (auto) */}
            {Number(bd.pix_qr_total) > 0 && (
              <section className="rounded-lg border bg-emerald-500/5 border-emerald-500/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold">
                    <QrCode className="h-4 w-4 text-emerald-500" /> PIX QR (Mercado Pago)
                  </div>
                  <div className="flex items-center gap-2">
                    <Lock className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono">{formatBRL(bd.pix_qr_total)}</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Automático — entra direto no faturamento.</p>
              </section>
            )}

            {/* PIX chave */}
            {bd.pix_chave.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <KeyRound className="h-4 w-4 text-primary" /> PIX chave — confirme 1 a 1
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Marque "Não" para o que NÃO caiu na sua conta — essas vendas serão estornadas.
                </p>
                {bd.pix_chave.map((p) => {
                  const st = pixChaveStatus[p.sale_id] ?? "received";
                  return (
                    <div key={p.sale_id} className={cn(
                      "rounded-lg border p-2 flex items-center gap-3",
                      st === "received" && "bg-card/40",
                      st === "refused" && "bg-destructive/10 border-destructive/40",
                    )}>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm">{formatBRL(p.amount)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.daily_number ? `#${p.daily_number} · ` : ""}
                          {format(new Date(p.created_at), "HH:mm")}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={st === "received" ? "default" : "outline"}
                        onClick={() => setPixChaveStatus((s) => ({ ...s, [p.sale_id]: "received" }))}
                        className={cn(st === "received" && "bg-emerald-600 hover:bg-emerald-600/90")}
                      >
                        <Check className="h-4 w-4" /> Recebi
                      </Button>
                      <Button
                        size="sm"
                        variant={st === "refused" ? "destructive" : "outline"}
                        onClick={() => setPixChaveStatus((s) => ({ ...s, [p.sale_id]: "refused" }))}
                      >
                        <X className="h-4 w-4" /> Não
                      </Button>
                    </div>
                  );
                })}
                <div className="text-[11px] text-muted-foreground flex justify-between px-1">
                  <span>Confirmadas: {formatBRL(pixChaveTotals.received)}</span>
                  <span className="text-destructive">Estornar: {formatBRL(pixChaveTotals.refused)}</span>
                </div>
              </section>
            )}

            {/* Observação */}
            <div>
              <Label className="text-xs">Observação (opcional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <Separator />

            {/* Totais */}
            <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sistema (cru)</span>
                <span className="font-mono">{formatBRL(totalSystem)}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Faturamento real</span>
                <span className="font-mono">{formatBRL(totalReported)}</span>
              </div>
              <div className={cn(
                "flex justify-between text-xs",
                totalReported - totalSystem > 0 && "text-emerald-500",
                totalReported - totalSystem < 0 && "text-destructive",
              )}>
                <span>Diferença</span>
                <span className="font-mono">
                  {totalReported - totalSystem > 0 ? "+" : ""}{formatBRL(totalReported - totalSystem)}
                </span>
              </div>
            </div>

            <Button
              className="w-full h-12 text-base"
              onClick={() => submitMut.mutate()}
              disabled={submitMut.isPending}
            >
              {submitMut.isPending ? "Salvando..." : "Confirmar fechamento"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
