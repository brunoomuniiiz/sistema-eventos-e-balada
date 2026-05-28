import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Copy, Check, X, Users, Trophy, Link as LinkIcon, MessageCircle, Bell, Home, Music, User, Edit2, TrendingUp, BarChart } from "lucide-react";
import { waLink, buildConfirmationMessage, buildReminderMessage } from "@/lib/whatsapp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

function genSlug() {
  return (
    Math.random().toString(36).slice(2, 8) +
    Math.random().toString(36).slice(2, 6)
  );
}

export function EventPromotersManager({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedPromoter, setSelectedPromoter] = useState<string>("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState<{ id: string; name: string } | null>(null);

  const { data: eventPromoters = [] } = useQuery({
    queryKey: ["event-promoters", eventId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_promoters")
        .select("id, slug, promoter_id, category, display_name")
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },
  });

  const { data: promoters = [] } = useQuery({
    queryKey: ["promoters", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promoters")
        .select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["guest-entries", eventId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_list_entries")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("name, date, location, flyer_url")
        .eq("id", eventId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!user || !selectedPromoter) throw new Error("Selecione um promoter");
      const { error } = await supabase.from("event_promoters").insert({
        user_id: user.id,
        event_id: eventId,
        promoter_id: selectedPromoter,
        slug: genSlug(),
        category: 'promoter'
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Promoter vinculado");
      qc.invalidateQueries({ queryKey: ["event-promoters", eventId] });
      setOpen(false);
      setSelectedPromoter("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("event_promoters")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["event-promoters", eventId] });
      qc.invalidateQueries({ queryKey: ["guest-entries", eventId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDisplayNameMut = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from("event_promoters")
        .update({ display_name: name })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nome atualizado");
      qc.invalidateQueries({ queryKey: ["event-promoters", eventId] });
      setEditingDisplayName(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkInMut = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from("guest_list_entries")
        .update({
          checked_in: value,
          checked_in_at: value ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["guest-entries", eventId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEntryMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("guest_list_entries")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["guest-entries", eventId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = eventPromoters
    .map((ep) => {
      const list = entries.filter((e) => e.event_promoter_id === ep.id);
      const present = list.filter((e) => e.checked_in).length;
      return {
        ep,
        total: list.length,
        present,
        rate: list.length > 0 ? (present / list.length) * 100 : 0,
      };
    })
    .sort((a, b) => b.present - a.present);

  const statsCasa = stats.filter(s => s.ep.category === 'casa');
  const statsAtracao = stats.filter(s => s.ep.category === 'atracao');
  const statsPromoters = stats.filter(s => s.ep.category === 'promoter');

  const availablePromoters = promoters.filter(
    (p) => !eventPromoters.some((ep) => ep.promoter_id === p.id),
  );

  const viewing = viewingId
    ? stats.find((s) => s.ep.id === viewingId)
    : null;
  const viewingEntries = viewingId
    ? entries.filter((e) => e.event_promoter_id === viewingId)
    : [];

  const globalTotal = entries.length;
  const globalPresent = entries.filter(e => e.checked_in).length;
  const globalRate = globalTotal > 0 ? (globalPresent / globalTotal) * 100 : 0;

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/lista/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="text-sm text-muted-foreground">
          Cada link captura nomes e gera conversão (check-in).
        </div>
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          className="bg-gradient-primary text-primary-foreground w-full sm:w-auto"
          disabled={availablePromoters.length === 0}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Vincular promoter
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h4 className="font-bold text-sm uppercase">Top Captação</h4>
            </div>
            <div className="space-y-1.5">
              {[...stats].sort((a, b) => b.total - a.total).slice(0, 3).map((s, i) => (
                <div key={s.ep.id} className="flex justify-between text-xs">
                  <span>{i+1}. {s.ep.display_name || promoters.find(p => p.id === s.ep.promoter_id)?.name || "Link"}</span>
                  <span className="font-bold">{s.total} nomes</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart className="h-4 w-4 text-emerald-500" />
              <h4 className="font-bold text-sm uppercase text-emerald-600">Top Conversão</h4>
            </div>
            <div className="space-y-1.5">
              {[...stats].sort((a, b) => b.present - a.present).slice(0, 3).map((s, i) => (
                <div key={s.ep.id} className="flex justify-between text-xs">
                  <span>{i+1}. {s.ep.display_name || promoters.find(p => p.id === s.ep.promoter_id)?.name || "Link"}</span>
                  <span className="font-bold text-emerald-600">{s.present} check-ins</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <PromoterSection 
          title="Casa" 
          icon={<Home className="h-4 w-4 text-blue-500" />} 
          stats={statsCasa} 
          promoters={promoters}
          onCopy={copyLink}
          onEdit={setEditingDisplayName}
          onRemove={(id) => confirm("Remover este link?") && removeMut.mutate(id)}
          onViewList={setViewingId}
        />
        <PromoterSection 
          title="Atrações" 
          icon={<Music className="h-4 w-4 text-purple-500" />} 
          stats={statsAtracao} 
          promoters={promoters}
          onCopy={copyLink}
          onEdit={setEditingDisplayName}
          onRemove={(id) => confirm("Remover este link?") && removeMut.mutate(id)}
          onViewList={setViewingId}
        />
        <PromoterSection 
          title="Promoters" 
          icon={<User className="h-4 w-4 text-primary" />} 
          stats={statsPromoters} 
          promoters={promoters}
          onCopy={copyLink}
          onEdit={setEditingDisplayName}
          onRemove={(id) => confirm("Remover este link?") && removeMut.mutate(id)}
          onViewList={setViewingId}
        />
      </div>

      <Dialog open={!!editingDisplayName} onOpenChange={(v) => !v && setEditingDisplayName(null)}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>Editar nome do link</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label>Nome de exibição</Label>
            <Input 
              value={editingDisplayName?.name ?? ""} 
              onChange={(e) => setEditingDisplayName(prev => prev ? { ...prev, name: e.target.value } : null)}
              placeholder="Ex: DJ Alok, Banda Tal..."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingDisplayName(null)}>Cancelar</Button>
            <Button 
              onClick={() => editingDisplayName && updateDisplayNameMut.mutate({ id: editingDisplayName.id, name: editingDisplayName.name })}
              disabled={updateDisplayNameMut.isPending}
              className="bg-gradient-primary text-primary-foreground"
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>Vincular promoter</DialogTitle>
          </DialogHeader>
          {availablePromoters.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Todos os promoters cadastrados já estão neste evento.
            </p>
          ) : (
            <Select
              value={selectedPromoter}
              onValueChange={setSelectedPromoter}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha um promoter" />
              </SelectTrigger>
              <SelectContent>
                {availablePromoters.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => addMut.mutate()}
              disabled={!selectedPromoter || addMut.isPending}
              className="bg-gradient-primary text-primary-foreground"
            >
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!viewingId}
        onOpenChange={(v) => !v && setViewingId(null)}
      >
        <DialogContent className="glass max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Lista de {viewing?.ep.display_name || promoters.find(p => p.id === viewing?.ep.promoter_id)?.name || ""}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/40 text-xs">
                <code className="flex-1 truncate">
                  {window.location.origin}/lista/{viewing.ep.slug}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyLink(viewing.ep.slug)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>

              {viewingEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum nome na lista ainda.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {viewingEntries.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-2 p-2 rounded-md border border-border/60"
                    >
                      <Button
                        size="sm"
                        variant={e.checked_in ? "default" : "ghost"}
                        className={
                          e.checked_in
                            ? "bg-success text-success-foreground h-8 w-8 p-0"
                            : "h-8 w-8 p-0"
                        }
                        onClick={() =>
                          checkInMut.mutate({
                            id: e.id,
                            value: !e.checked_in,
                          })
                        }
                      >
                        {e.checked_in ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <X className="h-4 w-4 opacity-40" />
                        )}
                      </Button>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {e.name}
                        </div>
                        <div className="text-xs text-muted-foreground flex gap-2">
                          {e.gender && <span>{e.gender}</span>}
                          {e.phone && <span>{e.phone}</span>}
                        </div>
                      </div>
                      {e.phone && event && (
                        <>
                          <a
                            href={waLink(e.phone, buildConfirmationMessage({
                              guestName: e.name,
                              eventName: event.name,
                              eventDate: event.date,
                              promoterName: viewing?.ep.display_name || promoters.find(p => p.id === viewing?.ep.promoter_id)?.name || "",
                              location: event.location,
                              flyerUrl: event.flyer_url,
                            }))}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Enviar confirmação no WhatsApp"
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[#25D366] hover:bg-[#25D366]/10 transition"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </a>
                          <a
                            href={waLink(e.phone, buildReminderMessage({
                              guestName: e.name,
                              eventName: event.name,
                              eventDate: event.date,
                              location: event.location,
                            }))}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Enviar lembrete do evento"
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-primary hover:bg-primary/10 transition"
                          >
                            <Bell className="h-3.5 w-3.5" />
                          </a>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteEntryMut.mutate(e.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PromoterSection({ 
  title, 
  icon, 
  stats, 
  promoters, 
  onCopy, 
  onEdit, 
  onRemove,
  onViewList 
}: { 
  title: string; 
  icon: React.ReactNode; 
  stats: any[]; 
  promoters: any[]; 
  onCopy: (slug: string) => void;
  onEdit: (data: { id: string, name: string }) => void;
  onRemove: (id: string) => void;
  onViewList: (id: string) => void;
}) {
  if (stats.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 font-display font-bold text-sm uppercase text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="grid gap-2">
        {stats.map((s, idx) => (
          <div
            key={s.ep.id}
            className="rounded-lg border border-border/60 bg-card/40 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">
                    {s.ep.display_name || promoters.find(p => p.id === s.ep.promoter_id)?.name || "Link"}
                  </span>
                  {s.ep.category === 'promoter' && (
                    <Badge variant="secondary" className="text-[10px]">
                      #{idx + 1}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
                  <span className="text-muted-foreground">
                    <Users className="h-3 w-3 inline mr-1" />
                    {s.total} na lista
                  </span>
                  <span className="text-success">
                    <Check className="h-3 w-3 inline mr-1" />
                    {s.present} presentes
                  </span>
                  {s.total > 0 && (
                    <span className="text-primary font-medium">
                      {s.rate.toFixed(0)}% conversão
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onCopy(s.ep.slug)}
                  title="Copiar link"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                {s.ep.category !== 'promoter' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onEdit({ id: s.ep.id, name: s.ep.display_name || "" })}
                    title="Editar nome"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onViewList(s.ep.id)}
                >
                  <LinkIcon className="h-3.5 w-3.5 mr-1" />
                  Ver lista
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemove(s.ep.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
