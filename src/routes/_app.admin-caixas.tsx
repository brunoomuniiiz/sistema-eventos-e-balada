import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSectorStatuses, type SectorRow } from "@/hooks/useSectorCash";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, Lock, Hourglass, Wallet, LockKeyhole } from "lucide-react";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_app/admin-caixas")({
  component: AdminCaixasPage,
});

function AdminCaixasPage() {
  const { isOwner, can, loading } = usePermissions();
  const { data: rows = [], isLoading } = useSectorStatuses();

  if (loading) return null;
  if (!(isOwner || can("financeiro"))) {
    return <PageHeader title="Caixas" subtitle="Apenas o gerente pode acessar esta página" />;
  }

  const bar = rows.find((r) => r.sector === "bar");
  const portaria = rows.find((r) => r.sector === "portaria");

  return (
    <div className="space-y-6">
      <PageHeader title="Controle de Caixas" subtitle="Autorize abertura e fechamento dos setores em tempo real" />
      {isLoading && <Card className="p-6 text-muted-foreground">Carregando…</Card>}
      <div className="grid md:grid-cols-2 gap-4">
        {bar && <SectorCard row={bar} label="Bar" />}
        {portaria && <SectorCard row={portaria} label="Portaria" />}
      </div>
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

  const call = async (fn: "authorize_open_sector" | "force_open_sector" | "force_close_sector" | "confirm_close_sector", args: Record<string, unknown>) => {
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
      <div className="flex items-center gap-3">
        <Wallet className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <div className="font-display font-bold text-lg">Caixa do {label}</div>
          <div className="text-xs text-muted-foreground">
            {row.requested_by_name && `Solicitado por ${row.requested_by_name}`}
            {row.authorized_by_name && isOpen && ` · Aberto por ${row.authorized_by_name}`}
          </div>
        </div>
        {statusBadge(row.status)}
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
            onClick={() => call(isAwaitingOpen ? "authorize_open_sector" : "force_open_sector",
              isAwaitingOpen
                ? { _sector: row.sector, _opening_amount: opening, _notes: null }
                : { _sector: row.sector, _opening_amount: opening }
            )}
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
    </Card>
  );
}
