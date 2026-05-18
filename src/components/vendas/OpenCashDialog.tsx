import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, CalendarDays, Check, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpened: () => void;
}

export function OpenCashDialog({ open, onOpenChange, onOpened }: Props) {
  const { canSellCash } = usePermissions();
  const [step, setStep] = useState<1 | 2>(1);
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [eventId, setEventId] = useState<string>("none");
  const [loading, setLoading] = useState(false);

  const { data: todayEvents = [] } = useQuery({
    queryKey: ["open-cash-today-events"],
    enabled: open,
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status")
        .in("status", ["upcoming", "live", "ongoing"])
        .gte("date", start.toISOString())
        .lte("date", end.toISOString())
        .order("date");
      if (error) throw error;
      return data as { id: string; name: string; date: string; status: string }[];
    },
  });

  useEffect(() => {
    if (open) {
      setStep(1);
      if (todayEvents.length >= 1) setEventId(todayEvents[0].id);
      else setEventId("none");
    }
  }, [open, todayEvents]);

  const submit = async () => {
    setLoading(true);
    try {
      const v = canSellCash ? amount : 0;
      const { error } = await supabase.rpc("open_cash_session", {
        _opening: v,
        _notes: notes || undefined,
        _event_id: eventId === "none" ? null : eventId,
      });
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
          <DialogTitle className="flex items-center gap-2">
            {step === 1 ? <><CalendarDays className="h-5 w-5 text-primary" /> Confirmar evento</> : <><Wallet className="h-5 w-5 text-primary" /> Abrir caixa</>}
          </DialogTitle>
          <DialogDescription>
            {step === 1 ? "Confirme o evento de hoje para iniciar seu turno." : canSellCash ? "Informe o valor inicial em dinheiro (troco)." : "Você não opera dinheiro — o caixa abre em R$ 0,00."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <Label className="text-xs">Evento de hoje</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem evento (bar normal)</SelectItem>
                {todayEvents.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} · {new Date(e.date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {todayEvents.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum evento programado para hoje.</p>
            )}
            <DialogFooter>
              <Button className="w-full" onClick={() => setStep(2)}>
                <Check className="h-4 w-4" /> Confirmar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {canSellCash ? (
              <>
                <div>
                  <Label>Valor inicial</Label>
                  <CurrencyInput value={amount} onChange={setAmount} autoFocus />
                </div>
                <div>
                  <Label>Observação (opcional)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: troco fornecido pelo gerente" />
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2 p-3 rounded-lg border bg-card/60 text-sm">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>Sem operação em dinheiro nesta conta. O caixa abre em R$ 0,00 e você opera apenas débito, crédito e pix.</span>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button>
              <Button onClick={submit} disabled={loading} className="flex-1">
                {loading ? "Abrindo..." : "Abrir caixa"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
