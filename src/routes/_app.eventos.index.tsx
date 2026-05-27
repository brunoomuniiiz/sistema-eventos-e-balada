import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Calendar, MapPin, ImagePlus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Event = Database["public"]["Tables"]["events"]["Row"];

export const Route = createFileRoute("/_app/eventos/")({
  component: EventosPage,
});

function EventosPage() {
  const { user } = useAuth();
  const { canEventosCriar, canEventosEditar } = usePermissions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);

  const { data: events = [] } = useQuery({
    queryKey: ["events", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento removido");
      qc.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Eventos"
        subtitle={`${events.length} ${events.length === 1 ? "evento" : "eventos"} no total`}
        actions={
          canEventosCriar ? (
            <Button
              onClick={() => { setEditing(null); setOpen(true); }}
              className="bg-gradient-primary text-primary-foreground glow-primary"
            >
              <Plus className="h-4 w-4 mr-1.5" /> Novo evento
            </Button>
          ) : null
        }
      />

      {events.length === 0 ? (
        <Card className="glass border-border/60">
          <CardContent className="py-16 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">Nenhum evento cadastrado ainda.</p>
            {canEventosCriar && (
              <Button
                onClick={() => { setEditing(null); setOpen(true); }}
                className="mt-5 bg-gradient-primary text-primary-foreground"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Criar primeiro evento
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((event) => (
            <Card key={event.id} className="glass border-border/60 overflow-hidden group hover:glow-primary transition-shadow">
              <div className="aspect-video relative overflow-hidden bg-secondary">
                {event.flyer_url ? (
                  <img src={event.flyer_url} alt={event.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full bg-gradient-primary grid place-items-center">
                    <Calendar className="h-12 w-12 text-primary-foreground/60" />
                  </div>
                )}
                <Badge className="absolute top-2 right-2" variant={
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
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold font-display text-lg truncate">{event.name}</h3>
                <div className="text-xs text-muted-foreground mt-1.5 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(event.date), "dd 'de' MMM yyyy 'às' HH:mm", { locale: ptBR })}
                  </div>
                  {event.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" /> {event.location}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button asChild size="sm" className="flex-1 bg-gradient-primary text-primary-foreground">
                    <Link to="/eventos/$eventId" params={{ eventId: event.id }}>Ver detalhes</Link>
                  </Button>
                  {canEventosEditar && (
                    <Button size="sm" variant="secondary" onClick={() => { setEditing(event); setOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canEventosEditar && (
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (confirm(`Remover "${event.name}"?`)) deleteMut.mutate(event.id);
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EventDialog open={open} onOpenChange={setOpen} event={editing} />
    </div>
  );
}

// Helpers para datetime-local sem perder fuso horário
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(v: string): string {
  // "yyyy-mm-ddTHH:MM" sem timezone — interpretado como local pelo Date()
  return new Date(v).toISOString();
}

function EventDialog({ open, onOpenChange, event }: { open: boolean; onOpenChange: (v: boolean) => void; event: Event | null }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(event?.name ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [date, setDate] = useState(toLocalInputValue(event?.date));
  const [location, setLocation] = useState(event?.location ?? "");
  const [status, setStatus] = useState<"upcoming" | "ongoing" | "finished" | "cancelled">((event?.status as "upcoming" | "ongoing" | "finished" | "cancelled") ?? "upcoming");
  const [flyerUrl, setFlyerUrl] = useState(event?.flyer_url ?? "");
  const [endDate, setEndDate] = useState(
    toLocalInputValue((event as { end_date?: string | null } | null)?.end_date)
  );
  const [waGroupUrl, setWaGroupUrl] = useState(
    (event as { whatsapp_group_url?: string | null } | null)?.whatsapp_group_url ?? ""
  );
  const [showRealCount, setShowRealCount] = useState<boolean>(
    Boolean((event as { show_real_count_when_big?: boolean } | null)?.show_real_count_when_big)
  );
  const [uploading, setUploading] = useState(false);

  // Reset form when dialog opens with a different event
  useEffect(() => {
    if (open) {
      setName(event?.name ?? "");
      setDescription(event?.description ?? "");
      setDate(toLocalInputValue(event?.date));
      setLocation(event?.location ?? "");
      setStatus((event?.status as "upcoming" | "ongoing" | "finished" | "cancelled") ?? "upcoming");
      setFlyerUrl(event?.flyer_url ?? "");
      setEndDate(toLocalInputValue((event as { end_date?: string | null } | null)?.end_date));
      setWaGroupUrl((event as { whatsapp_group_url?: string | null } | null)?.whatsapp_group_url ?? "");
      setShowRealCount(Boolean((event as { show_real_count_when_big?: boolean } | null)?.show_real_count_when_big));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id]);


  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const payload = {
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        date: fromLocalInputValue(date),
        end_date: endDate ? fromLocalInputValue(endDate) : null,

        location: location.trim() || null,
        status,
        flyer_url: flyerUrl || null,
        whatsapp_group_url: waGroupUrl.trim() || null,
        show_real_count_when_big: showRealCount,
      };
      if (event) {
        const { error } = await supabase.from("events").update(payload).eq("id", event.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("events").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(event ? "Evento atualizado" : "Evento criado");
      qc.invalidateQueries({ queryKey: ["events"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("flyers").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("flyers").getPublicUrl(path);
      setFlyerUrl(data.publicUrl);
      toast.success("Flyer enviado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl text-gradient">{event ? "Editar evento" : "Novo evento"}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}
          className="space-y-4 mt-2"
        >
          <div className="space-y-1.5">
            <Label>Flyer</Label>
            <div className="flex items-center gap-3">
              {flyerUrl ? (
                <img src={flyerUrl} alt="Flyer" className="h-20 w-20 rounded-lg object-cover" />
              ) : (
                <div className="h-20 w-20 rounded-lg border border-dashed border-border grid place-items-center">
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                <span className="inline-flex items-center px-4 py-2 rounded-md text-sm bg-secondary hover:bg-secondary/80 transition-colors">
                  {uploading ? "Enviando..." : flyerUrl ? "Trocar" : "Enviar imagem"}
                </span>
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-name">Nome *</Label>
            <Input id="ev-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-date">Início *</Label>
              <Input id="ev-date" type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end">Encerramento</Label>
              <Input id="ev-end" type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-location">Local</Label>
              <Input id="ev-location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger id="ev-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="upcoming">Próximo</SelectItem>
                  <SelectItem value="ongoing">Ao vivo</SelectItem>
                  <SelectItem value="finished">Realizado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-wa">Link do grupo WhatsApp</Label>
            <Input id="ev-wa" placeholder="https://chat.whatsapp.com/..." value={waGroupUrl} onChange={(e) => setWaGroupUrl(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Quem entrar na lista verá um botão para entrar no grupo.</p>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="ev-realcount" className="cursor-pointer">Mostrar nº real de inscritos no dia</Label>
              <p className="text-[11px] text-muted-foreground">Só ativa quando a lista passar de 400 nomes, no dia do evento.</p>
            </div>
            <Switch id="ev-realcount" checked={showRealCount} onCheckedChange={setShowRealCount} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Descrição</Label>
            <Textarea id="ev-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
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
