import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, ExternalLink, Plus, Trash2, Globe, Save } from "lucide-react";
import { formatBRL } from "@/lib/format";

function genSlug(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return base + "-" + Math.random().toString(36).slice(2, 6);
}

type TicketType = {
  id: string;
  name: string;
  gender_target: string | null;
  price_early: number;
  price_late: number;
  switch_at: string | null;
  is_active: boolean;
};

export function EventLandingManager({ eventId, ownerId }: { eventId: string; ownerId: string }) {
  const qc = useQueryClient();

  const { data: event } = useQuery({
    queryKey: ["event-landing", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, public_slug, whatsapp_group_url, display_boost, landing_published")
        .eq("id", eventId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: tickets = [], refetch: refetchTickets } = useQuery({
    queryKey: ["ticket-types", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_types")
        .select("id, name, gender_target, price_early, price_late, switch_at, is_active")
        .eq("event_id", eventId)
        .order("sort_order");
      if (error) throw error;
      return data as TicketType[];
    },
  });

  const [slug, setSlug] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [boost, setBoost] = useState("1");
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (event) {
      setSlug(event.public_slug ?? "");
      setWhatsappUrl(event.whatsapp_group_url ?? "");
      setBoost(String(event.display_boost ?? 1));
      setPublished(event.landing_published ?? false);
    }
  }, [event]);

  const saveLanding = useMutation({
    mutationFn: async () => {
      const finalSlug = slug.trim() || genSlug(event?.name ?? "evento");
      const { error } = await supabase
        .from("events")
        .update({
          public_slug: finalSlug,
          whatsapp_group_url: whatsappUrl.trim() || null,
          display_boost: Number(boost) || 1,
          landing_published: published,
        })
        .eq("id", eventId);
      if (error) throw error;
      return finalSlug;
    },
    onSuccess: (s) => {
      setSlug(s);
      toast.success("Página salva");
      qc.invalidateQueries({ queryKey: ["event-landing", eventId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Ticket type form
  const [tName, setTName] = useState("");
  const [tGender, setTGender] = useState("");
  const [tPriceEarly, setTPriceEarly] = useState("0");
  const [tPriceLate, setTPriceLate] = useState("0");
  const [tSwitchAt, setTSwitchAt] = useState("");

  const addTicket = useMutation({
    mutationFn: async () => {
      if (!tName.trim()) throw new Error("Informe o nome");
      const { error } = await supabase.from("ticket_types").insert({
        user_id: ownerId,
        event_id: eventId,
        name: tName.trim(),
        gender_target: tGender || null,
        price_early: Number(tPriceEarly) || 0,
        price_late: Number(tPriceLate) || Number(tPriceEarly) || 0,
        switch_at: tSwitchAt ? new Date(tSwitchAt).toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTName(""); setTGender(""); setTPriceEarly("0"); setTPriceLate("0"); setTSwitchAt("");
      refetchTickets();
      toast.success("Ingresso adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTicket = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ticket_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refetchTickets(),
    onError: (e: Error) => toast.error(e.message),
  });

  const landingUrl = slug ? `${window.location.origin}/e/${slug}` : "";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" /> Página pública do evento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
            <div>
              <div className="font-medium">Landing publicada</div>
              <div className="text-xs text-muted-foreground">Quando ligado, qualquer pessoa com o link pode ver e entrar na lista</div>
            </div>
            <Switch checked={published} onCheckedChange={setPublished} />
          </div>

          <div>
            <Label>Slug do link público</Label>
            <div className="flex gap-2">
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="ex: festa-junho"
              />
              <Button type="button" variant="outline" onClick={() => setSlug(genSlug(event?.name ?? "evento"))}>
                Gerar
              </Button>
            </div>
            {landingUrl && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <code className="bg-secondary/50 px-2 py-1 rounded flex-1 truncate">{landingUrl}</code>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(landingUrl); toast.success("Copiado"); }}>
                  <Copy className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                  <a href={landingUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" /></a>
                </Button>
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Link do grupo do WhatsApp</Label>
              <Input
                placeholder="https://chat.whatsapp.com/..."
                value={whatsappUrl}
                onChange={(e) => setWhatsappUrl(e.target.value)}
              />
            </div>
            <div>
              <Label>Multiplicador do contador</Label>
              <Input
                type="number"
                step="0.1"
                min="1"
                value={boost}
                onChange={(e) => setBoost(e.target.value)}
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                1.0 = exato. 1.5 = exibe 50% a mais (efeito de movimentação)
              </div>
            </div>
          </div>

          <Button onClick={() => saveLanding.mutate()} disabled={saveLanding.isPending} className="w-full">
            <Save className="h-4 w-4" /> Salvar configuração da página
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tipos de ingresso</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cadastre cada tipo com 2 preços. O preço sobe automaticamente na hora marcada.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {tickets.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded">
              Nenhum tipo de ingresso cadastrado
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card/40">
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {t.name}
                      {t.gender_target && <Badge variant="outline" className="text-[10px]">{t.gender_target}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Cedo {formatBRL(t.price_early)} · Tarde {formatBRL(t.price_late)}
                      {t.switch_at && ` · vira às ${new Date(t.switch_at).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeTicket.mutate(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 pt-3 border-t">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Adicionar ingresso</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Input placeholder="Nome (ex: Pista, VIP)" value={tName} onChange={(e) => setTName(e.target.value)} />
              </div>
              <Select value={tGender} onValueChange={setTGender}>
                <SelectTrigger><SelectValue placeholder="Gênero" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Livre">Livre</SelectItem>
                  <SelectItem value="F">Mulher</SelectItem>
                  <SelectItem value="M">Homem</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="datetime-local"
                value={tSwitchAt}
                onChange={(e) => setTSwitchAt(e.target.value)}
                placeholder="Hora vira"
              />
              <Input type="number" step="0.01" placeholder="Preço cedo" value={tPriceEarly} onChange={(e) => setTPriceEarly(e.target.value)} />
              <Input type="number" step="0.01" placeholder="Preço tarde" value={tPriceLate} onChange={(e) => setTPriceLate(e.target.value)} />
            </div>
            <Button onClick={() => addTicket.mutate()} disabled={addTicket.isPending} className="w-full">
              <Plus className="h-4 w-4" /> Adicionar ingresso
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
