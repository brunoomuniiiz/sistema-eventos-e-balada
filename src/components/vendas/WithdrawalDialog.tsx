import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDownToLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthorizationDialog } from "@/components/AuthorizationDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}

export function WithdrawalDialog({ open, onOpenChange, onDone }: Props) {
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState("");
  const [auth, setAuth] = useState(false);
  const [loading, setLoading] = useState(false);

  const start = () => {
    if (amount <= 0) return toast.error("Valor inválido");
    if (!reason.trim()) return toast.error("Descreva o motivo");
    setAuth(true);
  };

  const onApproved = async (token: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc("register_withdrawal", { _amount: amount, _reason: reason, _grant_token: token });
      if (error) throw error;
      toast.success("Sangria registrada");
      setAmount(0); setReason("");
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowDownToLine className="h-5 w-5 text-primary" /> Sangria</DialogTitle>
            <DialogDescription>Retirada de dinheiro do caixa. Requer autorização do responsável.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Valor</Label>
              <CurrencyInput value={amount} onChange={setAmount} autoFocus />
            </div>
            <div>
              <Label>Motivo / observação</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Ex: pagamento de fornecedor, despesa do bar..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={start} disabled={loading}>Pedir autorização</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AuthorizationDialog
        open={auth}
        onOpenChange={setAuth}
        scope="withdrawal"
        title="Autorizar sangria"
        description="Quem libera deve digitar o e-mail e senha."
        onApproved={(t) => onApproved(t)}
      />
    </>
  );
}
