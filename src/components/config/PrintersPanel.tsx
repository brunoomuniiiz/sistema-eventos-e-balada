import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, Printer, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

type Pr = { id: string; name: string; location: string | null; notes: string | null };

const empty = { name: "", location: "", notes: "" };

export function PrintersPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Pr | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const { data: printers = [], isLoading } = useQuery({
    queryKey: ["printers", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("printers")
        .select("id, name, location, notes")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pr[];
    },
  });

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (p: Pr) => {
    setEditing(p);
    setForm({ name: p.name, location: p.location ?? "", notes: p.notes ?? "" });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.name.trim()) return toast.error("Informe o nome");
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name: form.name.trim(),
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("printers").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Impressora atualizada");
      } else {
        const { error } = await supabase.from("printers").insert(payload);
        if (error) throw error;
        toast.success("Impressora cadastrada");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["printers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Pr) => {
    if (!confirm(`Remover impressora "${p.name}"?`)) return;
    const { error } = await supabase.from("printers").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Removida");
    qc.invalidateQueries({ queryKey: ["printers"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground max-w-2xl">
          Lista das impressoras térmicas do bar. <strong>Esse cadastro é só pra organização interna</strong> — o sistema dispara <code className="text-xs bg-muted px-1 rounded">window.print()</code> e quem decide pra qual impressora vai é o navegador/sistema operacional de cada aparelho. Configure a impressora padrão em cada tablet/celular.
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4" /> Nova impressora</Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : printers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Printer className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Nenhuma impressora cadastrada
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {printers.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <Printer className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[p.location, p.notes].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(p)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar impressora" : "Nova impressora"}</DialogTitle>
            <DialogDescription>Documentação interna das impressoras físicas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Térmica Copa" />
            </div>
            <div>
              <Label>Localização</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Cozinha, balcão da copa, caixa fixo" />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Bluetooth pareada nos celulares dos garçons e no tablet do caixa" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
