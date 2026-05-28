import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Copy, MapPin, Users, ExternalLink, Lock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/meus-eventos")({
  component: MeusEventosPage,
});

type Row = {
  ep_id: string;
  slug: string;
  category?: string;
  display_name?: string | null;
  event: { id: string; name: string; date: string; location: string | null; flyer_url: string | null; status: string };
  counts: { total: number; checkin: number; women: number; men: number };
  all_promoters?: Array<{
    id: string;
    display_name: string | null;
    promoter_name: string;
    total: number;
    present: number;
    is_me: boolean;
  }>;
};

function MeusEventosPage() {
  const { user } = useAuth();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["promoter-my-events", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Row[]> => {
      const { data: meAsPromoter } = await supabase
        .from("promoters")
        .select("id")
        .eq("user_id", user!.id);
      const promoterIds = (meAsPromoter ?? []).map((p) => p.id);
      if (promoterIds.length === 0) return [];

      const { data: eps, error } = await supabase
        .from("event_promoters")
        .select("id, slug, event_id, promoter_id, category, display_name")
        .in("promoter_id", promoterIds);
      if (error) throw error;

      const eventIds = Array.from(new Set((eps ?? []).map((e) => e.event_id)));
      const evMap: Record<string, Row["event"]> = {};
      if (eventIds.length) {
        const { data: evs } = await supabase
          .from("events")
          .select("id, name, date, location, flyer_url, status")
          .in("id", eventIds);
        for (const e of evs ?? []) evMap[e.id] = e;
      }

      const out = (eps ?? []).map((ep) => ({
        ep_id: ep.id,
        slug: ep.slug,
        category: ep.category,
        display_name: ep.display_name,
        event: evMap[ep.event_id] ?? null,
      })).filter((r): r is { ep_id: string; slug: string; category: string; display_name: string | null; event: Row["event"] } => !!r.event);

      const epIds = out.map((r) => r.ep_id);
      const allEventIds = Array.from(new Set(out.map(r => r.event.id)));

      // Pegar TODOS os links de promoters apenas para esses eventos
      const { data: allEps } = await supabase
        .from("event_promoters")
        .select(`
          id, 
          event_id, 
          display_name, 
          category,
          promoters (name)
        `)
        .in("event_id", allEventIds)
        .eq('category', 'promoter');

      const counts: Record<string, Row["counts"]> = {};
      
      // Pegar convidados para TODOS os promoters desses eventos
      const allRelevantEpIds = (allEps ?? []).map(ep => ep.id);
      if (allRelevantEpIds.length) {
        const { data: guests } = await supabase
          .from("guest_list_entries")
          .select("event_promoter_id, checked_in, gender")
          .in("event_promoter_id", allRelevantEpIds);
          
        for (const g of guests ?? []) {
          const k = g.event_promoter_id;
          counts[k] = counts[k] ?? { total: 0, checkin: 0, women: 0, men: 0 };
          counts[k].total += 1;
          if (g.checked_in) counts[k].checkin += 1;
          if (g.gender === "F") counts[k].women += 1;
          if (g.gender === "M") counts[k].men += 1;
        }
      }

      return out
        .map((r) => {
          // Ranking
          const eventLinks = (allEps ?? [])
            .filter(ep => ep.event_id === r.event.id)
            .map(ep => ({
              id: ep.id,
              display_name: ep.display_name,
              promoter_name: (ep.promoters as any)?.name || "Promoter",
              total: counts[ep.id]?.total ?? 0,
              present: counts[ep.id]?.checkin ?? 0,
              is_me: ep.id === r.ep_id
            }))
            .sort((a, b) => b.present - a.present);

          return { 
            ...r, 
            counts: counts[r.ep_id] ?? { total: 0, checkin: 0, women: 0, men: 0 },
            all_promoters: eventLinks
          };
        })
        .sort((a, b) => (a.event.date < b.event.date ? 1 : -1));
    },
  });

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/lista/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  const now = Date.now();
  const futuros = rows.filter((r) => new Date(r.event.date).getTime() >= now - 1000 * 60 * 60 * 6); // 6h após início ainda é "ativo"
  const passados = rows.filter((r) => new Date(r.event.date).getTime() < now - 1000 * 60 * 60 * 6);

  return (
    <div className="space-y-6">
      <PageHeader title="Eventos" subtitle="Suas listas e festas" />

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Você ainda não está vinculado a nenhum evento.
        </CardContent></Card>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Próximos</h2>
            {futuros.length === 0 ? (
              <Card><CardContent className="py-6 text-center text-xs text-muted-foreground">Nenhum evento futuro.</CardContent></Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {futuros.map((r) => <EventCard key={r.ep_id} row={r} closed={false} onCopy={copyLink} />)}
              </div>
            )}
          </section>

          {passados.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Encerrados
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {passados.map((r) => <EventCard key={r.ep_id} row={r} closed onCopy={copyLink} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function EventCard({ row, closed, onCopy }: { row: Row; closed: boolean; onCopy: (s: string) => void }) {
  return (
    <Card className={`overflow-hidden transition ${closed ? "opacity-60" : ""}`}>
      {row.event.flyer_url && (
        <div className={`h-32 bg-cover bg-center ${closed ? "grayscale" : ""}`} style={{ backgroundImage: `url(${row.event.flyer_url})` }} />
      )}
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold truncate flex-1">{row.event.name}</div>
          {closed && <Badge variant="secondary" className="shrink-0 text-[10px]">Encerrado</Badge>}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Calendar className="h-3 w-3" /> {format(new Date(row.event.date), "EEE dd 'de' MMM, HH:mm", { locale: ptBR })}
        </div>
        {row.event.location && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <MapPin className="h-3 w-3" /> {row.event.location}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2">
          <div className="rounded-lg bg-muted/40 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Nomes na lista</div>
            <div className="text-lg font-bold flex items-center gap-1"><Users className="h-3.5 w-3.5 text-primary" /> {row.counts.total}</div>
            <div className="text-[10px] text-muted-foreground">{row.counts.women}F · {row.counts.men}M</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">{closed ? "Foram" : "Check-in"}</div>
            <div className="text-lg font-bold flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" /> {row.counts.checkin}</div>
            <div className="text-[10px] text-muted-foreground">
              {row.counts.total > 0 ? Math.round((row.counts.checkin / row.counts.total) * 100) : 0}% de presença
            </div>
          </div>
        </div>

        {!closed && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button asChild size="sm" className="bg-gradient-primary text-primary-foreground">
              <Link to="/lista/$slug" params={{ slug: row.slug }}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Minha lista
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => onCopy(row.slug)}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
