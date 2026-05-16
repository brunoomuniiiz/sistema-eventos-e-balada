import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthorizationDialog } from "@/components/AuthorizationDialog";
import { SessionWithdrawalsCard } from "@/components/vendas/SessionWithdrawalsCard";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}

export function CashClosingDialog({ open, onOpenChange, onDone }: Props) {
  const [din, setDin] = useState(0);
  const [deb, setDeb] = useState(0);
  const [cre, setCre] = useState(0);
  const [pix, setPix] = useState(0);
  const [notes, setNotes] = useState("");
  const [auth, setAuth] = useState(false);
  const [loading, setLoading] = useState(false);

  const start = () => setAuth(true);

  const onApproved = async (token: string) => {
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
      setDin(0); setDeb(0); setCre(0); setPix(0); setNotes("");
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao fechar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-primary" /> Fechamento cego</DialogTitle>
            <DialogDescription>Declare os totais sem ver o esperado. Requer autorização.</DialogDescription>
          </DialogHeader>
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
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={start} disabled={loading}>Pedir autorização</Button>
          </DialogFooter>
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
