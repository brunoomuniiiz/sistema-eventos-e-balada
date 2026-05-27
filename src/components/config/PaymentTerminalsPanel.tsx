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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, CreditCard, Loader2, Pencil, Users, X } from "lucide-react";
import { toast } from "sonner";

type Terminal = {
  id: string;
  label: string;
  provider: "mercado_pago" | "manual";
  mode: "mp_integrated" | "manual";
  mp_device_id: string | null;
  owner_label: string | null;
  accepts_credito: boolean;
  accepts_debito: boolean;
  accepts_pix: boolean;
  is_active: boolean;
};

type Seller = { user_id: string; display_name: string | null; email: string | null };
type Assignment = { id: string; terminal_id: string; seller_user_id: string };

const empty = {
  label: "",
  provider: "manual" as "mercado_pago" | "manual",
  mode: "manual" as "mp_integrated" | "manual",
  mp_device_id: "",
  owner_label: "",
  accepts_credito: true,
  accepts_debito: true,
  accepts_pix: false,
  is_active: true,
};

export function PaymentTerminalsPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Terminal | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [expandedTerminal, setExpandedTerminal] = useState<string | null>(null);

  const { data: terminals = [], isLoading } = useQuery({
    queryKey: ["payment-terminals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_terminals")
        .select("id, label, provider, mode, mp_device_id, owner_label, accepts_credito, accepts_debito, accepts_pix, is_active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Terminal[];
    },
  });

  const { data: sellers = [] } = useQuery({
    queryKey: ["terminal-sellers", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, display_name, email, permissions, role")
        .eq("owner_id", user!.id);
      if (error) throw error;
      // Mantém owner + qualquer staff com vendas/lojinha/portaria
      return (data ?? [])
        .filter((r) => r.role === "owner" || (r.permissions ?? []).some((p: string) => ["vendas", "lojinha", "portaria"].includes(p)))
        .map((r) => ({ user_id: r.user_id, display_name: r.display_name, email: r.email })) as Seller[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["terminal-assignments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terminal_assignments")
        .select("id, terminal_id, seller_user_id");
      if (error) throw error;
      return data as Assignment[];
    },
  });

  const sellerName = (uid: string) => {
    const s = sellers.find((x) => x.user_id === uid);
    return s?.display_name || s?.email || uid.slice(0, 6);
  };

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
      mode: t.mode,
      mp_device_id: t.mp_device_id ?? "",
      owner_label: t.owner_label ?? "",
      accepts_credito: t.accepts_credito,
      accepts_debito: t.accepts_debito,
      accepts_pix: t.accepts_pix,
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
        provider: form.mode === "mp_integrated" ? "mercado_pago" : "manual",
        mode: form.mode,
        mp_device_id: form.mode === "mp_integrated" ? form.mp_device_id.trim() || null : null,
        owner_label: form.owner_label.trim() || null,
        accepts_credito: form.accepts_credito,
        accepts_debito: form.accepts_debito,
        accepts_pix: form.accepts_pix,
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

  const assignSeller = async (terminalId: string, sellerUserId: string) => {
    if (!user || !sellerUserId) return;
    const exists = assignments.some((a) => a.terminal_id === terminalId && a.seller_user_id === sellerUserId);
    if (exists) {
      toast.info("Vendedor já atribuído");
      return;
    }
    const { error } = await supabase
      .from("terminal_assignments")
      .insert({ user_id: user.id, terminal_id: terminalId, seller_user_id: sellerUserId });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["terminal-assignments"] });
  };

  const unassignSeller = async (assignmentId: string) => {
    const { error } = await supabase.from("terminal_assignments").delete().eq("id", assignmentId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["terminal-assignments"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground max-w-2xl">
          Cadastre todas as maquininhas (próprias, do sócio, MP Point, Cielo, Stone...).
          As integradas com MP cobram sozinhas; as manuais aparecem como botão pro vendedor escolher.
          Você pode atribuir cada maquininha a vendedores específicos — só esses verão o botão no PDV.
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
          {terminals.map((t) => {
            const myAssignments = assignments.filter((a) => a.terminal_id === t.id);
            const isExpanded = expandedTerminal === t.id;
            const unassigned = sellers.filter((s) => !myAssignments.some((a) => a.seller_user_id === s.user_id));
            return (
              <Card key={t.id} className={!t.is_active ? "opacity-60" : ""}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{t.label}</span>
                        <Badge variant={t.mode === "mp_integrated" ? "default" : "secondary"} className="text-[10px]">
                          {t.mode === "mp_integrated" ? "Integrada MP" : "Manual"}
                        </Badge>
                        {!t.is_active && <Badge variant="outline" className="text-[10px]">Inativa</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[
                          t.owner_label,
                          t.accepts_credito && "Crédito",
                          t.accepts_debito && "Débito",
                          t.accepts_pix && "PIX",
                        ].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isExpanded ? "secondary" : "ghost"}
                      className="gap-1 text-xs h-8"
                      onClick={() => setExpandedTerminal(isExpanded ? null : t.id)}
                    >
                      <Users className="h-3.5 w-3.5" />
                      {myAssignments.length || "Todos"}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(t)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="border-t pt-2 space-y-2">
                      <div className="text-[11px] uppercase text-muted-foreground tracking-wide">
                        Vendedores atribuídos {myAssignments.length === 0 && "(vazio = todos podem usar)"}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {myAssignments.map((a) => (
                          <Badge key={a.id} variant="secondary" className="gap-1 pr-1">
                            {sellerName(a.seller_user_id)}
                            <button
                              onClick={() => unassignSeller(a.id)}
                              className="hover:bg-destructive/20 rounded"
                              aria-label="Remover"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        {myAssignments.length === 0 && (
                          <span className="text-xs text-muted-foreground">Nenhum — todos vêem essa maquininha</span>
                        )}
                      </div>
                      {unassigned.length > 0 && (
                        <Select onValueChange={(v) => assignSeller(t.id, v)} value="">
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="+ Atribuir vendedor…" /></SelectTrigger>
                          <SelectContent>
                            {unassigned.map((s) => (
                              <SelectItem key={s.user_id} value={s.user_id}>
                                {s.display_name || s.email || s.user_id.slice(0, 6)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
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
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="MP Point Bar / Cielo do sócio / Stone parceiro" />
            </div>
            <div>
              <Label>Modo</Label>
              <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v as "mp_integrated" | "manual", provider: v === "mp_integrated" ? "mercado_pago" : "manual" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual / etiqueta (vendedor cobra na máquina)</SelectItem>
                  <SelectItem value="mp_integrated">Integrada Mercado Pago (cobra sozinha)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {form.mode === "mp_integrated"
                  ? "Valor é enviado pra maquininha e cai automático via webhook."
                  : "Vendedor digita o valor na máquina física e confirma aqui."}
              </p>
            </div>
            {form.mode === "mp_integrated" && (
              <div>
                <Label>Serial / Device ID</Label>
                <Input value={form.mp_device_id} onChange={(e) => setForm({ ...form, mp_device_id: e.target.value })} placeholder="PAX_A910__SMARTPOS123456" />
              </div>
            )}
            <div>
              <Label>CNPJ / dono (opcional)</Label>
              <Input value={form.owner_label} onChange={(e) => setForm({ ...form, owner_label: e.target.value })} placeholder="Meu CNPJ / Parceiro X / Sócio" />
              <p className="text-[11px] text-muted-foreground mt-1">Aparece como sublegenda pra você identificar de quem é a máquina.</p>
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
              <div>
                <Label>Aceita PIX próprio</Label>
                <p className="text-[11px] text-muted-foreground">Marque se essa máquina cobra PIX (QR dela mesma).</p>
              </div>
              <Switch checked={form.accepts_pix} onCheckedChange={(v) => setForm({ ...form, accepts_pix: v })} />
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
