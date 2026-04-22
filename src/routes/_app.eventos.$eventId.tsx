import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ArrowLeft, Calendar, MapPin, Pencil, Trash2, DollarSign, TrendingUp, TrendingDown, Save } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { formatBRL, calcEventGross, calcEventNet } from "@/lib/format";

export const Route = createFileRoute("/_app/eventos/$eventId")({
  component: EventDetailPage,
});

function EventDetailPage() {
  const { eventId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: event, isLoading } = useQuery({
    queryKey: ["event", eventId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: financial } = useQuery({
    queryKey: ["event-financial", eventId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_financials")
        .select("*")
        .eq("event_id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Local form state for financials
  const [drinks, setDrinks] = useState("0");
  const [hookahTotal, setHookahTotal] = useState("0");
  const [hookahShare, setHookahShare] = useState("40");
  const [door, setDoor] = useState("0");
  const [expenses, setExpenses] = useState("0");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (financial) {
      setDrinks(String(financial.revenue_drinks ?? 0));
      setHookahTotal(String(financial.revenue_hookah_total ?? 0));
      setHookahShare(String(financial.hookah_share_percent ?? 40));
      setDoor(String(financial.revenue_door ?? 0));
      setExpenses(String(financial.expenses ?? 0));
      setNotes(financial.notes ?? "");
    }
  }, [financial]);

  const deleteMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("events").delete().eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento removido");
      qc.invalidateQueries({ queryKey: ["events"] });
      navigate({ to: "/eventos" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveFinMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const payload = {
        event_id: eventId,
        user_id: user.id,
        revenue_drinks: Number(drinks) || 0,
        revenue_hookah_total: Number(hookahTotal) || 0,
        hookah_share_percent: Number(hookahShare) || 0,
        revenue_door: Number(door) || 0,
        expenses: Number(expenses) || 0,
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
      toast.success("Financeiro salvo");
      qc.invalidateQueries({ queryKey: ["event-financial", eventId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="grid place-items-center py-20">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <Card className="glass border-border/60">
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">Evento não encontrado.</p>
          <Button asChild variant="secondary" className="mt-4">
            <Link to="/eventos"><ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const live = {
    revenue_drinks: Number(drinks) || 0,
    revenue_hookah_total: Number(hookahTotal) || 0,
    hookah_share_percent: Number(hookahShare) || 0,
    revenue_door: Number(door) || 0,
    expenses: Number(expenses) || 0,
  };
  const gross = calcEventGross(live);
  const net = calcEventNet(live);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/eventos"><ArrowLeft className="h-4 w-4 mr-1.5" /> Eventos</Link>
        </Button>
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link to="/eventos"><Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { if (confirm(`Remover "${event.name}"?`)) deleteMut.mutate(); }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir
          </Button>
        </div>
      </div>

      {/* Hero */}
      <Card className="glass border-border/60 overflow-hidden">
        <div className="md:flex">
          <div className="md:w-2/5 aspect-video md:aspect-auto bg-secondary relative">
            {event.flyer_url ? (
              <img src={event.flyer_url} alt={event.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-primary grid place-items-center min-h-[200px]">
                <Calendar className="h-16 w-16 text-primary-foreground/60" />
              </div>
            )}
          </div>
          <div className="p-6 md:p-8 flex-1">
            <Badge variant={
              event.status === "upcoming" ? "default" : event.status === "finished" ? "secondary" : "destructive"
            }>
              {event.status === "upcoming" ? "Próximo" : event.status === "finished" ? "Realizado" : "Cancelado"}
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold font-display text-gradient mt-3">{event.name}</h1>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {format(new Date(event.date), "EEEE, dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
              </div>
              {event.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> {event.location}
                </div>
              )}
            </div>
            {event.description && (
              <>
                <Separator className="my-4" />
                <p className="text-sm whitespace-pre-wrap">{event.description}</p>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Resumo financeiro */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="glass border-border/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Bruto</span>
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold mt-2">{formatBRL(gross)}</p>
          </CardContent>
        </Card>
        <Card className="glass border-border/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Despesas</span>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </div>
            <p className="text-2xl font-bold mt-2">{formatBRL(Number(expenses) || 0)}</p>
          </CardContent>
        </Card>
        <Card className="glass border-border/60 glow-primary">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Líquido</span>
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <p className={`text-2xl font-bold mt-2 ${net >= 0 ? "text-gradient" : "text-destructive"}`}>
              {formatBRL(net)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Form financeiro */}
      <Card className="glass border-border/60">
        <CardHeader>
          <CardTitle>Financeiro do evento</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => { e.preventDefault(); saveFinMut.mutate(); }}
            className="grid sm:grid-cols-2 gap-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="f-drinks">Bar (R$)</Label>
              <Input id="f-drinks" type="number" step="0.01" value={drinks} onChange={(e) => setDrinks(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-door">Portaria (R$)</Label>
              <Input id="f-door" type="number" step="0.01" value={door} onChange={(e) => setDoor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-hookah">Narguilé total (R$)</Label>
              <Input id="f-hookah" type="number" step="0.01" value={hookahTotal} onChange={(e) => setHookahTotal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-share">Sua parte do narguilé (%)</Label>
              <Input id="f-share" type="number" step="1" min="0" max="100" value={hookahShare} onChange={(e) => setHookahShare(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="f-exp">Despesas (R$)</Label>
              <Input id="f-exp" type="number" step="0.01" value={expenses} onChange={(e) => setExpenses(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="f-notes">Observações</Label>
              <Textarea id="f-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={saveFinMut.isPending} className="bg-gradient-primary text-primary-foreground glow-primary">
                <Save className="h-4 w-4 mr-1.5" />
                {saveFinMut.isPending ? "Salvando..." : "Salvar financeiro"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
