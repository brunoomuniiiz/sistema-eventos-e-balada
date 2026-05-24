import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ShoppingCart, Store, ScanLine, Package, Receipt, LockKeyhole, Wallet, ArrowDownToLine, Banknote, QrCode, CreditCard, Percent, ShieldCheck, Sparkles, Beer, Activity } from "lucide-react";

export type SellerRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: "owner" | "staff";
  permissions: string[] | null;
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
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: SellerRow | null;
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
  can_discount: boolean;
  max_discount_percent: number;
};

function initialDraft(r: SellerRow | null): Draft {
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
    can_discount: r?.can_discount ?? false,
    max_discount_percent: Number(r?.max_discount_percent ?? 0),
  };
}

export function SellerPermissionDialog({ open, onOpenChange, row }: Props) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => initialDraft(row));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setD(initialDraft(row)); }, [row]);

  if (!row) return null;
  const isOwnerRow = row.role === "owner";

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      // Sincroniza permissão base "vendas"/"lojinha" automaticamente
      const basePerms = new Set(row.permissions ?? []);
      const needsVendas = d.vendas_pdv_caixa || d.vendas_fechamento || d.vendas_abre_caixa || d.vendas_sangria;
      const needsLojinha = d.vendas_garcom;
      if (needsVendas) basePerms.add("vendas"); else basePerms.delete("vendas");
      if (needsLojinha) basePerms.add("lojinha"); else basePerms.delete("lojinha");
      // Validar QR / pedidos / histórico exigem pelo menos uma das duas
      if ((d.vendas_validar_qr || d.vendas_pedidos || d.vendas_historico) && !basePerms.has("vendas") && !basePerms.has("lojinha")) {
        basePerms.add("vendas");
      }

      const { error } = await supabase
        .from("user_roles")
        .update({
          ...d,
          permissions: Array.from(basePerms),
          lojinha_can_sell: d.vendas_garcom,
        } as never)
        .eq("id", row.id);
      if (error) throw error;
      toast.success("Permissões atualizadas");
      qc.invalidateQueries({ queryKey: ["seller-perms"] });
      qc.invalidateQueries({ queryKey: ["my-role"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const showDinheiro = d.vendas_pdv_caixa || d.vendas_garcom;

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
          <div className="p-4 rounded-lg border bg-muted/30 text-sm">
            Owner tem acesso total a todas as funções. Não pode ser limitado.
          </div>
        ) : (
          <div className="space-y-5">
            <Section title="Acesso às abas de Vendas">
              <Toggle icon={<ShoppingCart className="h-4 w-4" />} label="PDV Caixa" sub="Vender no caixa presencial" checked={d.vendas_pdv_caixa} onChange={(v) => set("vendas_pdv_caixa", v)} />
              <Toggle icon={<Store className="h-4 w-4" />} label="Vender (garçom)" sub="PDV mobile / maquininha" checked={d.vendas_garcom} onChange={(v) => set("vendas_garcom", v)} />
              <Toggle icon={<ScanLine className="h-4 w-4" />} label="Validar QR" sub="Ler QR e entregar pedido" checked={d.vendas_validar_qr} onChange={(v) => set("vendas_validar_qr", v)} />
              <Toggle icon={<Package className="h-4 w-4" />} label="Pedidos online" sub="Ver lista de pedidos pendentes" checked={d.vendas_pedidos} onChange={(v) => set("vendas_pedidos", v)} />
              <Toggle icon={<Receipt className="h-4 w-4" />} label="Histórico" sub="Vendas e entregas feitas" checked={d.vendas_historico} onChange={(v) => set("vendas_historico", v)} />
              <Toggle icon={<LockKeyhole className="h-4 w-4" />} label="Fechamento" sub="Fechamento cego de caixa" checked={d.vendas_fechamento} onChange={(v) => set("vendas_fechamento", v)} />
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
              <Toggle icon={<QrCode className="h-4 w-4" />} label="Pix" checked={d.aceita_pix} onChange={(v) => set("aceita_pix", v)} />
              <Toggle icon={<CreditCard className="h-4 w-4" />} label="Cartão (débito e crédito)" checked={d.aceita_cartao} onChange={(v) => set("aceita_cartao", v)} />
              <Toggle icon={<Sparkles className="h-4 w-4" />} label="Crédito promoter" sub="Abater saldo de promoter como pagamento" checked={d.aceita_credito_promoter} onChange={(v) => set("aceita_credito_promoter", v)} />
            </Section>

            <Separator />
            <Section title="Consumação interna" subtitle="Permite lançar bebidas para banda, DJ, segurança, funcionário ou sorteio — sai do estoque sem inflar o faturamento.">
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
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {!isOwnerRow && (
            <Button onClick={save} disabled={saving}>
              <ShieldCheck className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar permissões"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function Toggle({ icon, label, sub, checked, onChange }: { icon?: React.ReactNode; label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-muted/40 cursor-pointer">
      <div className="flex items-start gap-2 min-w-0">
        {icon && <span className="text-muted-foreground mt-0.5">{icon}</span>}
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight">{label}</div>
          {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
