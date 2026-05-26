import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, CreditCard, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

type Terminal = {
  id: string;
  label: string;
  provider: "mercado_pago" | "manual";
  mp_device_id: string | null;
  owner_label: string | null;
  accepts_credito: boolean;
  accepts_debito: boolean;
  is_active: boolean;
};

const empty = {
  label: "",
  provider: "manual" as "mercado_pago" | "manual",
  mp_device_id: "",
  owner_label: "",
  accepts_credito: true,
  accepts_debito: true,
  is_active: true,
};

export function PaymentTerminalsPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Terminal | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const { data: terminals = [], isLoading } = useQuery({
    queryKey: ["payment-terminals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_terminals")
        .select("id, label, provider, mp_device_id, owner_label, accepts_credito, accepts_debito, is_active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Terminal[];
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (t: Terminal) => {
    setEditing(t);
    setForm({
      label: t.label,
      provider: t.provider,
      mp_device_id: t.mp_device_id ?? "",
      owner_label: t.owner_label ?? "",
      accepts_credito: t.accepts_credito,
      accepts_debito: t.accepts_debito,
      is_active: t.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.label.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        label: form.label.trim(),
        provider: form.provider,
        mp_device_id: form.provider === "mercado_pago" ? form.mp_device_id.trim() || null : null,
        owner_label: form.owner_label.trim() || null,
        accepts_credito: form.accepts_credito,
        accepts_debito: form.accepts_debito,
        is_active: form.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("payment_terminals").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Maquininha atualizada");
      } else {
        const { error } = await supabase.from("payment_terminals").insert(payload);
        if (error) throw error;
        toast.success("Maquininha cadastrada");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["payment-terminals"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: Terminal) => {
    if (!confirm(`Remover maquininha "${t.label}"?`)) return;
    const { error } = await supabase.from("payment_terminals").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Removida");
    qc.invalidateQueries({ queryKey: ["payment-terminals"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground max-w-2xl">
          Cadastre todas as maquininhas que aceitam cartão (próprias, do sócio, MP Point, Cielo, Itaú...).
          Só Mercado Pago Point tem integração automática — as outras servem como rótulo para o operador escolher na hora da venda.
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4" /> Nova maquininha</Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : terminals.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Nenhuma maquininha cadastrada
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {terminals.map((t) => (
            <Card key={t.id} className={!t.is_active ? "opacity-60" : ""}>
              <CardContent className="p-3 flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{t.label}</span>
                    <Badge variant={t.provider === "mercado_pago" ? "default" : "secondary"} className="text-[10px]">
                      {t.provider === "mercado_pago" ? "MP Point (API)" : "Manual"}
                    </Badge>
                    {!t.is_active && <Badge variant="outline" className="text-[10px]">Inativa</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[
                      t.owner_label,
                      t.accepts_credito && "Crédito",
                      t.accepts_debito && "Débito",
                    ].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => openEdit(t)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(t)}>
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
            <DialogTitle>{editing ? "Editar maquininha" : "Nova maquininha"}</DialogTitle>
            <DialogDescription>Identifique a máquina pra aparecer no menu de pagamento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="MP Point Bar / Cielo do sócio / Itaú caixa" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v as "mercado_pago" | "manual" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (operador digita na máquina)</SelectItem>
                  <SelectItem value="mercado_pago">Mercado Pago Point (com API)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.provider === "mercado_pago" && (
              <div>
                <Label>Serial (Device ID)</Label>
                <Input value={form.mp_device_id} onChange={(e) => setForm({ ...form, mp_device_id: e.target.value })} placeholder="PAX_A910__SMARTPOS123456" />
              </div>
            )}
            <div>
              <Label>CNPJ / dono (opcional)</Label>
              <Input value={form.owner_label} onChange={(e) => setForm({ ...form, owner_label: e.target.value })} placeholder="CNPJ Bar / CNPJ Sócio / Pessoa Física" />
              <p className="text-[11px] text-muted-foreground mt-1">Pra separar nos relatórios quem recebeu.</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Aceita Crédito</Label>
              <Switch checked={form.accepts_credito} onCheckedChange={(v) => setForm({ ...form, accepts_credito: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Aceita Débito</Label>
              <Switch checked={form.accepts_debito} onCheckedChange={(v) => setForm({ ...form, accepts_debito: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Ativa</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
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
