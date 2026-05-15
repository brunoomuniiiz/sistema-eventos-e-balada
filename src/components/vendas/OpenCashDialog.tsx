import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpened: () => void;
}

export function OpenCashDialog({ open, onOpenChange, onOpened }: Props) {
  const [amount, setAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const v = parseFloat(amount.replace(",", ".")) || 0;
      const { error } = await supabase.rpc("open_cash_session", { _opening: v, _notes: notes || undefined });
      if (error) throw error;
      toast.success("Caixa aberto");
      onOpened();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao abrir caixa");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Abrir caixa</DialogTitle>
          <DialogDescription>Informe o valor inicial em dinheiro (troco) para iniciar seu turno.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Valor inicial (R$)</Label>
            <Input type="number" inputMode="decimal" step="0.01" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Observação (opcional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: troco fornecido pelo gerente" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Abrindo..." : "Abrir caixa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
