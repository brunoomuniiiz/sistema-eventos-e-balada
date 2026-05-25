import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Users, Phone, Mail, Sparkles, History, KeyRound, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";

type Promoter = Database["public"]["Tables"]["promoters"]["Row"];

export function PromotersPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promoter | null>(null);
  const [historyOf, setHistoryOf] = useState<Promoter | null>(null);
  const [inviting, setInviting] = useState<Promoter | null>(null);

  const { data: promoters = [] } = useQuery({
    queryKey: ["promoters", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("promoters").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: balances = {} } = useQuery({
    queryKey: ["promoter-balances", promoters.map((p) => p.id).join(",")],
    enabled: promoters.length > 0,
    queryFn: async () => {
      const out: Record<string, number> = {};
      for (const p of promoters) {
        const { data } = await supabase.rpc("promoter_active_balance", { _promoter_id: p.id });
        out[p.id] = Number(data ?? 0);
      }
      return out;
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("promoters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Promoter removido");
      qc.invalidateQueries({ queryKey: ["promoters"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          {promoters.length} {promoters.length === 1 ? "promoter cadastrado" : "promoters cadastrados"}
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-gradient-primary text-primary-foreground glow-primary">
          <Plus className="h-4 w-4 mr-1.5" /> Novo promoter
        </Button>
      </div>

      {promoters.length === 0 ? (
        <Card className="glass border-border/60">
          <CardContent className="py-12 text-center">
            <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">Nenhum promoter cadastrado ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {promoters.map((p) => (
            <Card key={p.id} className="glass border-border/60 hover:border-primary/40 transition-colors">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-accent grid place-items-center text-accent-foreground font-bold text-lg shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{p.name}</h3>
                      <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                        {p.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {p.phone}</div>}
                        {p.email && <div className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" /> {p.email}</div>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">Saldo ativo</div>
                      <div className="font-bold text-success flex items-center gap-1 justify-end">
                        <Sparkles className="h-3 w-3" />
                        {formatBRL(balances[p.id] ?? 0)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1 mt-3 text-[11px]">
                    <CommBadge label="♀ free" type={p.comm_woman_free_type} value={Number(p.comm_woman_free_value)} />
                    <CommBadge label="♀ pago" type={p.comm_woman_paid_type} value={Number(p.comm_woman_paid_value)} />
                    <CommBadge label="♂ free" type={p.comm_man_free_type} value={Number(p.comm_man_free_value)} />
                    <CommBadge label="♂ pago" type={p.comm_man_paid_type} value={Number(p.comm_man_paid_value)} />
                  </div>

                  <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-border/50">
                    <Button size="sm" variant="ghost" onClick={() => setHistoryOf(p)}>
                      <History className="h-3.5 w-3.5" /> histórico
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (confirm(`Remover "${p.name}"?`)) deleteMut.mutate(p.id);
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PromoterDialog open={open} onOpenChange={setOpen} promoter={editing} />
      <PromoterHistoryDialog promoter={historyOf} onOpenChange={(v) => !v && setHistoryOf(null)} />
    </div>
  );
}

function CommBadge({ label, type, value }: { label: string; type: string; value: number }) {
  const txt = type === "percent" ? `${value}%` : formatBRL(value);
  return (
    <div className="flex items-center justify-between rounded bg-muted/40 px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{txt}</span>
    </div>
  );
}

function PromoterDialog({ open, onOpenChange, promoter }: { open: boolean; onOpenChange: (v: boolean) => void; promoter: Promoter | null }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  // Comissões
  const [wfT, setWfT] = useState<"fixed" | "percent">("fixed");
  const [wfV, setWfV] = useState(3);
  const [wpT, setWpT] = useState<"fixed" | "percent">("percent");
  const [wpV, setWpV] = useState(25);
  const [mfT, setMfT] = useState<"fixed" | "percent">("fixed");
  const [mfV, setMfV] = useState(2);
  const [mpT, setMpT] = useState<"fixed" | "percent">("fixed");
  const [mpV, setMpV] = useState(5);

  useEffect(() => {
    if (open) {
      setName(promoter?.name ?? "");
      setPhone(promoter?.phone ?? "");
      setEmail(promoter?.email ?? "");
      setNotes(promoter?.notes ?? "");
      setWfT((promoter?.comm_woman_free_type ?? "fixed") as "fixed" | "percent");
      setWfV(Number(promoter?.comm_woman_free_value ?? 3));
      setWpT((promoter?.comm_woman_paid_type ?? "percent") as "fixed" | "percent");
      setWpV(Number(promoter?.comm_woman_paid_value ?? 25));
      setMfT((promoter?.comm_man_free_type ?? "fixed") as "fixed" | "percent");
      setMfV(Number(promoter?.comm_man_free_value ?? 2));
      setMpT((promoter?.comm_man_paid_type ?? "fixed") as "fixed" | "percent");
      setMpV(Number(promoter?.comm_man_paid_value ?? 5));
    }
  }, [open, promoter]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const payload = {
        user_id: user.id,
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
        comm_woman_free_type: wfT,
        comm_woman_free_value: wfV,
        comm_woman_paid_type: wpT,
        comm_woman_paid_value: wpV,
        comm_man_free_type: mfT,
        comm_man_free_value: mfV,
        comm_man_paid_type: mpT,
        comm_man_paid_value: mpV,
      };
      if (promoter) {
        const { error } = await supabase.from("promoters").update(payload).eq("id", promoter.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("promoters").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(promoter ? "Atualizado" : "Cadastrado");
      qc.invalidateQueries({ queryKey: ["promoters"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl text-gradient">{promoter ? "Editar promoter" : "Novo promoter"}</DialogTitle>
          <DialogDescription>Comissões geram crédito no bar — válido pelos próximos 2 eventos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }} className="space-y-4 mt-2">
          <Tabs defaultValue="dados">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="comissoes">Comissões</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="space-y-3 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">Nome *</Label>
                <Input id="p-name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="p-phone">Telefone</Label>
                  <Input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-email">Email</Label>
                  <Input id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-notes">Anotações</Label>
                <Textarea id="p-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </TabsContent>

            <TabsContent value="comissoes" className="space-y-3 pt-4">
              <CommRow label="Mulher na lista FREE" type={wfT} value={wfV} setType={setWfT} setValue={setWfV} />
              <CommRow label="Mulher PAGANTE" type={wpT} value={wpV} setType={setWpT} setValue={setWpV} />
              <CommRow label="Homem na lista FREE" type={mfT} value={mfV} setType={setMfT} setValue={setMfV} />
              <CommRow label="Homem PAGANTE" type={mpT} value={mpV} setType={setMpT} setValue={setMpV} />
              <p className="text-[11px] text-muted-foreground">
                Crédito de entrada FREE só é gerado quando o tipo é valor fixo.
                Para entradas pagantes, percentual incide sobre o valor pago.
              </p>
            </TabsContent>
          </Tabs>

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

function CommRow({ label, type, value, setType, setValue }: {
  label: string;
  type: "fixed" | "percent";
  value: number;
  setType: (v: "fixed" | "percent") => void;
  setValue: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_110px_100px] gap-2 items-center">
      <Label className="text-sm">{label}</Label>
      <Select value={type} onValueChange={(v) => setType(v as "fixed" | "percent")}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="fixed">R$ fixo</SelectItem>
          <SelectItem value="percent">% do pago</SelectItem>
        </SelectContent>
      </Select>
      <Input type="number" step="0.01" min={0} value={value} onChange={(e) => setValue(Number(e.target.value) || 0)} className="h-9" />
    </div>
  );
}

function PromoterHistoryDialog({ promoter, onOpenChange }: { promoter: Promoter | null; onOpenChange: (v: boolean) => void }) {
  const { data: credits = [] } = useQuery({
    queryKey: ["promoter-credits-history", promoter?.id],
    enabled: !!promoter,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promoter_credits")
        .select("id, amount, source, status, gender, created_at, event_id")
        .eq("promoter_id", promoter!.id)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      const rows = data ?? [];
      const eventIds = Array.from(new Set(rows.map((r) => r.event_id))).filter(Boolean);
      let map: Record<string, string> = {};
      if (eventIds.length > 0) {
        const { data: evs } = await supabase.from("events").select("id, name").in("id", eventIds);
        map = Object.fromEntries((evs ?? []).map((e) => [e.id, e.name]));
      }
      return rows.map((r) => ({ ...r, event_name: map[r.event_id] ?? null }));
    },
  });

  const { data: redemptions = [] } = useQuery({
    queryKey: ["promoter-redemptions", promoter?.id],
    enabled: !!promoter,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promoter_credit_redemptions")
        .select("id, amount, created_at, sale_id")
        .eq("promoter_id", promoter!.id)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Dialog open={!!promoter} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Histórico — {promoter?.name}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="ganhos" className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="ganhos">Créditos ganhos</TabsTrigger>
            <TabsTrigger value="gastos">Consumos</TabsTrigger>
          </TabsList>
          <TabsContent value="ganhos" className="space-y-1 pt-3">
            {credits.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sem créditos ainda.</p>
            ) : credits.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 p-2 rounded border bg-card/40 text-sm">
                <Badge variant={c.status === "active" ? "default" : c.status === "consumed" ? "secondary" : "outline"}>
                  {c.status}
                </Badge>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {c.event_name ?? "—"} · {c.source}{c.gender ? ` · ${c.gender}` : ""}
                </span>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}
                </span>
                <span className="font-semibold text-success">+{formatBRL(Number(c.amount))}</span>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="gastos" className="space-y-1 pt-3">
            {redemptions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum consumo ainda.</p>
            ) : redemptions.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded border bg-card/40 text-sm">
                <span className="text-xs text-muted-foreground">Venda {String(r.sale_id).slice(0, 8)}…</span>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {format(new Date(r.created_at), "dd/MM HH:mm", { locale: ptBR })}
                </span>
                <span className="font-semibold text-destructive">-{formatBRL(Number(r.amount))}</span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
