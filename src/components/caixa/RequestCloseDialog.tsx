import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { SectorKey } from "@/hooks/useSectorCash";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sector: SectorKey;
};

export function RequestCloseDialog({ open, onOpenChange, sector }: Props) {
  const [din, setDin] = useState(0);
  const [deb, setDeb] = useState(0);
  const [cre, setCre] = useState(0);
  const [pix, setPix] = useState(0);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("request_close_sector", {
        _sector: sector,
        _declared: { dinheiro: din, debito: deb, credito: cre, pix: pix },
      });
      if (error) throw error;
      toast.success("Fechamento solicitado. Aguardando gerente.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar fechamento (cego)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Declare os totais por forma de pagamento. O gerente confere e fecha.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Dinheiro</Label>
              <CurrencyInput value={din} onChange={setDin} />
            </div>
            <div>
              <Label>Débito</Label>
              <CurrencyInput value={deb} onChange={setDeb} />
            </div>
            <div>
              <Label>Crédito</Label>
              <CurrencyInput value={cre} onChange={setCre} />
            </div>
            <div>
              <Label>Pix</Label>
              <CurrencyInput value={pix} onChange={setPix} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Enviando…" : "Enviar para o gerente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
