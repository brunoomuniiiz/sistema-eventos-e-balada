import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions, type Permission } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { Plus, Trash2, UserCog, Crown, Pencil, ShieldCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// =====================================================
// Tipos
// =====================================================

type SubFlags = {
  // Vendas
  vendas_pdv_caixa: boolean;
  vendas_garcom: boolean;
  can_authorize: boolean;
  can_discount: boolean;
  max_discount_percent: number;
  vendas_sangria: boolean;
  vendas_abrir_fechar_caixa: boolean;
  vendas_validar_qr: boolean;
  vendas_promoter_creditos_dinheiro: boolean;
  aceita_dinheiro: boolean;
  aceita_pix: boolean;
  aceita_cartao: boolean;
  // Produtos
  produtos_conferir_estoque: boolean;
  produtos_adicionar_entrada: boolean;
  produtos_criar_editar: boolean;
  produtos_criar_combo: boolean;
  produtos_inventario: boolean;
  // Eventos
  eventos_criar: boolean;
  eventos_editar: boolean;
  eventos_abrir_encerrar: boolean;
  eventos_ver_financeiro: boolean;
  // Promoters
  promoters_gerenciar: boolean;
  promoters_comissoes: boolean;
  promoters_ver_desempenho: boolean;
  // Lojinha
  lojinha_can_sell: boolean;
  lojinha_payment_methods: string[];
  lojinha_point_device_id: string | null;
};

type TeamMember = SubFlags & {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: "owner" | "staff";
  role_preset: string | null;
  permissions: Permission[];
};

type FormState = SubFlags & {
  email: string;
  password: string;
  display_name: string;
  role_preset: string;
  permissions: Permission[];
};

// =====================================================
// Presets (mesma fonte de verdade que apply_role_preset)
// =====================================================

const ALL_OFF: SubFlags = {
  vendas_pdv_caixa: false,
  vendas_garcom: false,
  can_authorize: false,
  can_discount: false,
  max_discount_percent: 0,
  vendas_sangria: false,
  vendas_abrir_fechar_caixa: false,
  vendas_validar_qr: false,
  vendas_promoter_creditos_dinheiro: false,
  aceita_dinheiro: false,
  aceita_pix: false,
  aceita_cartao: false,
  produtos_conferir_estoque: false,
  produtos_adicionar_entrada: false,
  produtos_criar_editar: false,
  produtos_criar_combo: false,
  produtos_inventario: false,
  eventos_criar: false,
  eventos_editar: false,
  eventos_abrir_encerrar: false,
  eventos_ver_financeiro: false,
  promoters_gerenciar: false,
  promoters_comissoes: false,
  promoters_ver_desempenho: false,
  lojinha_can_sell: false,
  lojinha_payment_methods: [],
  lojinha_point_device_id: null,
};

type Preset = {
  key: string;
  label: string;
  description: string;
  permissions: Permission[];
  flags: Partial<SubFlags>;
};

const PRESETS: Preset[] = [
  {
    key: "garcom",
    label: "Garçom",
    description: "Lança pedidos pela mesa/comanda e recebe via Pix.",
    permissions: ["vendas", "lojinha"],
    flags: { vendas_garcom: true, aceita_pix: true },
  },
  {
    key: "caixa_garcom",
    label: "Caixa/Garçom",
    description: "Vende no PDV + lança pedidos. Aceita dinheiro e Pix.",
    permissions: ["vendas", "lojinha"],
    flags: { vendas_pdv_caixa: true, vendas_garcom: true, aceita_pix: true, aceita_dinheiro: true },
  },
  {
    key: "caixa_bar",
    label: "Caixa Bar",
    description: "PDV completo, autoriza, faz sangria e lança crédito de promoter.",
    permissions: ["vendas", "lojinha"],
    flags: {
      vendas_pdv_caixa: true,
      can_authorize: true,
      vendas_sangria: true,
      vendas_abrir_fechar_caixa: true,
      vendas_promoter_creditos_dinheiro: true,
      aceita_dinheiro: true,
      aceita_pix: true,
      aceita_cartao: true,
    },
  },
  {
    key: "caixa_portaria",
    label: "Caixa Portaria",
    description: "Vende entradas e valida QR na portaria.",
    permissions: ["vendas", "portaria"],
    flags: {
      vendas_pdv_caixa: true,
      vendas_validar_qr: true,
      aceita_dinheiro: true,
      aceita_pix: true,
      aceita_cartao: true,
    },
  },
  {
    key: "gerente",
    label: "Gerente",
    description: "Acesso amplo: vendas, produtos, eventos, promoters e portaria. Sem financeiro.",
    permissions: ["vendas", "estoque", "eventos", "promoters", "portaria", "lojinha"],
    flags: {
      vendas_pdv_caixa: true, vendas_garcom: true, can_authorize: true, can_discount: true, max_discount_percent: 100,
      vendas_sangria: true, vendas_abrir_fechar_caixa: true, vendas_validar_qr: true,
      vendas_promoter_creditos_dinheiro: true,
      aceita_dinheiro: true, aceita_pix: true, aceita_cartao: true,
      produtos_conferir_estoque: true, produtos_adicionar_entrada: true,
      produtos_criar_editar: true, produtos_criar_combo: true, produtos_inventario: true,
      eventos_criar: true, eventos_editar: true, eventos_abrir_encerrar: true, eventos_ver_financeiro: true,
      promoters_gerenciar: true, promoters_comissoes: true, promoters_ver_desempenho: true,
    },
  },
];

const emptyForm = (): FormState => ({
  ...ALL_OFF,
  email: "",
  password: "",
  display_name: "",
  role_preset: "caixa_bar",
  permissions: ["vendas", "lojinha"],
  ...PRESETS.find((p) => p.key === "caixa_bar")!.flags,
});

// =====================================================
// Sub-toggle reutilizável
// =====================================================

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 p-2 rounded-md hover:bg-accent/30 cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} className="mt-0.5" />
      <div className="text-sm leading-tight">
        {label}
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
    </label>
  );
}

// =====================================================
// Componente
// =====================================================

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
        .select("id, user_id, display_name, email, role, role_preset, permissions, can_discount, max_discount_percent, can_authorize, lojinha_can_sell, lojinha_payment_methods, lojinha_point_device_id, aceita_dinheiro, aceita_pix, aceita_cartao, vendas_pdv_caixa, vendas_garcom, vendas_validar_qr, vendas_sangria, vendas_abrir_fechar_caixa, vendas_promoter_creditos_dinheiro, produtos_conferir_estoque, produtos_adicionar_entrada, produtos_criar_editar, produtos_criar_combo, produtos_inventario, eventos_criar, eventos_editar, eventos_abrir_encerrar, eventos_ver_financeiro, promoters_gerenciar, promoters_comissoes, promoters_ver_desempenho")
        .eq("owner_id", ownerId!)
        .order("role", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TeamMember[];
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
      ...ALL_OFF,
      email: m.email ?? "",
      password: "",
      display_name: m.display_name ?? "",
      role_preset: m.role_preset ?? "caixa_bar",
      permissions: m.permissions ?? [],
      vendas_pdv_caixa: !!m.vendas_pdv_caixa,
      vendas_garcom: !!m.vendas_garcom,
      can_authorize: !!m.can_authorize,
      can_discount: !!m.can_discount,
      max_discount_percent: Number(m.max_discount_percent ?? 0),
      vendas_sangria: !!m.vendas_sangria,
      vendas_abrir_fechar_caixa: !!m.vendas_abrir_fechar_caixa,
      vendas_validar_qr: !!m.vendas_validar_qr,
      vendas_promoter_creditos_dinheiro: !!m.vendas_promoter_creditos_dinheiro,
      aceita_dinheiro: m.aceita_dinheiro !== false,
      aceita_pix: m.aceita_pix !== false,
      aceita_cartao: m.aceita_cartao !== false,
      produtos_conferir_estoque: !!m.produtos_conferir_estoque,
      produtos_adicionar_entrada: !!m.produtos_adicionar_entrada,
      produtos_criar_editar: !!m.produtos_criar_editar,
      produtos_criar_combo: !!m.produtos_criar_combo,
      produtos_inventario: !!m.produtos_inventario,
      eventos_criar: !!m.eventos_criar,
      eventos_editar: !!m.eventos_editar,
      eventos_abrir_encerrar: !!m.eventos_abrir_encerrar,
      eventos_ver_financeiro: !!m.eventos_ver_financeiro,
      promoters_gerenciar: !!m.promoters_gerenciar,
      promoters_comissoes: !!m.promoters_comissoes,
      promoters_ver_desempenho: !!m.promoters_ver_desempenho,
      lojinha_can_sell: !!m.lojinha_can_sell,
      lojinha_payment_methods: m.lojinha_payment_methods ?? [],
      lojinha_point_device_id: m.lojinha_point_device_id ?? null,
    });
    setOpen(true);
  };

  const applyPreset = (key: string) => {
    const p = PRESETS.find((x) => x.key === key);
    if (!p) return;
    setForm((f) => ({
      ...f,
      ...ALL_OFF,
      role_preset: key,
      permissions: p.permissions,
      ...p.flags,
      // mantém identidade
      email: f.email,
      password: f.password,
      display_name: f.display_name,
    }));
  };

  const toggleModule = (mod: Permission, on: boolean) => {
    setForm((f) => ({
      ...f,
      permissions: on
        ? Array.from(new Set([...f.permissions, mod]))
        : f.permissions.filter((x) => x !== mod),
    }));
  };

  const set = <K extends keyof SubFlags>(k: K, v: SubFlags[K]) => setForm((f) => ({ ...f, [k]: v }));

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

  const buildUpdatePayload = () => {
    const perms = (form.lojinha_can_sell && !form.permissions.includes("lojinha"))
      ? [...form.permissions, "lojinha" as Permission]
      : form.permissions;
    return {
      display_name: form.display_name,
      role_preset: form.role_preset,
      permissions: perms,
      // Vendas
      vendas_pdv_caixa: form.vendas_pdv_caixa,
      vendas_garcom: form.vendas_garcom,
      vendas_validar_qr: form.vendas_validar_qr,
      vendas_sangria: form.vendas_sangria,
      vendas_abrir_fechar_caixa: form.vendas_abrir_fechar_caixa,
      // espelha pros campos legados que ainda são lidos por usePermissions
      vendas_abre_caixa: form.vendas_abrir_fechar_caixa,
      vendas_fechamento: form.vendas_abrir_fechar_caixa,
      vendas_promoter_creditos_dinheiro: form.vendas_promoter_creditos_dinheiro,
      aceita_credito_promoter: form.vendas_promoter_creditos_dinheiro,
      can_authorize: form.can_authorize,
      can_discount: form.can_discount,
      max_discount_percent: Math.max(0, Math.min(100, Number(form.max_discount_percent) || 0)),
      aceita_dinheiro: form.aceita_dinheiro,
      aceita_pix: form.aceita_pix,
      aceita_cartao: form.aceita_cartao,
      can_sell_cash: form.aceita_dinheiro,
      // Produtos
      produtos_conferir_estoque: form.produtos_conferir_estoque,
      produtos_adicionar_entrada: form.produtos_adicionar_entrada,
      produtos_criar_editar: form.produtos_criar_editar,
      produtos_criar_combo: form.produtos_criar_combo,
      produtos_inventario: form.produtos_inventario,
      pode_adicionar_bebidas: form.produtos_criar_editar, // legado
      // Eventos
      eventos_criar: form.eventos_criar,
      eventos_editar: form.eventos_editar,
      eventos_abrir_encerrar: form.eventos_abrir_encerrar,
      eventos_ver_financeiro: form.eventos_ver_financeiro,
      // Promoters
      promoters_gerenciar: form.promoters_gerenciar,
      promoters_comissoes: form.promoters_comissoes,
      promoters_ver_desempenho: form.promoters_ver_desempenho,
      // Lojinha
      lojinha_can_sell: form.lojinha_can_sell,
      lojinha_payment_methods: form.lojinha_payment_methods,
      lojinha_point_device_id: form.lojinha_point_device_id,
    };
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = buildUpdatePayload();

      if (editing) {
        const { error } = await supabase.from("user_roles").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Funcionário atualizado");
      } else {
        if (!form.email || !form.password) return toast.error("Email e senha são obrigatórios");
        // 1) cria conta via edge function (mantém compat) com os campos básicos
        const { data, error } = await supabase.functions.invoke("invite-staff", {
          body: {
            email: form.email,
            password: form.password,
            display_name: form.display_name || form.email.split("@")[0],
            role_preset: form.role_preset,
            permissions: payload.permissions,
            can_discount: form.can_discount,
            max_discount_percent: payload.max_discount_percent,
            can_sell_cash: form.aceita_dinheiro,
            can_authorize: form.can_authorize,
            lojinha_can_sell: form.lojinha_can_sell,
            lojinha_payment_methods: form.lojinha_payment_methods,
            lojinha_point_device_id: form.lojinha_point_device_id,
            pode_adicionar_bebidas: form.produtos_criar_editar,
            aceita_dinheiro: form.aceita_dinheiro,
            aceita_pix: form.aceita_pix,
            aceita_cartao: form.aceita_cartao,
          },
        });
        if (error) throw error;
        if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);

        // 2) update na linha recém-criada com os novos booleans (RLS: owner pode)
        const newUserId = (data as { user_id?: string } | null)?.user_id;
        if (newUserId && ownerId) {
          const { error: upErr } = await supabase
            .from("user_roles")
            .update(payload)
            .eq("user_id", newUserId)
            .eq("owner_id", ownerId);
          if (upErr) throw upErr;
        }
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

  const modOn = (m: Permission) => form.permissions.includes(m);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Convide funcionários, escolha o cargo e ajuste o que ele pode fazer em cada módulo.
        </div>
        {isOwner && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4" /> Novo funcionário</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar funcionário" : "Novo funcionário"}</DialogTitle>
                <DialogDescription>
                  Escolha um cargo pra começar e ajuste as permissões por módulo.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Identidade */}
                <div className="grid gap-3">
                  <div>
                    <Label>Nome</Label>
                    <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
                  </div>
                  {!editing && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Email</Label>
                        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                      </div>
                      <div>
                        <Label>Senha (mín. 6)</Label>
                        <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Presets */}
                <div>
                  <Label className="mb-2 block">Cargo</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PRESETS.map((p) => {
                      const selected = form.role_preset === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => applyPreset(p.key)}
                          className={`text-left rounded-md border p-2 text-xs leading-tight transition ${
                            selected ? "border-primary bg-primary/10" : "hover:bg-accent/40"
                          }`}
                        >
                          <div className="font-semibold text-sm">{p.label}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{p.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Accordion por módulo */}
                <Accordion type="multiple" className="w-full">
                  {/* VENDAS */}
                  <AccordionItem value="vendas">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Checkbox checked={modOn("vendas")} onCheckedChange={(v) => toggleModule("vendas", !!v)} onClick={(e) => e.stopPropagation()} />
                        Vendas
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      <Toggle label="PDV caixa" checked={form.vendas_pdv_caixa} onChange={(v) => set("vendas_pdv_caixa", v)} />
                      <Toggle label="Vender (garçom / comanda)" checked={form.vendas_garcom} onChange={(v) => set("vendas_garcom", v)} />
                      <Toggle label="Autorizar pagamentos" checked={form.can_authorize} onChange={(v) => set("can_authorize", v)} hint="Sangria, desconto extra, fechamento" />
                      <Toggle label="Conceder descontos" checked={form.can_discount} onChange={(v) => set("can_discount", v)} />
                      {form.can_discount && (
                        <div className="col-span-full pl-7">
                          <Label className="text-xs">Desconto máx (%)</Label>
                          <Input type="number" min={0} max={100} step="0.5" className="h-8 max-w-[120px]"
                            value={form.max_discount_percent}
                            onChange={(e) => set("max_discount_percent", Number(e.target.value))} />
                        </div>
                      )}
                      <Toggle label="Sangria" checked={form.vendas_sangria} onChange={(v) => set("vendas_sangria", v)} />
                      <Toggle label="Abrir/fechar caixa" checked={form.vendas_abrir_fechar_caixa} onChange={(v) => set("vendas_abrir_fechar_caixa", v)} />
                      <Toggle label="Validar QR" checked={form.vendas_validar_qr} onChange={(v) => set("vendas_validar_qr", v)} />
                      <Toggle label="Lançar crédito de promoter (dinheiro)" checked={form.vendas_promoter_creditos_dinheiro} onChange={(v) => set("vendas_promoter_creditos_dinheiro", v)} />
                      <div className="col-span-full mt-2 pt-2 border-t">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Formas de pagamento que aceita</div>
                        <div className="grid grid-cols-3 gap-1">
                          <Toggle label="Dinheiro" checked={form.aceita_dinheiro} onChange={(v) => set("aceita_dinheiro", v)} />
                          <Toggle label="Pix" checked={form.aceita_pix} onChange={(v) => set("aceita_pix", v)} />
                          <Toggle label="Cartão" checked={form.aceita_cartao} onChange={(v) => set("aceita_cartao", v)} />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* PRODUTOS */}
                  <AccordionItem value="estoque">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Checkbox checked={modOn("estoque")} onCheckedChange={(v) => toggleModule("estoque", !!v)} onClick={(e) => e.stopPropagation()} />
                        Produtos
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      <Toggle label="Conferir estoque" checked={form.produtos_conferir_estoque} onChange={(v) => set("produtos_conferir_estoque", v)} />
                      <Toggle label="Adicionar entrada" checked={form.produtos_adicionar_entrada} onChange={(v) => set("produtos_adicionar_entrada", v)} />
                      <Toggle label="Criar/editar produto" checked={form.produtos_criar_editar} onChange={(v) => set("produtos_criar_editar", v)} />
                      <Toggle label="Criar combo" checked={form.produtos_criar_combo} onChange={(v) => set("produtos_criar_combo", v)} />
                      <Toggle label="Inventário" checked={form.produtos_inventario} onChange={(v) => set("produtos_inventario", v)} />
                    </AccordionContent>
                  </AccordionItem>

                  {/* EVENTOS */}
                  <AccordionItem value="eventos">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Checkbox checked={modOn("eventos")} onCheckedChange={(v) => toggleModule("eventos", !!v)} onClick={(e) => e.stopPropagation()} />
                        Eventos
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      <Toggle label="Criar evento" checked={form.eventos_criar} onChange={(v) => set("eventos_criar", v)} />
                      <Toggle label="Editar evento" checked={form.eventos_editar} onChange={(v) => set("eventos_editar", v)} />
                      <Toggle label="Abrir/encerrar" checked={form.eventos_abrir_encerrar} onChange={(v) => set("eventos_abrir_encerrar", v)} />
                      <Toggle label="Ver financeiro do evento" checked={form.eventos_ver_financeiro} onChange={(v) => set("eventos_ver_financeiro", v)} />
                    </AccordionContent>
                  </AccordionItem>

                  {/* PROMOTERS */}
                  <AccordionItem value="promoters">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Checkbox checked={modOn("promoters")} onCheckedChange={(v) => toggleModule("promoters", !!v)} onClick={(e) => e.stopPropagation()} />
                        Promoters
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      <Toggle label="Gerenciar (add/excluir)" checked={form.promoters_gerenciar} onChange={(v) => set("promoters_gerenciar", v)} />
                      <Toggle label="Comissões" checked={form.promoters_comissoes} onChange={(v) => set("promoters_comissoes", v)} />
                      <Toggle label="Ver desempenho" checked={form.promoters_ver_desempenho} onChange={(v) => set("promoters_ver_desempenho", v)} />
                    </AccordionContent>
                  </AccordionItem>

                  {/* PORTARIA (gate) */}
                  <AccordionItem value="portaria">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Checkbox checked={modOn("portaria")} onCheckedChange={(v) => toggleModule("portaria", !!v)} onClick={(e) => e.stopPropagation()} />
                        Portaria
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-xs text-muted-foreground px-2">
                        Usa as permissões de Vendas (PDV caixa + Validar QR). Ative o módulo aqui e marque os toggles em Vendas.
                      </p>
                    </AccordionContent>
                  </AccordionItem>

                  {/* LOJINHA */}
                  <AccordionItem value="lojinha">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Checkbox checked={modOn("lojinha")} onCheckedChange={(v) => toggleModule("lojinha", !!v)} onClick={(e) => e.stopPropagation()} />
                        Lojinha
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2">
                      <p className="text-[11px] text-muted-foreground">Sem marcar nada, só valida QR de pedidos online.</p>
                      <Toggle label="Vender no balcão recebendo Pix" checked={form.lojinha_payment_methods.includes("pix")} onChange={() => toggleLojinhaMethod("pix")} />
                      <Toggle label="Vender no balcão recebendo cartão (Point Smart)" checked={form.lojinha_payment_methods.includes("card")} onChange={() => toggleLojinhaMethod("card")} />
                      {form.lojinha_payment_methods.includes("card") && (
                        <div className="pl-7">
                          <Label className="text-xs">Maquininha vinculada</Label>
                          <Select
                            value={form.lojinha_point_device_id ?? "none"}
                            onValueChange={(v) => set("lojinha_point_device_id", v === "none" ? null : v)}
                          >
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem maquininha fixa</SelectItem>
                              {devices.map((d) => (
                                <SelectItem key={d.id} value={d.mp_device_id}>{d.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  {/* FINANCEIRO — owner-only, oculto p/ staff */}
                  <AccordionItem value="financeiro" disabled>
                    <AccordionTrigger className="opacity-60">
                      <span className="flex items-center gap-2">
                        <Checkbox checked={false} disabled />
                        Financeiro
                        <Badge variant="outline" className="text-[10px]">apenas dono</Badge>
                      </span>
                    </AccordionTrigger>
                  </AccordionItem>
                </Accordion>
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
                  <div className="flex items-center gap-2 font-medium flex-wrap">
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
