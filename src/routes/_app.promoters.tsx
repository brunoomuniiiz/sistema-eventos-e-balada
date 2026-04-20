import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Users, Phone, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type Promoter = Database["public"]["Tables"]["promoters"]["Row"];

export const Route = createFileRoute("/_app/promoters")({
  component: PromotersPage,
});

function PromotersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promoter | null>(null);

  const { data: promoters = [] } = useQuery({
    queryKey: ["promoters", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("promoters").select("*").order("name");
      if (error) throw error;
      return data;
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
    <div>
      <PageHeader
        title="Promoters"
        subtitle={`${promoters.length} ${promoters.length === 1 ? "promoter cadastrado" : "promoters cadastrados"}`}
        actions={
          <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-gradient-primary text-primary-foreground glow-primary">
            <Plus className="h-4 w-4 mr-1.5" /> Novo promoter
          </Button>
        }
      />

      {promoters.length === 0 ? (
        <Card className="glass border-border/60">
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">Nenhum promoter cadastrado ainda.</p>
            <Button onClick={() => { setEditing(null); setOpen(true); }} className="mt-5 bg-gradient-primary text-primary-foreground">
              <Plus className="h-4 w-4 mr-1.5" /> Cadastrar primeiro
            </Button>
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
                      <div className="text-xs text-muted-foreground">Comissão</div>
                      <div className="font-bold text-primary">{p.commission_percent}%</div>
                    </div>
                  </div>
                  <div className="flex items-end justify-between mt-3 pt-3 border-t border-border/50">
                    <div>
                      <div className="text-xs text-muted-foreground">Saldo acumulado</div>
                      <div className="font-bold text-success">{formatBRL(Number(p.accumulated_balance))}</div>
                    </div>
                    <div className="flex gap-1">
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PromoterDialog open={open} onOpenChange={setOpen} promoter={editing} />
    </div>
  );
}

function PromoterDialog({ open, onOpenChange, promoter }: { open: boolean; onOpenChange: (v: boolean) => void; promoter: Promoter | null }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [commission, setCommission] = useState(10);
  const [balance, setBalance] = useState(0);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setName(promoter?.name ?? "");
      setPhone(promoter?.phone ?? "");
      setEmail(promoter?.email ?? "");
      setCommission(Number(promoter?.commission_percent ?? 10));
      setBalance(Number(promoter?.accumulated_balance ?? 0));
      setNotes(promoter?.notes ?? "");
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
        commission_percent: commission,
        accumulated_balance: balance,
        notes: notes.trim() || null,
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
      <DialogContent className="glass max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl text-gradient">{promoter ? "Editar promoter" : "Novo promoter"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }} className="space-y-4 mt-2">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-comm">Comissão (%)</Label>
              <Input id="p-comm" type="number" min="0" max="100" step="0.1" value={commission} onChange={(e) => setCommission(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-bal">Saldo (R$)</Label>
              <Input id="p-bal" type="number" step="0.01" value={balance} onChange={(e) => setBalance(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-notes">Anotações</Label>
            <Textarea id="p-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
