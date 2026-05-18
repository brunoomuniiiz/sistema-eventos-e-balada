import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Smartphone, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

type Device = {
  id: string;
  mp_device_id: string;
  label: string;
  assigned_to_user_id: string | null;
  created_at: string;
};

type StaffOption = { user_id: string; display_name: string | null; email: string | null };

export function LojinhaDevicesPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: "", mp_device_id: "", assigned_to_user_id: "none" });
  const [saving, setSaving] = useState(false);

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ["lojinha-point-devices", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lojinha_point_devices")
        .select("id, mp_device_id, label, assigned_to_user_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Device[];
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["lojinha-staff-with-card", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, display_name, email, lojinha_payment_methods")
        .eq("owner_id", user!.id);
      if (error) throw error;
      return (data ?? []).filter((r) => (r.lojinha_payment_methods ?? []).includes("card")) as unknown as StaffOption[];
    },
  });

  const create = async () => {
    if (!user) return;
    if (!form.label.trim() || !form.mp_device_id.trim()) {
      toast.error("Informe nome e serial");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("lojinha_point_devices").insert({
        user_id: user.id,
        label: form.label.trim(),
        mp_device_id: form.mp_device_id.trim(),
        assigned_to_user_id: form.assigned_to_user_id === "none" ? null : form.assigned_to_user_id,
      });
      if (error) throw error;
      toast.success("Maquininha cadastrada");
      setOpen(false);
      setForm({ label: "", mp_device_id: "", assigned_to_user_id: "none" });
      qc.invalidateQueries({ queryKey: ["lojinha-point-devices"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: Device) => {
    if (!confirm(`Remover maquininha "${d.label}"?`)) return;
    const { error } = await supabase.from("lojinha_point_devices").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Removida");
    qc.invalidateQueries({ queryKey: ["lojinha-point-devices"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Cadastre as maquininhas Mercado Pago Point Smart. O serial fica embaixo da maquininha (ou em Configurações → Sobre).
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Nova maquininha</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova maquininha</DialogTitle>
              <DialogDescription>Use um nome curto para identificar (ex: "Bar 1", "Garçom João").</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Bar 1" />
              </div>
              <div>
                <Label>Serial (Device ID)</Label>
                <Input value={form.mp_device_id} onChange={(e) => setForm({ ...form, mp_device_id: e.target.value })} placeholder="PAX_A910__SMARTPOS123456" />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Encontrado no Mercado Pago em Maquininhas → Detalhes da maquininha.
                </p>
              </div>
              <div>
                <Label>Garçom vinculado (opcional)</Label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={form.assigned_to_user_id}
                  onChange={(e) => setForm({ ...form, assigned_to_user_id: e.target.value })}
                >
                  <option value="none">Livre (qualquer um usa)</option>
                  {staff.map((s) => (
                    <option key={s.user_id} value={s.user_id}>{s.display_name ?? s.email}</option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={create} disabled={saving}>{saving ? "Salvando..." : "Cadastrar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid place-items-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : devices.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Smartphone className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Nenhuma maquininha cadastrada
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {devices.map((d) => {
            const owner = staff.find((s) => s.user_id === d.assigned_to_user_id);
            return (
              <Card key={d.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{d.label}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {d.mp_device_id} · {owner ? `vinculada a ${owner.display_name ?? owner.email}` : "livre"}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(d)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-dashed border-warning/40 bg-warning/5 p-3 text-xs">
        <strong>Sincronização automática:</strong> assim que o token do Mercado Pago for conectado, vamos listar as maquininhas direto da sua conta MP — por enquanto cadastre o serial manualmente.
      </div>
    </div>
  );
}
