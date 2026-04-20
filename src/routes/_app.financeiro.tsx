import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatBRL, calcEventNet, calcEventGross } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type Financial = Database["public"]["Tables"]["event_financials"]["Row"];

export const Route = createFileRoute("/_app/financeiro")({
  component: FinanceiroPage,
});

function FinanceiroPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Financial | null>(null);

  const { data: financials = [] } = useQuery({
    queryKey: ["financials", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("event_financials").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name, date").order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const eventMap = new Map(events.map((e) => [e.id, e]));

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_financials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento removido");
      qc.invalidateQueries({ queryKey: ["financials"] });
    },
  });

  const totalGross = financials.reduce((s, f) => s + calcEventGross(f), 0);
  const totalNet = financials.reduce((s, f) => s + calcEventNet(f), 0);
  const totalExpenses = financials.reduce((s, f) => s + Number(f.expenses ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle="Receitas e despesas dos seus eventos"
        actions={
          <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-gradient-primary text-primary-foreground glow-primary">
            <Plus className="h-4 w-4 mr-1.5" /> Novo lançamento
          </Button>
        }
      />

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
        <Card className="glass border-border/60">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Receita bruta</div>
            <div className="text-lg md:text-2xl font-bold font-display text-success mt-1">{formatBRL(totalGross)}</div>
          </CardContent>
        </Card>
        <Card className="glass border-border/60">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Despesas</div>
            <div className="text-lg md:text-2xl font-bold font-display text-destructive mt-1">{formatBRL(totalExpenses)}</div>
          </CardContent>
        </Card>
        <Card className="glass border-border/60">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Lucro líquido</div>
            <div className="text-lg md:text-2xl font-bold font-display text-primary mt-1">{formatBRL(totalNet)}</div>
          </CardContent>
        </Card>
      </div>

      {financials.length === 0 ? (
        <Card className="glass border-border/60">
          <CardContent className="py-16 text-center">
            <DollarSign className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">Nenhum lançamento financeiro ainda.</p>
            {events.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">Crie um evento primeiro para lançar o financeiro.</p>
            )}
            {events.length > 0 && (
              <Button onClick={() => { setEditing(null); setOpen(true); }} className="mt-5 bg-gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-1.5" /> Primeiro lançamento
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {financials.map((f) => {
            const event = eventMap.get(f.event_id);
            const net = calcEventNet(f);
            return (
              <Card key={f.id} className="glass border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">{event?.name ?? "Evento removido"}</h3>
                      {event?.date && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(event.date), "dd/MM/yyyy", { locale: ptBR })}
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
                        <Field label="Bar" value={formatBRL(Number(f.revenue_drinks))} />
                        <Field label={`Narguilé ${f.hookah_share_percent}%`} value={formatBRL(Number(f.revenue_hookah_total) * Number(f.hookah_share_percent) / 100)} />
                        <Field label="Portaria" value={formatBRL(Number(f.revenue_door))} />
                        <Field label="Despesas" value={formatBRL(Number(f.expenses))} negative />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">Líquido</div>
                      <div className={`text-lg font-bold flex items-center gap-1 ${net >= 0 ? "text-success" : "text-destructive"}`}>
                        {net >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        {formatBRL(net)}
                      </div>
                      <div className="flex gap-1 mt-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(f); setOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                          if (confirm("Remover este lançamento?")) deleteMut.mutate(f.id);
                        }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <FinancialDialog open={open} onOpenChange={setOpen} financial={editing} events={events} />
    </div>
  );
}

function Field({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-medium ${negative ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function FinancialDialog({
  open, onOpenChange, financial, events,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  financial: Financial | null;
  events: Array<{ id: string; name: string; date: string }>;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [eventId, setEventId] = useState("");
  const [drinks, setDrinks] = useState(0);
  const [hookahTotal, setHookahTotal] = useState(0);
  const [hookahShare, setHookahShare] = useState(40);
  const [door, setDoor] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setEventId(financial?.event_id ?? events[0]?.id ?? "");
      setDrinks(Number(financial?.revenue_drinks ?? 0));
      setHookahTotal(Number(financial?.revenue_hookah_total ?? 0));
      setHookahShare(Number(financial?.hookah_share_percent ?? 40));
      setDoor(Number(financial?.revenue_door ?? 0));
      setExpenses(Number(financial?.expenses ?? 0));
      setNotes(financial?.notes ?? "");
    }
  }, [open, financial, events]);

  const previewNet = calcEventNet({ revenue_drinks: drinks, revenue_hookah_total: hookahTotal, hookah_share_percent: hookahShare, revenue_door: door, expenses });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (!eventId) throw new Error("Selecione um evento");
      const payload = {
        user_id: user.id,
        event_id: eventId,
        revenue_drinks: drinks,
        revenue_hookah_total: hookahTotal,
        hookah_share_percent: hookahShare,
        revenue_door: door,
        expenses,
        notes: notes.trim() || null,
      };
      if (financial) {
        const { error } = await supabase.from("event_financials").update(payload).eq("id", financial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_financials").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(financial ? "Atualizado" : "Lançado");
      qc.invalidateQueries({ queryKey: ["financials"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message.includes("duplicate") ? "Este evento já tem lançamento financeiro" : e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl text-gradient">{financial ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Evento *</Label>
            <Select value={eventId} onValueChange={setEventId} disabled={!!financial}>
              <SelectTrigger><SelectValue placeholder="Selecione um evento" /></SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} — {format(new Date(e.date), "dd/MM/yy", { locale: ptBR })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Money label="Bar / Drinks (R$)" value={drinks} onChange={setDrinks} />
            <Money label="Portaria (R$)" value={door} onChange={setDoor} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Money label="Narguilé total (R$)" value={hookahTotal} onChange={setHookahTotal} />
            <div className="space-y-1.5">
              <Label htmlFor="share">Sua parte (%)</Label>
              <Input id="share" type="number" min="0" max="100" step="0.1" value={hookahShare} onChange={(e) => setHookahShare(Number(e.target.value))} />
            </div>
          </div>

          <Money label="Despesas / Comissões (R$)" value={expenses} onChange={setExpenses} />

          <div className="space-y-1.5">
            <Label htmlFor="f-notes">Anotações</Label>
            <Textarea id="f-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="rounded-lg bg-secondary/40 p-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Lucro líquido estimado</span>
            <span className={`text-xl font-bold ${previewNet >= 0 ? "text-success" : "text-destructive"}`}>
              {formatBRL(previewNet)}
            </span>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saveMut.isPending} className="bg-gradient-primary text-primary-foreground">
              {saveMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Money({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" step="0.01" min="0" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
