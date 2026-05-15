import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthorizationDialog } from "@/components/AuthorizationDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}

export function CashClosingDialog({ open, onOpenChange, onDone }: Props) {
  const [din, setDin] = useState("");
  const [deb, setDeb] = useState("");
  const [cre, setCre] = useState("");
  const [pix, setPix] = useState("");
  const [notes, setNotes] = useState("");
  const [auth, setAuth] = useState(false);
  const [loading, setLoading] = useState(false);

  const num = (s: string) => parseFloat(s.replace(",", ".")) || 0;

  const start = () => setAuth(true);

  const onApproved = async (token: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc("close_cash_blind", {
        _declared_dinheiro: num(din),
        _declared_debito: num(deb),
        _declared_credito: num(cre),
        _declared_pix: num(pix),
        _grant_token: token,
        _notes: notes || undefined,
      });
      if (error) throw error;
      toast.success("Caixa fechado");
      setDin(""); setDeb(""); setCre(""); setPix(""); setNotes("");
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-primary" /> Fechamento cego</DialogTitle>
            <DialogDescription>Declare os totais sem ver o esperado. Requer autorização.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Dinheiro</Label><Input type="number" step="0.01" value={din} onChange={(e) => setDin(e.target.value)} /></div>
            <div><Label>Débito</Label><Input type="number" step="0.01" value={deb} onChange={(e) => setDeb(e.target.value)} /></div>
            <div><Label>Crédito</Label><Input type="number" step="0.01" value={cre} onChange={(e) => setCre(e.target.value)} /></div>
            <div><Label>Pix</Label><Input type="number" step="0.01" value={pix} onChange={(e) => setPix(e.target.value)} /></div>
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
