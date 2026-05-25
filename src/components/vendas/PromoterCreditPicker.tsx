import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, UserCog, Sparkles, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { computeMaxCredit, type CartLine, type PromoterCreditRule } from "@/hooks/usePromoterCreditRule";

type PromoterWithBalance = { id: string; name: string; balance: number };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  maxAmount: number;
  cart?: CartLine[];
  eventId?: string | null;
  onPick: (promoter_id: string, promoter_name: string, amount: number) => void;
}

const DEFAULT_RULE: PromoterCreditRule = {
  id: "default", scope: "global", enabled: true,
  min_purchase: 0, max_percent: 100,
  excluded_product_ids: [], excluded_category_ids: [], notes: null,
};

export function PromoterCreditPicker({ open, onOpenChange, maxAmount, cart = [], eventId, onPick }: Props) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<PromoterWithBalance | null>(null);
  const [amount, setAmount] = useState(0);
  const [ruleInfo, setRuleInfo] = useState<{ max: number; eligible: number; reason?: string } | null>(null);

  const { data: promoters = [], isLoading } = useQuery({
    queryKey: ["promoters-with-balance", open],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("promoters").select("id, name").order("name");
      if (error) throw error;
      const list: PromoterWithBalance[] = [];
      for (const p of data ?? []) {
        const { data: bal } = await supabase.rpc("promoter_active_balance", { _promoter_id: p.id });
        list.push({ id: p.id, name: p.name, balance: Number(bal ?? 0) });
      }
      return list;
    },
  });

  // resolve regra e máximo permitido quando seleciona o promoter
  useEffect(() => {
    if (!picked) { setRuleInfo(null); return; }
    let cancelled = false;
    (async () => {
      // busca a regra mais específica
      const ors = [
        "scope.eq.global",
        `and(scope.eq.promoter,promoter_id.eq.${picked.id})`,
        eventId ? `and(scope.eq.event_promoter,promoter_id.eq.${picked.id},event_id.eq.${eventId})` : "",
      ].filter(Boolean).join(",");
      const { data } = await supabase.from("promoter_credit_rules").select("*").or(ors);
      const rows = data ?? [];
      const pick = rows.find((r) => r.scope === "event_promoter")
        ?? rows.find((r) => r.scope === "promoter")
        ?? rows.find((r) => r.scope === "global");
      const rule: PromoterCreditRule = pick ? {
        id: pick.id, scope: pick.scope as any,
        enabled: !!pick.enabled,
        min_purchase: Number(pick.min_purchase ?? 0),
        max_percent: Number(pick.max_percent ?? 100),
        excluded_product_ids: pick.excluded_product_ids ?? [],
        excluded_category_ids: pick.excluded_category_ids ?? [],
        notes: pick.notes ?? null,
      } : DEFAULT_RULE;
      const info = await computeMaxCredit(cart, rule);
      if (!cancelled) {
        setRuleInfo(info);
        const allowed = Math.min(picked.balance, maxAmount, info.max);
        setAmount(Math.max(0, +allowed.toFixed(2)));
      }
    })();
    return () => { cancelled = true; };
  }, [picked, eventId, cart, maxAmount]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return promoters.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [promoters, search]);

  const hardMax = picked ? Math.min(picked.balance, maxAmount, ruleInfo?.max ?? 0) : 0;

  const reset = () => { setPicked(null); setSearch(""); setAmount(0); setRuleInfo(null); };

  const confirm = () => {
    if (!picked) return;
    const final = Math.min(amount, hardMax);
    if (final <= 0) return;
    onPick(picked.id, picked.name, +final.toFixed(2));
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Crédito de promoter
          </DialogTitle>
          <DialogDescription>
            Selecione o promoter e o valor a abater. Vale até {formatBRL(maxAmount)} desta venda.
          </DialogDescription>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar promoter..." className="pl-9" autoFocus />
            </div>
            <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
              {isLoading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Nenhum promoter</div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPicked(p)}
                    disabled={p.balance <= 0}
                    className="w-full p-3 text-left hover:bg-muted/40 flex items-center justify-between gap-2 disabled:opacity-40"
                  >
                    <span className="font-medium">{p.name}</span>
                    <Badge variant={p.balance > 0 ? "default" : "secondary"}>{formatBRL(p.balance)}</Badge>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Promoter</div>
                <div className="font-semibold">{picked.name}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Saldo</div>
                <div className="font-bold text-success">{formatBRL(picked.balance)}</div>
              </div>
            </div>

            {ruleInfo?.reason ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-destructive">Crédito não disponível</div>
                  <div className="text-muted-foreground">{ruleInfo.reason}</div>
                </div>
              </div>
            ) : ruleInfo ? (
              <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-0.5">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal elegível</span><span className="font-semibold">{formatBRL(ruleInfo.eligible)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Máximo desta venda</span><span className="font-semibold text-primary">{formatBRL(hardMax)}</span></div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Calculando regra...</div>
            )}

            <div>
              <Label>Valor a abater</Label>
              <CurrencyInput value={amount} onChange={setAmount} autoFocus />
              <p className="text-[11px] text-muted-foreground mt-1">Máximo permitido: {formatBRL(hardMax)}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <UserCog className="h-3.5 w-3.5" /> trocar promoter
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {picked && (
            <Button onClick={confirm} disabled={amount <= 0 || amount > hardMax + 0.005}>
              Usar {formatBRL(Math.min(amount, hardMax))}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
