import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
import { toast } from "sonner";
import { Sparkles, X } from "lucide-react";

type Scope = "global" | "promoter" | "event_promoter";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: Scope;
  promoterId?: string | null;
  promoterName?: string;
  eventId?: string | null;
  eventName?: string;
}

export function PromoterCreditRuleDialog({ open, onOpenChange, scope, promoterId, promoterName, eventId, eventName }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [enabled, setEnabled] = useState(true);
  const [minPurchase, setMinPurchase] = useState(0);
  const [maxPercent, setMaxPercent] = useState(100);
  const [excludedProducts, setExcludedProducts] = useState<string[]>([]);
  const [excludedCategories, setExcludedCategories] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // carrega regra existente
  const { data: existing } = useQuery({
    queryKey: ["pcr-load", scope, promoterId ?? null, eventId ?? null, open],
    enabled: open && !!user,
    queryFn: async () => {
      let q = supabase.from("promoter_credit_rules").select("*").eq("user_id", user!.id).eq("scope", scope);
      if (scope === "promoter") q = q.eq("promoter_id", promoterId!);
      if (scope === "event_promoter") q = q.eq("promoter_id", promoterId!).eq("event_id", eventId!);
      const { data } = await q.maybeSingle();
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["pcr-products", user?.id, open],
    enabled: open && !!user,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, category_id").eq("ativo_geral", true).order("name");
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["pcr-categories", user?.id, open],
    enabled: open && !!user,
    queryFn: async () => {
      const { data } = await supabase.from("product_categories").select("id, name").order("name");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (existing) {
      setEnabled(!!existing.enabled);
      setMinPurchase(Number(existing.min_purchase ?? 0));
      setMaxPercent(Number(existing.max_percent ?? 100));
      setExcludedProducts(existing.excluded_product_ids ?? []);
      setExcludedCategories(existing.excluded_category_ids ?? []);
      setNotes(existing.notes ?? "");
    } else if (open) {
      setEnabled(true); setMinPurchase(0); setMaxPercent(100);
      setExcludedProducts([]); setExcludedCategories([]); setNotes("");
    }
  }, [existing, open]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const payload: any = {
        user_id: user.id, scope, enabled,
        min_purchase: minPurchase, max_percent: maxPercent,
        excluded_product_ids: excludedProducts,
        excluded_category_ids: excludedCategories,
        notes: notes.trim() || null,
        promoter_id: scope !== "global" ? promoterId : null,
        event_id: scope === "event_promoter" ? eventId : null,
      };
      if (existing?.id) {
        const { error } = await supabase.from("promoter_credit_rules").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("promoter_credit_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Regra salva");
      qc.invalidateQueries({ queryKey: ["pcr-load"] });
      qc.invalidateQueries({ queryKey: ["promoter-credit-rule"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!existing?.id) return;
      const { error } = await supabase.from("promoter_credit_rules").delete().eq("id", existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Voltou para o padrão");
      qc.invalidateQueries({ queryKey: ["pcr-load"] });
      qc.invalidateQueries({ queryKey: ["promoter-credit-rule"] });
      onOpenChange(false);
    },
  });

  const title =
    scope === "global" ? "Regra padrão de crédito (todos)" :
    scope === "promoter" ? `Regra de crédito — ${promoterName}` :
    `Regra para ${promoterName} · ${eventName}`;

  const toggleId = (arr: string[], id: string) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />{title}</DialogTitle>
          <DialogDescription>
            Define como o promoter pode gastar o crédito ganho com nomes na lista.
            {scope !== "global" && " (Sobrescreve o padrão.)"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Aceitar pagamento com crédito</div>
              <div className="text-xs text-muted-foreground">Desligado = promoter não pode usar nada.</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Compra mínima (R$)</Label>
              <CurrencyInput value={minPurchase} onChange={setMinPurchase} />
              <p className="text-[11px] text-muted-foreground">Só libera o crédito a partir desse valor.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Limite do total (%)</Label>
              <Input type="number" min={1} max={100} value={maxPercent} onChange={(e) => setMaxPercent(Math.min(100, Math.max(1, Number(e.target.value) || 0)))} />
              <p className="text-[11px] text-muted-foreground">Ex: 50% = paga metade com crédito, metade com dinheiro.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categorias que NÃO aceitam crédito</Label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => {
                const on = excludedCategories.includes(c.id);
                return (
                  <Badge key={c.id} variant={on ? "destructive" : "outline"} className="cursor-pointer"
                    onClick={() => setExcludedCategories(toggleId(excludedCategories, c.id))}>
                    {on && <X className="h-3 w-3 mr-1" />}{c.name}
                  </Badge>
                );
              })}
              {categories.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma categoria.</span>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Produtos específicos excluídos</Label>
            <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
              {products.map((p) => {
                const on = excludedProducts.includes(p.id);
                return (
                  <button key={p.id} type="button"
                    onClick={() => setExcludedProducts(toggleId(excludedProducts, p.id))}
                    className={`w-full text-left text-sm px-2 py-1 rounded ${on ? "bg-destructive/15 text-destructive" : "hover:bg-muted/40"}`}>
                    {on ? "✕" : "○"} {p.name}
                  </button>
                );
              })}
              {products.length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhum produto.</p>}
            </div>
            <p className="text-[11px] text-muted-foreground">Útil para excluir narguilé, cervejas premium, etc.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Observação interna</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: válido só nesse evento" />
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          {existing && (
            <Button variant="ghost" className="text-destructive mr-auto" onClick={() => remove.mutate()}>
              Voltar para o padrão
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-gradient-primary text-primary-foreground">
            {save.isPending ? "Salvando..." : "Salvar regra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
