import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart, Store, ScanLine, Package, Receipt, LockKeyhole, Wallet, ArrowDownToLine, Banknote, QrCode, CreditCard, Percent, ShieldCheck, Sparkles, Beer, Activity, KeyRound, Printer, ChevronDown, ChevronRight } from "lucide-react";
import { clearPrintRulesCache } from "@/lib/print-rules";

export type SellerRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: "owner" | "staff";
  permissions: string[] | null;
  owner_id: string | null;
  aceita_dinheiro: boolean;
  aceita_pix: boolean;
  aceita_cartao: boolean;
  aceita_credito_promoter: boolean;
  pode_lancar_consumacao: boolean;
  lojinha_can_sell: boolean;
  can_discount: boolean | null;
  max_discount_percent: number | null;
  vendas_pdv_caixa: boolean;
  vendas_garcom: boolean;
  vendas_validar_qr: boolean;
  vendas_pedidos: boolean;
  vendas_historico: boolean;
  vendas_fechamento: boolean;
  vendas_abre_caixa: boolean;
  vendas_sangria: boolean;
  vendas_ao_vivo: boolean;
  pode_pix_chave: boolean;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: SellerRow | null;
  ownerId: string | null;
}

type Draft = {
  vendas_pdv_caixa: boolean;
  vendas_garcom: boolean;
  vendas_validar_qr: boolean;
  vendas_pedidos: boolean;
  vendas_historico: boolean;
  vendas_fechamento: boolean;
  vendas_abre_caixa: boolean;
  vendas_sangria: boolean;
  vendas_ao_vivo: boolean;
  aceita_dinheiro: boolean;
  aceita_pix: boolean;
  aceita_cartao: boolean;
  aceita_credito_promoter: boolean;
  pode_lancar_consumacao: boolean;
  pode_pix_chave: boolean;
  can_discount: boolean;
  max_discount_percent: number;
};

function initialDraft(r: SellerRow | null): Draft {
  const rr = r as unknown as Record<string, unknown> | null;
  return {
    vendas_pdv_caixa: r?.vendas_pdv_caixa ?? true,
    vendas_garcom: r?.vendas_garcom ?? true,
    vendas_validar_qr: r?.vendas_validar_qr ?? true,
    vendas_pedidos: r?.vendas_pedidos ?? true,
    vendas_historico: r?.vendas_historico ?? true,
    vendas_fechamento: r?.vendas_fechamento ?? true,
    vendas_abre_caixa: r?.vendas_abre_caixa ?? true,
    vendas_sangria: r?.vendas_sangria ?? true,
    vendas_ao_vivo: r?.vendas_ao_vivo ?? false,
    aceita_dinheiro: r?.aceita_dinheiro ?? true,
    aceita_pix: r?.aceita_pix ?? true,
    aceita_cartao: r?.aceita_cartao ?? true,
    aceita_credito_promoter: r?.aceita_credito_promoter ?? false,
    pode_lancar_consumacao: r?.pode_lancar_consumacao ?? false,
    pode_pix_chave: (rr?.["pode_pix_chave"] as boolean | undefined) ?? false,
    can_discount: r?.can_discount ?? false,
    max_discount_percent: Number(r?.max_discount_percent ?? 0),
  };
}

type RuleState = { print_on_sale: boolean; print_on_scan: boolean };

export function SellerPermissionDialog({ open, onOpenChange, row, ownerId }: Props) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => initialDraft(row));
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<Record<string, RuleState>>({});
  const [prodRules, setProdRules] = useState<Record<string, RuleState>>({});
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  useEffect(() => { setD(initialDraft(row)); }, [row]);

  // Carrega categorias do dono
  const { data: categories = [] } = useQuery({
    queryKey: ["product_categories", ownerId],
    enabled: !!ownerId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id, name")
        .eq("user_id", ownerId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Carrega todos os produtos do dono para exibir dentro das categorias
  const { data: products = [] } = useQuery({
    queryKey: ["products_for_print", ownerId],
    enabled: !!ownerId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category_id")
        .eq("user_id", ownerId!)
        .eq("ativo_geral", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Carrega regras de categorias existentes
  const { data: existingRules } = useQuery({
    queryKey: ["print_rules", row?.id],
    enabled: !!row?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("print_rules")
        .select("category_id, print_on_sale, print_on_scan")
        .eq("user_role_id", row!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Carrega regras de produtos existentes
  const { data: existingProdRules } = useQuery({
    queryKey: ["print_rules_products", row?.id],
    enabled: !!row?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("print_rules_products")
        .select("product_id, print_on_sale, print_on_scan")
        .eq("user_role_id", row!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!categories) return;
    const next: Record<string, RuleState> = {};
    const map = new Map((existingRules ?? []).map((r) => [r.category_id as string, r]));
    for (const c of categories) {
      const r = map.get(c.id);
      next[c.id] = {
        print_on_sale: r ? !!r.print_on_sale : true,
        print_on_scan: r ? !!r.print_on_scan : true,
      };
    }
    setRules(next);

    const nextProd: Record<string, RuleState> = {};
    (existingProdRules ?? []).forEach(r => {
      nextProd[r.product_id] = {
        print_on_sale: !!r.print_on_sale,
        print_on_scan: !!r.print_on_scan,
      };
    });
    setProdRules(nextProd);
  }, [categories, existingRules, existingProdRules]);

  if (!row) return null;
  const isOwnerRow = row.role === "owner";

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => {
    const next = { ...s, [k]: v };
    if (k === "vendas_garcom" && v === true) next.aceita_pix = true;
    return next;
  });

  const setRule = (catId: string, key: keyof RuleState, v: boolean) => {
    setRules((s) => ({ ...s, [catId]: { ...s[catId], [key]: v } }));
    // Se marcou categoria, todos os produtos dela seguem por padrão (remove exceções específicas se houver, 
    // ou simplesmente aplicamos a mesma regra aos filhos para ficar visualmente consistente)
    const catProds = products.filter(p => p.category_id === catId);
    setProdRules(prev => {
      const next = { ...prev };
      catProds.forEach(p => {
        next[p.id] = { ...next[p.id], [key]: v };
      });
      return next;
    });
  };

  const setProdRule = (prodId: string, key: keyof RuleState, v: boolean) =>
    setProdRules((s) => ({ ...s, [prodId]: { ...s[prodId], [key]: v } }));

  const setAllRules = (key: keyof RuleState, v: boolean) => {
    setRules((s) => Object.fromEntries(Object.entries(s).map(([k, r]) => [k, { ...r, [key]: v }])));
    setProdRules((s) => Object.fromEntries(Object.entries(s).map(([k, r]) => [k, { ...r, [key]: v }])));
  };

  const toggleExpand = (catId: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const basePerms = new Set(row.permissions ?? []);
      const needsVendas = d.vendas_pdv_caixa || d.vendas_fechamento || d.vendas_abre_caixa || d.vendas_sangria;
      const needsLojinha = d.vendas_garcom;
      if (needsVendas) basePerms.add("vendas"); else basePerms.delete("vendas");
      if (needsLojinha) basePerms.add("lojinha"); else basePerms.delete("lojinha");
      if ((d.vendas_validar_qr || d.vendas_pedidos || d.vendas_historico) && !basePerms.has("vendas") && !basePerms.has("lojinha")) {
        basePerms.add("vendas");
      }

      if (!isOwnerRow) {
        const { error } = await supabase
          .from("user_roles")
          .update({
            ...d,
            permissions: Array.from(basePerms),
            lojinha_can_sell: d.vendas_garcom,
          } as any)
          .eq("id", row.id);
        if (error) {
          console.error("Erro ao atualizar user_roles:", error);
          throw error;
        }
      }

      // Salva regras de impressão de CATEGORIAS
      const ruleRows = Object.entries(rules).map(([category_id, r]) => ({
        user_id: ownerId,
        user_role_id: row.id,
        category_id,
        print_on_sale: r.print_on_sale,
        print_on_scan: r.print_on_scan,
      }));
      if (ruleRows.length > 0) {
        await supabase.from("print_rules").delete().eq("user_role_id", row.id);
        const { error: rErr } = await supabase.from("print_rules").insert(ruleRows as never);
        if (rErr) throw rErr;
      }

      // Salva regras de impressão de PRODUTOS
      // Aqui só salvamos os produtos que DIFEREM da regra da categoria, ou salvamos tudo?
      // Por simplicidade na lógica de filtro, vamos salvar as exceções explícitas.
      const prodRuleRows = Object.entries(prodRules).map(([product_id, r]) => ({
        user_id: ownerId,
        user_role_id: row.id,
        product_id,
        print_on_sale: r.print_on_sale,
        print_on_scan: r.print_on_scan,
      }));
      
      await supabase.from("print_rules_products").delete().eq("user_role_id", row.id);
      if (prodRuleRows.length > 0) {
        const { error: prErr } = await supabase.from("print_rules_products").insert(prodRuleRows as never);
        if (prErr) throw prErr;
      }

      clearPrintRulesCache();

      toast.success("Permissões atualizadas");
      qc.invalidateQueries({ queryKey: ["seller-perms"] });
      qc.invalidateQueries({ queryKey: ["my-role"] });
      qc.invalidateQueries({ queryKey: ["print_rules"] });
      qc.invalidateQueries({ queryKey: ["print_rules_products"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const showDinheiro = d.vendas_pdv_caixa || d.vendas_garcom;
  const cats = categories ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row.display_name ?? row.email ?? "Funcionário"}</DialogTitle>
          <DialogDescription>
            {row.email}{isOwnerRow ? " · owner (acesso total)" : ""}
          </DialogDescription>
        </DialogHeader>

        {isOwnerRow ? (
          <div className="p-3 mb-4 rounded-lg border bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 text-xs">
            Como <strong>Dono</strong>, você sempre tem acesso total às ferramentas.
            Abaixo, você pode configurar o que <strong>você</strong> deseja imprimir no seu dispositivo.
          </div>
        ) : null}

        <Tabs defaultValue={isOwnerRow ? "print" : "perms"}>
          <TabsList className="grid w-full grid-cols-2">
            {!isOwnerRow && <TabsTrigger value="perms">Permissões</TabsTrigger>}
            <TabsTrigger value="print" className={isOwnerRow ? "col-span-2" : ""}>
              <Printer className="h-3.5 w-3.5 mr-1" />Impressão
            </TabsTrigger>
          </TabsList>

          {!isOwnerRow && (
            <TabsContent value="perms" className="space-y-5 mt-4">
              <Section title="Acesso às abas de Vendas">
                <Toggle icon={<ShoppingCart className="h-4 w-4" />} label="PDV Caixa" sub="Vender no caixa presencial" checked={d.vendas_pdv_caixa} onChange={(v) => set("vendas_pdv_caixa", v)} />
                <Toggle icon={<Store className="h-4 w-4" />} label="Vender (garçom)" sub="PDV mobile / maquininha" checked={d.vendas_garcom} onChange={(v) => set("vendas_garcom", v)} />
                <Toggle icon={<ScanLine className="h-4 w-4" />} label="Validar QR" sub="Ler QR e entregar pedido" checked={d.vendas_validar_qr} onChange={(v) => set("vendas_validar_qr", v)} />
                <Toggle icon={<Package className="h-4 w-4" />} label="Pedidos online" sub="Ver lista de pedidos pendentes" checked={d.vendas_pedidos} onChange={(v) => set("vendas_pedidos", v)} />
                <Toggle icon={<Receipt className="h-4 w-4" />} label="Histórico" sub="Vendas e entregas feitas" checked={d.vendas_historico} onChange={(v) => set("vendas_historico", v)} />
                <Toggle icon={<LockKeyhole className="h-4 w-4" />} label="Fechamento" sub="Fechamento cego de caixa" checked={d.vendas_fechamento} onChange={(v) => set("vendas_fechamento", v)} />
                <Toggle icon={<Activity className="h-4 w-4" />} label="Ao vivo" sub="Painel ao vivo do evento" checked={d.vendas_ao_vivo} onChange={(v) => set("vendas_ao_vivo", v)} />
              </Section>

              {showDinheiro && (
                <>
                  <Separator />
                  <Section title="Operação de dinheiro" subtitle="Toda abertura exige autorização do dono ou gerente.">
                    <Toggle icon={<Wallet className="h-4 w-4" />} label="Pode abrir caixa" sub="Informar valor inicial e abrir turno" checked={d.vendas_abre_caixa} onChange={(v) => set("vendas_abre_caixa", v)} />
                    <Toggle icon={<ArrowDownToLine className="h-4 w-4" />} label="Pode pedir sangria" sub="Solicitar retirada de dinheiro" checked={d.vendas_sangria} onChange={(v) => set("vendas_sangria", v)} />
                  </Section>
                </>
              )}

              <Separator />
              <Section title="Formas de pagamento que pode receber">
                <Toggle icon={<Banknote className="h-4 w-4" />} label="Dinheiro" checked={d.aceita_dinheiro} onChange={(v) => set("aceita_dinheiro", v)} />
                <Toggle icon={<QrCode className="h-4 w-4" />} label="Pix" sub={d.vendas_garcom ? "Obrigatório quando o garçom pode vender" : undefined} checked={d.aceita_pix} onChange={(v) => set("aceita_pix", v)} disabled={d.vendas_garcom} />
                <Toggle icon={<CreditCard className="h-4 w-4" />} label="Cartão (débito e crédito)" checked={d.aceita_cartao} onChange={(v) => set("aceita_cartao", v)} />
                <Toggle icon={<Sparkles className="h-4 w-4" />} label="Crédito promoter" sub="Abater saldo de promoter como pagamento" checked={d.aceita_credito_promoter} onChange={(v) => set("aceita_credito_promoter", v)} />
                <Toggle icon={<KeyRound className="h-4 w-4" />} label="Pode lançar PIX por chave" sub="Confirma manualmente que recebeu PIX via chave/QR externo (exige PIN do dono)" checked={d.pode_pix_chave} onChange={(v) => set("pode_pix_chave", v)} />
              </Section>

              <Separator />
              <Section title="Consumação interna" subtitle="Permite lançar bebidas para banda, DJ, segurança, funcionário ou sorteio.">
                <Toggle icon={<Beer className="h-4 w-4" />} label="Pode lançar consumação" sub="Aparece um botão extra no checkout do PDV" checked={d.pode_lancar_consumacao} onChange={(v) => set("pode_lancar_consumacao", v)} />
              </Section>

              <Separator />
              <Section title="Desconto">
                <Toggle icon={<Percent className="h-4 w-4" />} label="Pode dar desconto" checked={d.can_discount} onChange={(v) => set("can_discount", v)} />
                {d.can_discount && (
                  <div className="flex items-center gap-2 pl-7">
                    <Label className="text-xs">Até</Label>
                    <Input type="number" min={0} max={100} className="w-20 h-8"
                      value={d.max_discount_percent}
                      onChange={(e) => set("max_discount_percent", Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                )}
              </Section>
            </TabsContent>
          )}

          <TabsContent value="print" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">
              Selecione quais categorias ou produtos específicos devem imprimir para esse funcionário. Toque na seta para ver os produtos.
            </p>
            {cats.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                Nenhuma categoria cadastrada ainda.
              </div>
            ) : (
              <Tabs defaultValue="sale">
                <TabsList className="grid grid-cols-2">
                  <TabsTrigger value="sale">Ao vender</TabsTrigger>
                  <TabsTrigger value="scan">Ao escanear</TabsTrigger>
                </TabsList>

                <TabsContent value="sale" className="mt-3 space-y-1">
                  <BulkRow onAll={() => setAllRules("print_on_sale", true)} onNone={() => setAllRules("print_on_sale", false)} />
                  {cats.map((c) => (
                    <CategoryWithProducts
                      key={c.id}
                      cat={c}
                      expanded={expandedCats.has(c.id)}
                      onToggleExpand={() => toggleExpand(c.id)}
                      catChecked={rules[c.id]?.print_on_sale ?? true}
                      onCatChange={(v) => setRule(c.id, "print_on_sale", v)}
                      products={products.filter(p => p.category_id === c.id)}
                      prodRules={prodRules}
                      onProdChange={(pid, v) => setProdRule(pid, "print_on_sale", v)}
                      trigger="print_on_sale"
                    />
                  ))}
                </TabsContent>

                <TabsContent value="scan" className="mt-3 space-y-1">
                  <BulkRow onAll={() => setAllRules("print_on_scan", true)} onNone={() => setAllRules("print_on_scan", false)} />
                  {cats.map((c) => (
                    <CategoryWithProducts
                      key={c.id}
                      cat={c}
                      expanded={expandedCats.has(c.id)}
                      onToggleExpand={() => toggleExpand(c.id)}
                      catChecked={rules[c.id]?.print_on_scan ?? true}
                      onCatChange={(v) => setRule(c.id, "print_on_scan", v)}
                      products={products.filter(p => p.category_id === c.id)}
                      prodRules={prodRules}
                      onProdChange={(pid, v) => setProdRule(pid, "print_on_scan", v)}
                      trigger="print_on_scan"
                    />
                  ))}
                </TabsContent>
              </Tabs>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            <ShieldCheck className="h-4 w-4 mr-2" /> {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkRow({ onAll, onNone }: { onAll: () => void; onNone: () => void }) {
  return (
    <div className="flex items-center gap-2 pb-2 mb-1 border-b">
      <span className="text-xs text-muted-foreground flex-1">Marcar:</span>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onAll}>Todas</Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onNone}>Nenhuma</Button>
    </div>
  );
}

function CategoryWithProducts({ 
  cat, expanded, onToggleExpand, catChecked, onCatChange, products, prodRules, onProdChange, trigger 
}: { 
  cat: { id: string; name: string };
  expanded: boolean;
  onToggleExpand: () => void;
  catChecked: boolean;
  onCatChange: (v: boolean) => void;
  products: any[];
  prodRules: Record<string, RuleState>;
  onProdChange: (pid: string, v: boolean) => void;
  trigger: "print_on_sale" | "print_on_scan";
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 p-1 rounded-lg hover:bg-muted/40 group">
        <button onClick={onToggleExpand} className="p-1 rounded hover:bg-muted text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Checkbox checked={catChecked} onCheckedChange={(v) => onCatChange(v === true)} />
        <span className="text-sm font-medium flex-1 cursor-pointer" onClick={onToggleExpand}>{cat.name}</span>
        <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity pr-2">
          {products.length} produtos
        </span>
      </div>
      
      {expanded && (
        <div className="pl-9 space-y-0.5 border-l ml-3 mb-2 pt-1">
          {products.length === 0 ? (
            <div className="text-[11px] text-muted-foreground py-1">Nenhum produto</div>
          ) : (
            products.map(p => (
              <label key={p.id} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/30 cursor-pointer">
                <Checkbox 
                  checked={prodRules[p.id]?.[trigger] ?? catChecked} 
                  onCheckedChange={(v) => onProdChange(p.id, v === true)} 
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs flex-1 truncate">{p.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <h4 className="font-semibold text-sm">{title}</h4>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Toggle({ icon, label, sub, checked, onChange, disabled }: { icon?: React.ReactNode; label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-3 p-2 rounded-lg ${disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-muted/40 cursor-pointer"}`}>
      <div className="flex items-start gap-2 min-w-0">
        {icon && <span className="text-muted-foreground mt-0.5">{icon}</span>}
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight">{label}</div>
          {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}
