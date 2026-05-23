import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSectorStatuses, type SectorRow } from "@/hooks/useSectorCash";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, Lock, Hourglass, Wallet, LockKeyhole, ArrowDownToLine, Plus } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AuthorizationDialog } from "@/components/AuthorizationDialog";

export function CaixasAdminPanel() {
  const { isOwner, can } = usePermissions();
  const { data: rows = [], isLoading } = useSectorStatuses();

  if (!(isOwner || can("financeiro"))) {
    return <Card><CardContent className="p-6 text-muted-foreground">Apenas o dono ou gerente pode acessar.</CardContent></Card>;
  }

  const bar = rows.find((r) => r.sector === "bar");
  const portaria = rows.find((r) => r.sector === "portaria");

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <h3 className="font-display font-bold text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> Caixas dos setores
          </h3>
          <p className="text-xs text-muted-foreground">
            Autorize abertura/fechamento e faça sangrias remotamente. O dinheiro precisa estar fisicamente na gaveta.
          </p>
        </CardContent>
      </Card>

      {isLoading && <Card><CardContent className="p-6 text-muted-foreground">Carregando…</CardContent></Card>}

      <div className="grid lg:grid-cols-2 gap-4">
        {bar && <SectorCard row={bar} label="Bar" />}
        {portaria && <SectorCard row={portaria} label="Portaria" />}
      </div>

      <RemoteWithdrawalsList />
    </div>
  );
}

function statusBadge(status: SectorRow["status"]) {
  switch (status) {
    case "open":
      return <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30"><ShieldCheck className="h-3 w-3 mr-1" />Aberto</Badge>;
    case "closed":
      return <Badge variant="outline"><Lock className="h-3 w-3 mr-1" />Fechado</Badge>;
    case "awaiting_open":
      return <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 animate-pulse"><Hourglass className="h-3 w-3 mr-1" />Aguardando abertura</Badge>;
    case "awaiting_close":
      return <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 animate-pulse"><Hourglass className="h-3 w-3 mr-1" />Aguardando fechamento</Badge>;
  }
}

function SectorCard({ row, label }: { row: SectorRow; label: string }) {
  const [opening, setOpening] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sangriaOpen, setSangriaOpen] = useState(false);

  const call = async (
    fn: "authorize_open_sector" | "force_open_sector" | "force_close_sector" | "confirm_close_sector",
    args: Record<string, unknown>,
  ) => {
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)(fn, args);
      if (error) throw error;
      toast.success("Atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  const isAwaitingOpen = row.status === "awaiting_open";
  const isAwaitingClose = row.status === "awaiting_close";
  const isOpen = row.status === "open";
  const isClosed = row.status === "closed";
  const declared = row.close_declared ?? null;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Wallet className="h-5 w-5 text-primary mt-1 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-lg leading-tight">Caixa do {label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {row.requested_by_name && `Solicitado por ${row.requested_by_name}`}
            {row.authorized_by_name && isOpen && ` · Aberto por ${row.authorized_by_name}`}
          </div>
        </div>
        <div className="shrink-0">{statusBadge(row.status)}</div>
      </div>

      {isOpen && (
        <div className="text-sm text-muted-foreground">
          Fundo de caixa: <span className="font-medium text-foreground">{formatBRL(Number(row.opening_amount))}</span>
        </div>
      )}

      {(isClosed || isAwaitingOpen) && (
        <div className="space-y-2 border-t pt-4">
          <Label>Fundo de caixa (R$)</Label>
          <CurrencyInput value={opening} onChange={setOpening} />
          <Button
            className="w-full"
            disabled={busy}
            onClick={() =>
              call(
                isAwaitingOpen ? "authorize_open_sector" : "force_open_sector",
                isAwaitingOpen
                  ? { _sector: row.sector, _opening_amount: opening, _notes: null }
                  : { _sector: row.sector, _opening_amount: opening },
              )
            }
          >
            <ShieldCheck className="h-4 w-4 mr-1" />
            {isAwaitingOpen ? "Autorizar abertura" : "Abrir caixa agora"}
          </Button>
        </div>
      )}

      {isAwaitingClose && declared && (
        <div className="space-y-2 border-t pt-4">
          <div className="text-sm font-medium">Valores declarados pelo funcionário:</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Dinheiro: <strong>{formatBRL(Number(declared.dinheiro ?? 0))}</strong></div>
            <div>Débito: <strong>{formatBRL(Number(declared.debito ?? 0))}</strong></div>
            <div>Crédito: <strong>{formatBRL(Number(declared.credito ?? 0))}</strong></div>
            <div>Pix: <strong>{formatBRL(Number(declared.pix ?? 0))}</strong></div>
          </div>
        </div>
      )}

      {isOpen && (
        <Button variant="outline" className="w-full" onClick={() => setSangriaOpen(true)}>
          <ArrowDownToLine className="h-4 w-4 mr-1" /> Fazer sangria remota
        </Button>
      )}

      {(isOpen || isAwaitingClose) && (
        <Button
          variant={isAwaitingClose ? "default" : "outline"}
          className="w-full"
          disabled={busy}
          onClick={() => call(isAwaitingClose ? "confirm_close_sector" : "force_close_sector", { _sector: row.sector })}
        >
          <LockKeyhole className="h-4 w-4 mr-1" />
          {isAwaitingClose ? "Confirmar e fechar caixa" : "Fechar caixa agora"}
        </Button>
      )}

      <RemoteSangriaDialog
        open={sangriaOpen}
        onOpenChange={setSangriaOpen}
        sectorLabel={label}
        sectorOperatorId={row.requested_by ?? row.authorized_by ?? null}
      />
    </Card>
  );
}

function RemoteSangriaDialog({
  open, onOpenChange, sectorLabel, sectorOperatorId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sectorLabel: string;
  sectorOperatorId: string | null;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [auth, setAuth] = useState(false);
  const [busy, setBusy] = useState(false);

  // Encontra a sessão de caixa aberta (qualquer funcionário) ligada ao operador do setor.
  const { data: openSession } = useQuery({
    queryKey: ["open-session-for-sector", sectorOperatorId],
    enabled: open && !!sectorOperatorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_sessions")
        .select("id, opened_by, opened_by_name, opened_at")
        .eq("opened_by", sectorOperatorId!)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const start = () => {
    if (amount <= 0) { toast.error("Valor inválido"); return; }
    if (!reason.trim()) { toast.error("Descreva o motivo"); return; }
    if (!openSession?.id) { toast.error("Nenhuma sessão de caixa aberta nesse setor"); return; }
    setAuth(true);
  };

  const onApproved = async (token: string) => {
    if (!openSession?.id) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("register_withdrawal_for_session" as never, {
        _session_id: openSession.id,
        _amount: amount,
        _reason: reason,
        _grant_token: token,
      } as never);
      if (error) throw error;
      toast.success("Sangria registrada");
      setAmount(0); setReason("");
      qc.invalidateQueries({ queryKey: ["remote-withdrawals"] });
      qc.invalidateQueries({ queryKey: ["live-dashboard"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setBusy(false); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-primary" /> Sangria remota — {sectorLabel}
            </DialogTitle>
            <DialogDescription>
              Você precisa se autorizar (e-mail + senha do dono) e o dinheiro precisa estar fisicamente na gaveta do setor.
            </DialogDescription>
          </DialogHeader>
          {!openSession ? (
            <p className="text-sm text-destructive">Nenhuma sessão de caixa aberta neste setor.</p>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Operador no local: <strong className="text-foreground">{openSession.opened_by_name ?? "—"}</strong>
              </div>
              <div>
                <Label>Valor</Label>
                <CurrencyInput value={amount} onChange={setAmount} autoFocus />
              </div>
              <div>
                <Label>Motivo / observação</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                  placeholder="Ex: pagamento de fornecedor, troco, despesa do bar..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={start} disabled={busy || !openSession}>Pedir autorização</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AuthorizationDialog
        open={auth}
        onOpenChange={setAuth}
        scope="withdrawal"
        title="Autorizar sangria"
        description="Digite o e-mail e senha do dono para liberar."
        onApproved={(t) => onApproved(t)}
      />
    </>
  );
}

function RemoteWithdrawalsList() {
  const { ownerId } = usePermissions();

  const { data: withdrawals = [] } = useQuery({
    queryKey: ["remote-withdrawals", ownerId],
    enabled: !!ownerId,
    refetchInterval: 15000,
    queryFn: async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("cash_withdrawals")
        .select("id, amount, reason, created_at, created_by_name, authorized_by_name")
        .eq("user_id", ownerId!)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = withdrawals.reduce((s, w) => s + Number(w.amount), 0);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display font-bold flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-primary" /> Sangrias de hoje
          </h3>
          <span className="text-sm font-semibold">{formatBRL(total)}</span>
        </div>
        {withdrawals.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma sangria registrada hoje.</p>
        ) : (
          <div className="divide-y border rounded-lg">
            {withdrawals.map((w) => (
              <div key={w.id} className="p-3 text-sm flex items-start gap-3">
                <Plus className="h-3 w-3 rotate-45 text-destructive mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{formatBRL(Number(w.amount))}</div>
                  {w.reason && <div className="text-xs text-muted-foreground">{w.reason}</div>}
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Feita por <strong>{w.created_by_name ?? "—"}</strong> · Autorizada por{" "}
                    <strong>{w.authorized_by_name ?? "—"}</strong>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {format(new Date(w.created_at), "dd/MM HH:mm", { locale: ptBR })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
