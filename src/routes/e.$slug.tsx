import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, MapPin, Users, MessageCircle, Plus, X, Sparkles, Instagram, Share2, Flame } from "lucide-react";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/e/$slug")({
  component: PublicLandingPage,
  head: ({ params }) => ({
    meta: [
      { title: `Lista do evento — ${params.slug}` },
      { name: "description", content: "Entre na lista do evento" },
    ],
  }),
});

type Companion = { name: string; gender: string };

type LandingData = {
  event: {
    id: string;
    name: string;
    date: string;
    location: string | null;
    description: string | null;
    flyer_url: string | null;
    whatsapp_group_url: string | null;
    status: string;
  };
  bar: { name: string | null; logo_url: string | null; instagram: string | null; accent: string | null } | null;
  tickets: Array<{ id: string; name: string; gender_target: string | null; price_early: number; price_late: number; switch_at: string | null }>;
  count: number;
  display_count: number;
};

function PublicLandingPage() {
  const { slug } = Route.useParams();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["landing", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_landing", { _slug: slug });
      if (error) throw error;
      return data as unknown as LandingData | null;
    },
    refetchInterval: 12_000,
  });

  // Realtime: refetch when guest_list_entries changes for this event
  useEffect(() => {
    if (!data?.event.id) return;
    const ch = supabase
      .channel(`landing:${data.event.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guest_list_entries", filter: `event_id=eq.${data.event.id}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [data?.event.id, refetch]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe seu nome");
      const { data: res, error } = await supabase.rpc("add_guest_to_event", {
        _event_slug: slug,
        _name: name.trim(),
        _phone: phone.trim(),
        _gender: gender,
        _companions: companions.filter((c) => c.name.trim()) as never,
      });
      if (error) throw error;
      return res;
    },
    onSuccess: () => {
      setSubmitted(true);
      refetch();
      toast.success("Você está na lista! 🎉");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6 text-center">
        <div>
          <Sparkles className="h-12 w-12 text-primary mx-auto mb-3" />
          <h1 className="text-2xl font-bold">Lista não disponível</h1>
          <p className="text-muted-foreground mt-2">O evento pode ter terminado ou a página ainda não foi publicada.</p>
        </div>
      </div>
    );
  }

  const { event, bar, tickets, display_count } = data;
  const eventDate = new Date(event.date);
  const closed = event.status !== "upcoming";

  const accent = bar?.accent ?? null;
  const accentStyle = accent ? { background: `linear-gradient(135deg, ${accent}, ${accent}cc)` } : undefined;

  const addCompanion = () => {
    if (companions.length >= 5) return toast.error("Máximo 5 acompanhantes por inscrição");
    setCompanions((c) => [...c, { name: "", gender: "" }]);
  };

  const updateCompanion = (idx: number, patch: Partial<Companion>) => {
    setCompanions((c) => c.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  };

  const removeCompanion = (idx: number) => setCompanions((c) => c.filter((_, i) => i !== idx));

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: event.name, text: `Entre na lista de ${event.name}`, url });
      } catch {
        // user cancelled
      }
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Link copiado!");
    }
  };

  const ticketCurrentPrice = (t: LandingData["tickets"][number]) => {
    if (!t.switch_at) return t.price_early;
    return new Date(t.switch_at) <= new Date() ? t.price_late : t.price_early;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HERO */}
      <header className="relative">
        {event.flyer_url ? (
          <div className="relative h-[60vh] min-h-[420px] overflow-hidden">
            <img
              src={event.flyer_url}
              alt={event.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background" />
            <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">
              {bar?.logo_url && (
                <img src={bar.logo_url} alt={bar.name ?? "bar"} className="h-12 mb-4 drop-shadow-lg" />
              )}
              <div className="flex items-center gap-2 mb-2">
                <Badge style={accentStyle} className="border-0 text-white">
                  {bar?.name ?? "Evento"}
                </Badge>
                {closed && <Badge variant="destructive">Lista encerrada</Badge>}
              </div>
              <h1 className="text-4xl md:text-6xl font-display font-black leading-tight drop-shadow-2xl">
                {event.name}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {format(eventDate, "EEE, dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
                </span>
                {event.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {event.location}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-6 md:px-10 pt-10 pb-6">
            {bar?.logo_url && <img src={bar.logo_url} alt={bar.name ?? ""} className="h-12 mb-4" />}
            <h1 className="text-4xl md:text-5xl font-display font-black">{event.name}</h1>
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 md:px-6 py-8 space-y-8">
        {/* CONTADOR AO VIVO */}
        <div className="rounded-2xl border border-border/60 p-5 glass flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl grid place-items-center" style={accentStyle ?? { background: "linear-gradient(135deg, var(--color-primary), var(--color-primary))" }}>
            <Flame className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1">
            <div className="text-3xl font-bold tabular-nums leading-none">
              {display_count} confirmados
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {closed ? "Lista encerrada" : "atualiza em tempo real"}
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={share}>
            <Share2 className="h-5 w-5" />
          </Button>
        </div>

        {/* DESCRIÇÃO */}
        {event.description && (
          <div className="prose prose-invert max-w-none">
            <p className="whitespace-pre-wrap text-base">{event.description}</p>
          </div>
        )}

        {/* INGRESSOS */}
        {tickets.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
              <span className="h-1 w-6 rounded-full" style={accentStyle ?? { background: "var(--color-primary)" }} />
              Ingressos
            </h2>
            <div className="grid gap-2">
              {tickets.map((t) => {
                const current = ticketCurrentPrice(t);
                const willSwitch = t.switch_at && new Date(t.switch_at) > new Date() && t.price_late !== t.price_early;
                return (
                  <div key={t.id} className="rounded-xl border border-border/60 bg-card/50 p-4 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-semibold">{t.name}</div>
                      {t.gender_target && (
                        <Badge variant="outline" className="mt-1 text-[10px]">{t.gender_target}</Badge>
                      )}
                      {willSwitch && (
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Sobe pra {formatBRL(t.price_late)} às {format(new Date(t.switch_at!), "HH:mm")}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gradient">{formatBRL(current)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* FORM */}
        {!closed && (
          <section className="rounded-2xl border border-border/60 p-5 bg-card/30 backdrop-blur">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Entrar na lista
            </h2>

            {submitted ? (
              <div className="text-center py-6 space-y-3">
                <div className="h-14 w-14 mx-auto rounded-full bg-success/20 grid place-items-center">
                  <Sparkles className="h-7 w-7 text-success" />
                </div>
                <h3 className="text-lg font-bold">Você está na lista!</h3>
                <p className="text-sm text-muted-foreground">Te esperamos no evento 🥂</p>
                {event.whatsapp_group_url && (
                  <Button asChild size="lg" className="w-full bg-[#25D366] hover:bg-[#25D366]/90 text-white">
                    <a href={event.whatsapp_group_url} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-5 w-5" />
                      Entrar no grupo do WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitting(true);
                  submit.mutate(undefined, { onSettled: () => setSubmitting(false) });
                }}
                className="space-y-3"
              >
                <div>
                  <Label>Seu nome *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>WhatsApp</Label>
                    <Input
                      type="tel"
                      placeholder="(11) 99999-0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Você é</Label>
                    <Select value={gender} onValueChange={setGender}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="F">Mulher</SelectItem>
                        <SelectItem value="M">Homem</SelectItem>
                        <SelectItem value="Outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {companions.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      Acompanhantes ({companions.length})
                    </Label>
                    {companions.map((c, i) => (
                      <div key={i} className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Input
                            placeholder={`Nome do(a) acompanhante ${i + 1}`}
                            value={c.name}
                            onChange={(e) => updateCompanion(i, { name: e.target.value })}
                          />
                        </div>
                        <Select value={c.gender} onValueChange={(v) => updateCompanion(i, { gender: v })}>
                          <SelectTrigger className="w-24"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="F">F</SelectItem>
                            <SelectItem value="M">M</SelectItem>
                            <SelectItem value="Outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeCompanion(i)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={addCompanion}
                  disabled={companions.length >= 5}
                >
                  <Plus className="h-4 w-4" /> Adicionar acompanhante
                </Button>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-12 text-base font-bold"
                  style={accentStyle}
                  disabled={submitting}
                >
                  {submitting ? "Enviando..." : "Confirmar minha presença"}
                </Button>
              </form>
            )}
          </section>
        )}

        {/* FOOTER actions */}
        <div className="flex flex-wrap gap-2 justify-center pt-4">
          {event.whatsapp_group_url && !submitted && (
            <Button asChild variant="outline" size="sm">
              <a href={event.whatsapp_group_url} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" /> Grupo do WhatsApp
              </a>
            </Button>
          )}
          {bar?.instagram && (
            <Button asChild variant="outline" size="sm">
              <a href={`https://instagram.com/${bar.instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer">
                <Instagram className="h-4 w-4" /> {bar.instagram}
              </a>
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
