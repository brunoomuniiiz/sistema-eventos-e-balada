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
  lojinha_can_sell: boolean;
  lojinha_payment_methods: string[];
  lojinha_point_device_id: string | null;
  pode_adicionar_bebidas: boolean;
  aceita_dinheiro: boolean;
  aceita_pix: boolean;
  aceita_cartao: boolean;
};

type FormState = {
  email: string;
  password: string;
  display_name: string;
  role_preset: string;
  permissions: Permission[];
  can_discount: boolean;
  max_discount_percent: number;
  can_authorize: boolean;
  lojinha_can_sell: boolean;
  lojinha_payment_methods: string[];
  lojinha_point_device_id: string | null;
  pode_adicionar_bebidas: boolean;
  aceita_dinheiro: boolean;
  aceita_pix: boolean;
  aceita_cartao: boolean;
};

type Preset = {
  key: string;
  label: string;
  description: string;
  permissions: Permission[];
  can_authorize: boolean;
  can_discount: boolean;
  max_discount_percent: number;
};

const PRESETS: Preset[] = [
  { key: "garcom", label: "Garçom", description: "Só valida QR de pedidos online e vê a fila de entregas",
    permissions: ["lojinha"], can_authorize: false, can_discount: false, max_discount_percent: 0 },
  { key: "garcom_caixa", label: "Garçom Caixa", description: "Valida QR + vende no PDV",
    permissions: ["lojinha", "vendas"], can_authorize: false, can_discount: false, max_discount_percent: 0 },
  { key: "caixa_bar", label: "Caixa do Bar (fixo)", description: "Vende no PDV; pode escanear QR se precisar",
    permissions: ["vendas", "lojinha"], can_authorize: false, can_discount: false, max_discount_percent: 0 },
  { key: "caixa_portaria", label: "Caixa da Portaria", description: "Abre caixa na portaria, vende entradas (dinheiro/pix/cartão), faz sangria e fechamento com autorização",
    permissions: ["portaria", "vendas"], can_authorize: false, can_discount: false, max_discount_percent: 0 },
  { key: "gerente", label: "Gerente", description: "Acesso amplo + pode autorizar sangria, desconto e fechamento",
    permissions: ["vendas", "estoque", "eventos", "promoters", "financeiro", "portaria", "funcionarios", "lojinha"],
    can_authorize: true, can_discount: true, max_discount_percent: 100 },
  { key: "custom", label: "Personalizado", description: "Marque manualmente as permissões abaixo",
    permissions: [], can_authorize: false, can_discount: false, max_discount_percent: 0 },
];

const emptyForm = (): FormState => ({
  email: "",
  password: "",
  display_name: "",
  role_preset: "caixa_bar",
  permissions: ["vendas", "lojinha"],
  can_discount: false,
  max_discount_percent: 0,
  can_authorize: false,
  lojinha_can_sell: false,
  lojinha_payment_methods: [],
  lojinha_point_device_id: null,
  pode_adicionar_bebidas: false,
  aceita_dinheiro: true,
  aceita_pix: true,
  aceita_cartao: true,
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
        .select("id, user_id, display_name, email, role, role_preset, permissions, can_discount, max_discount_percent, can_sell_cash, can_authorize, lojinha_can_sell, lojinha_payment_methods, lojinha_point_device_id, pode_adicionar_bebidas, aceita_dinheiro, aceita_pix, aceita_cartao")
        .eq("owner_id", ownerId!)
        .order("role", { ascending: true });
      if (error) throw error;
      return data as TeamMember[];
    },
    enabled: !!ownerId && can("funcionarios"),
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["lojinha-point-devices", ownerId],
    enabled: !!ownerId && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lojinha_point_devices")
        .select("id, mp_device_id, label")
        .order("label");
      if (error) throw error;
      return data as Array<{ id: string; mp_device_id: string; label: string }>;
    },
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
      role_preset: m.role_preset ?? "custom",
      permissions: m.permissions ?? [],
      can_discount: !!m.can_discount,
      max_discount_percent: Number(m.max_discount_percent ?? 0),
      can_authorize: !!m.can_authorize,
      lojinha_can_sell: !!m.lojinha_can_sell,
      lojinha_payment_methods: m.lojinha_payment_methods ?? [],
      lojinha_point_device_id: m.lojinha_point_device_id ?? null,
      pode_adicionar_bebidas: !!m.pode_adicionar_bebidas,
      aceita_dinheiro: m.aceita_dinheiro !== false,
      aceita_pix: m.aceita_pix !== false,
      aceita_cartao: m.aceita_cartao !== false,
    });
    setOpen(true);
  };

  const applyPreset = (key: string) => {
    const p = PRESETS.find((x) => x.key === key);
    if (!p) return;
    setForm((f) => ({
      ...f,
      role_preset: key,
      permissions: key === "custom" ? f.permissions : p.permissions,
      can_authorize: key === "custom" ? f.can_authorize : p.can_authorize,
      can_discount: key === "custom" ? f.can_discount : p.can_discount,
      max_discount_percent: key === "custom" ? f.max_discount_percent : p.max_discount_percent,
    }));
  };

  const togglePerm = (p: Permission) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p],
    }));
  };

  const toggleLojinhaMethod = (m: "pix" | "card") => {
    setForm((f) => {
      const has = f.lojinha_payment_methods.includes(m);
      const next = has ? f.lojinha_payment_methods.filter((x) => x !== m) : [...f.lojinha_payment_methods, m];
      return {
        ...f,
        lojinha_payment_methods: next,
        lojinha_point_device_id: next.includes("card") ? f.lojinha_point_device_id : null,
        lojinha_can_sell: next.length > 0 ? true : f.lojinha_can_sell,
      };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const permsToSave = (form.lojinha_can_sell && !form.permissions.includes("lojinha"))
        ? [...form.permissions, "lojinha" as Permission]
        : form.permissions;

      if (editing) {
        const { error } = await supabase
          .from("user_roles")
          .update({
            display_name: form.display_name,
            role_preset: form.role_preset,
            permissions: permsToSave,
            can_discount: form.can_discount,
            max_discount_percent: Math.max(0, Math.min(100, Number(form.max_discount_percent) || 0)),
            can_sell_cash: form.aceita_dinheiro,
            can_authorize: form.can_authorize,
            lojinha_can_sell: form.lojinha_can_sell,
            lojinha_payment_methods: form.lojinha_payment_methods,
            lojinha_point_device_id: form.lojinha_point_device_id,
            pode_adicionar_bebidas: form.pode_adicionar_bebidas,
            aceita_dinheiro: form.aceita_dinheiro,
            aceita_pix: form.aceita_pix,
            aceita_cartao: form.aceita_cartao,
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
            role_preset: form.role_preset,
            permissions: permsToSave,
            can_discount: form.can_discount,
            max_discount_percent: Math.max(0, Math.min(100, Number(form.max_discount_percent) || 0)),
            can_sell_cash: form.can_sell_cash,
            can_authorize: form.can_authorize,
            lojinha_can_sell: form.lojinha_can_sell,
            lojinha_payment_methods: form.lojinha_payment_methods,
            lojinha_point_device_id: form.lojinha_point_device_id,
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
                  <Label className="mb-1 block">Cargo</Label>
                  <Select value={form.role_preset} onValueChange={applyPreset}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRESETS.map((p) => (
                        <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {PRESETS.find((p) => p.key === form.role_preset)?.description}
                  </p>
                </div>
                <div>
                  <Label className="mb-2 block">Permissões (editáveis)</Label>
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

                {form.permissions.includes("lojinha") && (
                  <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lojinha — modo caixa</div>
                    <p className="text-[11px] text-muted-foreground">
                      Sem marcar nada abaixo, este funcionário só valida QR de pedidos online.
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={form.lojinha_payment_methods.includes("pix")}
                        onCheckedChange={() => toggleLojinhaMethod("pix")}
                      />
                      <span className="text-sm">Pode vender no balcão recebendo Pix</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={form.lojinha_payment_methods.includes("card")}
                        onCheckedChange={() => toggleLojinhaMethod("card")}
                      />
                      <span className="text-sm">Pode vender no balcão recebendo cartão (Point Smart)</span>
                    </label>
                    {form.lojinha_payment_methods.includes("card") && (
                      <div>
                        <Label className="text-xs">Maquininha vinculada</Label>
                        <Select
                          value={form.lojinha_point_device_id ?? "none"}
                          onValueChange={(v) => setForm({ ...form, lojinha_point_device_id: v === "none" ? null : v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem maquininha fixa</SelectItem>
                            {devices.map((d) => (
                              <SelectItem key={d.id} value={d.mp_device_id}>{d.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {devices.length === 0 && (
                          <p className="text-[11px] text-warning mt-1">
                            Cadastre maquininhas na aba Lojinha → Maquininhas.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
                    {m.role !== "owner" && m.role_preset && (
                      <Badge variant="outline" className="text-[10px]">
                        {PRESETS.find((p) => p.key === m.role_preset)?.label ?? m.role_preset}
                      </Badge>
                    )}
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
