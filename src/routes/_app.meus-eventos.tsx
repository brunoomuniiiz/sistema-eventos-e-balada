import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Copy, MapPin, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/meus-eventos")({
  component: MeusEventosPage,
});

function MeusEventosPage() {
  const { user } = useAuth();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["promoter-my-events", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // ficha do promoter ligada ao login
      const { data: meAsPromoter } = await supabase
        .from("promoters")
        .select("id, name")
        .eq("user_id", user!.id);
      const promoterIds = (meAsPromoter ?? []).map((p) => p.id);
      if (promoterIds.length === 0) return [];

      const { data: eps, error } = await supabase
        .from("event_promoters")
        .select("id, slug, event_id, promoter_id, events:event_id(id, name, date, location, flyer_url, status)")
        .in("promoter_id", promoterIds);
      if (error) throw error;

      const out = (eps ?? []).map((ep) => ({
        ep_id: ep.id,
        slug: ep.slug,
        event: ep.events as { id: string; name: string; date: string; location: string | null; flyer_url: string | null; status: string } | null,
      })).filter((r) => r.event);

      // contagem de nomes por event_promoter
      const epIds = out.map((r) => r.ep_id);
      const counts: Record<string, { total: number; checkin: number }> = {};
      if (epIds.length) {
        const { data: guests } = await supabase
          .from("guest_list_entries")
          .select("event_promoter_id, checked_in")
          .in("event_promoter_id", epIds);
        for (const g of guests ?? []) {
          const k = g.event_promoter_id;
          counts[k] = counts[k] ?? { total: 0, checkin: 0 };
          counts[k].total += 1;
          if (g.checked_in) counts[k].checkin += 1;
        }
      }

      return out
        .map((r) => ({ ...r, counts: counts[r.ep_id] ?? { total: 0, checkin: 0 } }))
        .sort((a, b) => (a.event!.date < b.event!.date ? 1 : -1));
    },
  });

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/lista/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Meus eventos" subtitle="Eventos onde você está como promoter" />

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Você ainda não está vinculado a nenhum evento.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.ep_id} className="overflow-hidden">
              {r.event!.flyer_url && (
                <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `url(${r.event!.flyer_url})` }} />
              )}
              <CardContent className="p-4 space-y-2">
                <div className="font-semibold truncate">{r.event!.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" /> {format(new Date(r.event!.date), "EEE dd 'de' MMM, HH:mm", { locale: ptBR })}
                </div>
                {r.event!.location && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" /> {r.event!.location}
                  </div>
                )}
                <div className="text-xs flex items-center gap-1.5 pt-1">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <span className="font-semibold">{r.counts.total}</span> nomes
                  <span className="text-muted-foreground">·</span>
                  <span className="font-semibold text-success">{r.counts.checkin}</span> check-in
                </div>
                <div className="pt-2">
                  <Button size="sm" variant="outline" className="w-full" onClick={() => copyLink(r.slug)}>
                    <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar link da minha lista
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
