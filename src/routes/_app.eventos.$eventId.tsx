import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ArrowLeft, Calendar, MapPin, Pencil, Trash2, DollarSign, TrendingUp, TrendingDown, Save, Wine, Percent } from "lucide-react";
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
import { formatBRL, formatPercent, calcEventGross, calcEventNet, calcBarMargin } from "@/lib/format";
import { EventCostsManager } from "@/components/EventCostsManager";
import { EventPromotersManager } from "@/components/EventPromotersManager";
import { EventLandingManager } from "@/components/EventLandingManager";
import { EventClosingTab } from "@/components/eventos/EventClosingTab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LockKeyhole } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

export const Route = createFileRoute("/_app/eventos/$eventId")({
  component: EventDetailPage,
});

function EventDetailPage() {
  const { eventId } = Route.useParams();
  const { user } = useAuth();
  const { ownerId, canEventosEditar, canEventosVerFinanceiro, isOwner } = usePermissions();
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

  const { data: extraCostsTotal = 0 } = useQuery({
    queryKey: ["event-costs-total", eventId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_costs")
        .select("amount")
        .eq("event_id", eventId);
      if (error) throw error;
      return (data ?? []).reduce((s, c) => s + Number(c.amount), 0);
    },
  });

  // Refetch the costs total when event-costs invalidates
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["event-costs-total", eventId] });
  }, [qc, eventId]);

  const [drinks, setDrinks] = useState("0");
  const [hookahTotal, setHookahTotal] = useState("0");
  const [hookahShare, setHookahShare] = useState("40");
  const [door, setDoor] = useState("0");
  const [barCMV, setBarCMV] = useState("0");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (financial) {
      setDrinks(String(financial.revenue_drinks ?? 0));
      setHookahTotal(String(financial.revenue_hookah_total ?? 0));
      setHookahShare(String(financial.hookah_share_percent ?? 40));
      setDoor(String(financial.revenue_door ?? 0));
      setBarCMV(String(financial.bar_cmv ?? 0));
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
        bar_cmv: Number(barCMV) || 0,
        expenses: Number(financial?.expenses ?? 0),
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
      toast.success("Faturamento salvo");
      qc.invalidateQueries({ queryKey: ["event-financial", eventId] });
      qc.invalidateQueries({ queryKey: ["financials"] });
      qc.invalidateQueries({ queryKey: ["monthly-summary"] });
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
    bar_cmv: Number(barCMV) || 0,
    expenses: Number(financial?.expenses ?? 0),
  };
  const gross = calcEventGross(live);
  const net = calcEventNet(live, extraCostsTotal);
  const barMargin = calcBarMargin(live);
  const totalCosts = (Number(barCMV) || 0) + Number(financial?.expenses ?? 0) + extraCostsTotal;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to="/eventos"><ArrowLeft className="h-4 w-4 mr-1.5" /> Eventos</Link>
        </Button>
        <div className="flex gap-2">
          {canEventosEditar && (
            <Button asChild variant="secondary" size="sm">
              <Link to="/eventos"><Pencil className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Editar</span></Link>
            </Button>
          )}
          {canEventosEditar && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { if (confirm(`Remover "${event.name}"?`)) deleteMut.mutate(); }}
            >
              <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Excluir</span>
            </Button>
          )}
        </div>
      </div>


      {/* Hero */}
      <Card className="glass border-border/60 overflow-hidden">
        <div className="md:flex">
          <div className="md:w-2/5 aspect-[4/3] sm:aspect-video md:aspect-auto bg-secondary relative">
            {event.flyer_url ? (
              <img src={event.flyer_url} alt={event.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-primary grid place-items-center min-h-[160px]">
                <Calendar className="h-16 w-16 text-primary-foreground/60" />
              </div>
            )}
          </div>
          <div className="p-4 sm:p-6 md:p-8 flex-1">
            <Badge variant={
              event.status === "upcoming" ? "default"
              : event.status === "ongoing" || event.status === "live" ? "default"
              : event.status === "finished" ? "secondary"
              : "destructive"
            }>
              {event.status === "upcoming" ? "Próximo"
                : event.status === "ongoing" || event.status === "live" ? "Ao vivo"
                : event.status === "finished" ? "Realizado"
                : "Cancelado"}
            </Badge>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold font-display text-gradient mt-3">{event.name}</h1>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>{format(new Date(event.date), "EEEE, dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}</span>
              </div>
              {event.location && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" /> <span>{event.location}</span>
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


      {isOwner && (
        <Card className="glass border-border/60">
          <CardContent className="p-4 text-sm text-muted-foreground">
            O painel de drinks ao vivo agora fica na página <Link to="/ao-vivo" className="text-primary underline">Ao vivo</Link>, dentro de Consumação interna.
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <Card className="glass border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-primary" /> Fechamento por funcionário
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Feche um a um (vendedor, porteiro, garçom). O relatório da maquininha sobrescreve o sistema.
            </p>
          </CardHeader>
          <CardContent>
            <EventClosingTab eventId={eventId} />
          </CardContent>
        </Card>
      )}

      {canEventosVerFinanceiro && (<>
      {/* Resumo financeiro */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="glass border-border/60">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Faturamento</span>
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <p className="text-base sm:text-lg md:text-xl font-bold mt-1">{formatBRL(gross)}</p>
          </CardContent>
        </Card>
        <Card className="glass border-border/60">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Custos totais</span>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </div>
            <p className="text-base sm:text-lg md:text-xl font-bold mt-1 text-destructive">{formatBRL(totalCosts)}</p>
          </CardContent>
        </Card>
        <Card className="glass border-border/60 glow-primary">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Lucro líquido</span>
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <p className={`text-base sm:text-lg md:text-xl font-bold mt-1 ${net >= 0 ? "text-gradient" : "text-destructive"}`}>
              {formatBRL(net)}
            </p>
          </CardContent>
        </Card>
        <Card className="glass border-border/60">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Wine className="h-3 w-3" /> Margem bar
              </span>
              <Percent className="h-4 w-4 text-primary" />
            </div>
            <p className={`text-base sm:text-lg md:text-xl font-bold mt-1 ${barMargin.percent >= 0 ? "text-success" : "text-destructive"}`}>
              {formatPercent(barMargin.percent)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {formatBRL(barMargin.profit)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Form faturamento */}
      <Card className="glass border-border/60">
        <CardHeader>
          <CardTitle>Faturamento do evento</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => { e.preventDefault(); saveFinMut.mutate(); }}
            className="grid sm:grid-cols-2 gap-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="f-drinks">Bar — faturamento (R$)</Label>
              <Input id="f-drinks" type="number" step="0.01" value={drinks} onChange={(e) => setDrinks(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-cmv" className="flex items-center gap-1">
                <Wine className="h-3.5 w-3.5" /> CMV bar — custo das bebidas (R$)
              </Label>
              <Input id="f-cmv" type="number" step="0.01" value={barCMV} onChange={(e) => setBarCMV(e.target.value)} />
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
              <Label htmlFor="f-notes">Observações</Label>
              <Textarea id="f-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={saveFinMut.isPending} className="bg-gradient-primary text-primary-foreground glow-primary">
                <Save className="h-4 w-4 mr-1.5" />
                {saveFinMut.isPending ? "Salvando..." : "Salvar faturamento"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      </>)}

      {/* Custos detalhados */}
      <Card className="glass border-border/60">
        <CardHeader>
          <CardTitle>Promoters & listas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Vincule promoters e compartilhe o link único de cada um. Faça check-in na portaria para ranquear quem trouxe mais gente.
          </p>
        </CardHeader>
        <CardContent>
          <EventPromotersManager eventId={eventId} />
        </CardContent>
      </Card>

      {/* Página pública / landing */}
      {ownerId && <EventLandingManager eventId={eventId} ownerId={ownerId} />}

      {/* Custos detalhados */}
      {canEventosVerFinanceiro && (
        <Card className="glass border-border/60">
          <CardHeader>
            <CardTitle>Custos do evento</CardTitle>
            <p className="text-sm text-muted-foreground">
              Lance custos por categoria (segurança, DJ, banda, som, mídia, lanche…). Crie novas categorias quando precisar.
            </p>
          </CardHeader>
          <CardContent>
            <EventCostsManager eventId={eventId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
