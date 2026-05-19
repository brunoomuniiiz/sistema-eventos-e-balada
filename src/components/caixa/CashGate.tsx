import { ReactNode } from "react";
import { useSectorStatus, type SectorKey } from "@/hooks/useSectorCash";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, ShieldCheck, Hourglass, LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { RequestCloseDialog } from "./RequestCloseDialog";

type Props = {
  sector: SectorKey;
  sectorLabel: string;
  children: ReactNode;
};

export function CashGate({ sector, sectorLabel, children }: Props) {
  const { row, isLoading } = useSectorStatus(sector);
  const [busy, setBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  if (isLoading || !row) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        Carregando estado do caixa…
      </Card>
    );
  }

  const requestOpen = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("request_open_sector", { _sector: sector });
      if (error) throw error;
      toast.success("Solicitação enviada ao gerente");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  if (row.status === "closed") {
    return (
      <Card className="p-8 text-center space-y-4 max-w-md mx-auto mt-8">
        <Lock className="h-12 w-12 mx-auto text-muted-foreground" />
        <div>
          <h2 className="text-xl font-display font-bold">Caixa do {sectorLabel} fechado</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Solicite a abertura ao gerente para começar.
          </p>
        </div>
        <Button onClick={requestOpen} disabled={busy} className="w-full">
          {busy ? "Enviando…" : "Solicitar abertura ao gerente"}
        </Button>
      </Card>
    );
  }

  if (row.status === "awaiting_open") {
    return (
      <Card className="p-8 text-center space-y-4 max-w-md mx-auto mt-8 border-amber-500/40 bg-amber-500/5">
        <Hourglass className="h-12 w-12 mx-auto text-amber-500 animate-pulse" />
        <div>
          <h2 className="text-xl font-display font-bold">Aguardando autorização do gerente</h2>
          <p className="text-sm text-muted-foreground mt-1">
            O gerente precisa autorizar a abertura do Caixa do {sectorLabel}.
          </p>
          {row.requested_at && (
            <p className="text-xs text-muted-foreground mt-2">
              Solicitado em {new Date(row.requested_at).toLocaleTimeString()}
            </p>
          )}
        </div>
      </Card>
    );
  }

  if (row.status === "awaiting_close") {
    return (
      <Card className="p-8 text-center space-y-4 max-w-md mx-auto mt-8 border-amber-500/40 bg-amber-500/5">
        <Hourglass className="h-12 w-12 mx-auto text-amber-500 animate-pulse" />
        <div>
          <h2 className="text-xl font-display font-bold">Aguardando gerente confirmar fechamento</h2>
          <p className="text-sm text-muted-foreground mt-1">
            O caixa está travado até o gerente confirmar.
          </p>
        </div>
      </Card>
    );
  }

  // open
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-sm">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <span className="flex-1">
          Caixa do {sectorLabel} aberto pelo gerente {row.authorized_by_name ?? ""} ·{" "}
          Fundo R$ {Number(row.opening_amount).toFixed(2)}
        </span>
        <Button size="sm" variant="outline" onClick={() => setCloseOpen(true)}>
          <LockKeyhole className="h-4 w-4 mr-1" /> Solicitar fechamento
        </Button>
      </div>
      {children}
      <RequestCloseDialog open={closeOpen} onOpenChange={setCloseOpen} sector={sector} />
    </div>
  );
}
