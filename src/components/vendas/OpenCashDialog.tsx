import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpened: () => void;
}

export function OpenCashDialog({ open, onOpenChange, onOpened }: Props) {
  const [amount, setAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [eventId, setEventId] = useState<string>("none");
  const [loading, setLoading] = useState(false);

  // Eventos do dia (status upcoming/live), ordenados pela data
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

  // Pré-seleciona o único evento do dia (operador ainda confirma)
  useEffect(() => {
    if (open && todayEvents.length === 1 && eventId === "none") {
      setEventId(todayEvents[0].id);
    }
  }, [open, todayEvents, eventId]);

  const submit = async () => {
    setLoading(true);
    try {
      const v = parseFloat(amount.replace(",", ".")) || 0;
      const { error } = await supabase.rpc("open_cash_session", {
        _opening: v,
        _notes: notes || undefined,
        _event_id: eventId === "none" ? undefined : eventId,
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
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Abrir caixa</DialogTitle>
          <DialogDescription>Confirme o evento de hoje e o valor inicial em dinheiro (troco) para iniciar seu turno.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Evento</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
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
              <p className="text-xs text-muted-foreground mt-1">Nenhum evento programado para hoje.</p>
            )}
          </div>
          <div>
            <Label>Valor inicial (R$)</Label>
            <Input type="number" inputMode="decimal" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
