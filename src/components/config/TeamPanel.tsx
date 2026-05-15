import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions, ALL_PERMISSIONS, type Permission } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, UserCog, Crown, Pencil, ShieldCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TeamMember = {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: "owner" | "staff";
  role_preset: string | null;
  permissions: Permission[];
  can_discount: boolean;
  max_discount_percent: number;
  can_sell_cash: boolean;
  can_authorize: boolean;
};

type FormState = {
  email: string;
  password: string;
  display_name: string;
  role_preset: string;
  permissions: Permission[];
  can_discount: boolean;
  max_discount_percent: number;
  can_sell_cash: boolean;
  can_authorize: boolean;
};

type Preset = {
  key: string;
  label: string;
  description: string;
  permissions: Permission[];
  can_authorize: boolean;
  can_discount: boolean;
  max_discount_percent: number;
  can_sell_cash: boolean;
};

const PRESETS: Preset[] = [
  { key: "caixa_bar", label: "Caixa do Bar", description: "Vende no PDV; sangria/desconto extra precisa de autorização",
    permissions: ["vendas"], can_authorize: false, can_discount: false, max_discount_percent: 0, can_sell_cash: true },
  { key: "caixa_portaria", label: "Caixa da Portaria", description: "Só acessa a aba Portaria (check-in e cobrança de entrada)",
    permissions: ["portaria"], can_authorize: false, can_discount: false, max_discount_percent: 0, can_sell_cash: true },
  { key: "gerente", label: "Gerente", description: "Acesso amplo + pode autorizar sangria, desconto e fechamento",
    permissions: ["vendas", "estoque", "eventos", "promoters", "financeiro", "portaria", "funcionarios"],
    can_authorize: true, can_discount: true, max_discount_percent: 100, can_sell_cash: true },
  { key: "custom", label: "Personalizado", description: "Marque manualmente as permissões abaixo",
    permissions: [], can_authorize: false, can_discount: false, max_discount_percent: 0, can_sell_cash: true },
];

const emptyForm = (): FormState => ({
  email: "",
  password: "",
  display_name: "",
  role_preset: "caixa_bar",
  permissions: ["vendas"],
  can_discount: false,
  max_discount_percent: 0,
  can_sell_cash: true,
  can_authorize: false,
});

export function TeamPanel() {
  const { user } = useAuth();
  const { isOwner, ownerId, can } = usePermissions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const { data: team = [] } = useQuery({
    queryKey: ["team", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, display_name, email, role, permissions, can_discount, max_discount_percent, can_sell_cash, can_authorize")
        .eq("owner_id", ownerId!)
        .order("role", { ascending: true });
      if (error) throw error;
      return data as TeamMember[];
    },
    enabled: !!ownerId && can("funcionarios"),
  });

  if (!can("funcionarios")) {
    return <div className="text-sm text-muted-foreground">Sem permissão para gerenciar funcionários.</div>;
  }

  const openNew = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (m: TeamMember) => {
    if (m.role === "owner") return;
    setEditing(m);
    setForm({
      email: m.email ?? "",
      password: "",
      display_name: m.display_name ?? "",
      permissions: m.permissions ?? [],
      can_discount: !!m.can_discount,
      max_discount_percent: Number(m.max_discount_percent ?? 0),
      can_sell_cash: m.can_sell_cash !== false,
      can_authorize: !!m.can_authorize,
    });
    setOpen(true);
  };

  const togglePerm = (p: Permission) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("user_roles")
          .update({
            display_name: form.display_name,
            permissions: form.permissions,
            can_discount: form.can_discount,
            max_discount_percent: Math.max(0, Math.min(100, Number(form.max_discount_percent) || 0)),
            can_sell_cash: form.can_sell_cash,
            can_authorize: form.can_authorize,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Funcionário atualizado");
      } else {
        if (!form.email || !form.password) return toast.error("Email e senha são obrigatórios");
        const { data, error } = await supabase.functions.invoke("invite-staff", {
          body: {
            email: form.email,
            password: form.password,
            display_name: form.display_name || form.email.split("@")[0],
            permissions: form.permissions,
            can_discount: form.can_discount,
            max_discount_percent: Math.max(0, Math.min(100, Number(form.max_discount_percent) || 0)),
            can_sell_cash: form.can_sell_cash,
            can_authorize: form.can_authorize,
          },
        });
        if (error) throw error;
        if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
        toast.success("Funcionário criado!");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["team"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: TeamMember) => {
    if (m.role === "owner") return;
    if (!confirm(`Remover ${m.display_name ?? m.email}?`)) return;
    try {
      const { data, error } = await supabase.functions.invoke("delete-staff", {
        body: { staff_user_id: m.user_id },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["team"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Convide funcionários, defina permissões e edite a qualquer momento.
        </div>
        {isOwner && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4" /> Novo funcionário</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar funcionário" : "Novo funcionário"}</DialogTitle>
                <DialogDescription>
                  {editing ? "Ajuste o nome e as permissões." : "Crie a conta de acesso e marque o que ele pode usar."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
                </div>
                {!editing && (
                  <>
                    <div>
                      <Label>Email</Label>
                      <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div>
                      <Label>Senha (mín. 6)</Label>
                      <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    </div>
                  </>
                )}
                <div>
                  <Label className="mb-2 block">Permissões</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                    {ALL_PERMISSIONS.map((p) => (
                      <label key={p.key} className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-accent/40">
                        <Checkbox checked={form.permissions.includes(p.key)} onCheckedChange={() => togglePerm(p.key)} />
                        <span className="text-sm">{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Caixa & Autorização</div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={form.can_sell_cash} onCheckedChange={(v) => setForm({ ...form, can_sell_cash: !!v })} />
                    <span className="text-sm">Pode receber em dinheiro</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={form.can_discount} onCheckedChange={(v) => setForm({ ...form, can_discount: !!v })} />
                    <span className="text-sm">Pode aplicar desconto</span>
                  </label>
                  {form.can_discount && (
                    <div>
                      <Label className="text-xs">Desconto máximo por venda (%)</Label>
                      <Input
                        type="number" min={0} max={100} step="0.5"
                        value={form.max_discount_percent}
                        onChange={(e) => setForm({ ...form, max_discount_percent: Number(e.target.value) })}
                      />
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer pt-1 border-t">
                    <Checkbox checked={form.can_authorize} onCheckedChange={(v) => setForm({ ...form, can_authorize: !!v })} />
                    <span className="text-sm flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      Pode autorizar (sangria, desconto extra, fechamento)
                    </span>
                  </label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : editing ? "Salvar" : "Criar acesso"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {team.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <UserCog className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Nenhum funcionário ainda
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {team.map((m) => (
            <Card key={m.id}>
              <CardContent className="p-4 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {m.role === "owner" && <Crown className="h-4 w-4 text-primary" />}
                    {m.display_name ?? m.email}
                    {m.can_authorize && m.role !== "owner" && (
                      <Badge variant="default" className="gap-1"><ShieldCheck className="h-3 w-3" /> Autoriza</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {m.role === "owner" ? (
                      <Badge variant="default">Acesso total</Badge>
                    ) : m.permissions.length === 0 ? (
                      <Badge variant="outline">Sem permissões</Badge>
                    ) : (
                      m.permissions.map((p) => (
                        <Badge key={p} variant="secondary">{ALL_PERMISSIONS.find((x) => x.key === p)?.label ?? p}</Badge>
                      ))
                    )}
                  </div>
                </div>
                {isOwner && m.role !== "owner" && m.user_id !== user?.id && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(m)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
