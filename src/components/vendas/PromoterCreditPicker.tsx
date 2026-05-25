import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, UserCog, Sparkles, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { computeMaxCredit, type CartLine, type PromoterCreditRule } from "@/hooks/usePromoterCreditRule";

type PromoterWithBalance = { id: string; name: string; balance: number };
type CampaignRow = {
  id: string;
  name: string;
  credit_amount: number;
  min_purchase: number;
  max_percent: number;
  excluded_product_ids: string[];
  excluded_category_ids: string[];
  valid_from: string | null;
  valid_until: string | null;
  valid_weekdays: number[] | null;
  enabled: boolean;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  maxAmount: number;
  cart?: CartLine[];
  eventId?: string | null;
  onPick: (promoter_id: string, promoter_name: string, amount: number, campaign_id?: string | null) => void;
}

const DEFAULT_RULE: PromoterCreditRule = {
  id: "default", scope: "global", enabled: true,
  min_purchase: 0, max_percent: 100,
  excluded_product_ids: [], excluded_category_ids: [], notes: null,
};

function isCampaignActiveNow(c: CampaignRow): boolean {
  if (!c.enabled) return false;
  const now = new Date();
  if (c.valid_from && now < new Date(c.valid_from)) return false;
  if (c.valid_until && now > new Date(c.valid_until)) return false;
  if (c.valid_weekdays && c.valid_weekdays.length && !c.valid_weekdays.includes(now.getDay())) return false;
  return true;
}

export function PromoterCreditPicker({ open, onOpenChange, maxAmount, cart = [], eventId, onPick }: Props) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<PromoterWithBalance | null>(null);
  const [pickedCampaign, setPickedCampaign] = useState<CampaignRow | null>(null);
  const [namesBal, setNamesBal] = useState(0);
  const [campBal, setCampBal] = useState(0);
  const [amount, setAmount] = useState(0);
  const [ruleInfo, setRuleInfo] = useState<{ max: number; eligible: number; reason?: string } | null>(null);
  const [campaignsForPromoter, setCampaignsForPromoter] = useState<CampaignRow[]>([]);
  const [needsCampaignChoice, setNeedsCampaignChoice] = useState(false);

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

  // ao escolher promoter: carrega buckets + campanhas ativas do evento
  useEffect(() => {
    if (!picked) return;
    let cancelled = false;
    (async () => {
      // nomes
      const { data: nb } = await supabase.rpc("promoter_names_balance", { _promoter_id: picked.id });
      if (cancelled) return;
      setNamesBal(Number(nb ?? 0));

      // campanhas em que ele está, do evento atual
      if (!eventId) { setCampaignsForPromoter([]); setNeedsCampaignChoice(false); return; }
      const { data: mems } = await supabase
        .from("promoter_credit_campaign_members")
        .select("campaign_id")
        .eq("promoter_id", picked.id);
      const cids = (mems ?? []).map((m) => m.campaign_id);
      if (!cids.length) { setCampaignsForPromoter([]); setNeedsCampaignChoice(false); return; }
      const { data: cs } = await supabase
        .from("promoter_credit_campaigns")
        .select("id,name,credit_amount,min_purchase,max_percent,excluded_product_ids,excluded_category_ids,valid_from,valid_until,valid_weekdays,enabled")
        .in("id", cids)
        .eq("event_id", eventId);
      const active = ((cs ?? []) as CampaignRow[]).filter(isCampaignActiveNow);
      if (cancelled) return;
      setCampaignsForPromoter(active);
      if (active.length === 1) setPickedCampaign(active[0]);
      else if (active.length > 1) setNeedsCampaignChoice(true);
      else setPickedCampaign(null);
    })();
    return () => { cancelled = true; };
  }, [picked, eventId]);

  // calcula regra + máximo quando a campanha estiver escolhida
  useEffect(() => {
    if (!picked) { setRuleInfo(null); setCampBal(0); return; }
    if (needsCampaignChoice) return;
    let cancelled = false;
    (async () => {
      const rule: PromoterCreditRule = pickedCampaign ? {
        id: pickedCampaign.id, scope: "event_promoter" as any, enabled: true,
        min_purchase: Number(pickedCampaign.min_purchase),
        max_percent: Number(pickedCampaign.max_percent),
        excluded_product_ids: pickedCampaign.excluded_product_ids ?? [],
        excluded_category_ids: pickedCampaign.excluded_category_ids ?? [],
        notes: null,
      } : DEFAULT_RULE;

      // saldo do bucket campanha (se houver)
      let cb = 0;
      if (pickedCampaign) {
        const { data } = await supabase.rpc("promoter_campaign_balance", {
          _promoter_id: picked.id, _campaign_id: pickedCampaign.id,
        });
        cb = Number(data ?? 0);
      }
      const info = await computeMaxCredit(cart, rule);
      if (cancelled) return;
      setCampBal(cb);
      setRuleInfo(info);
      const totalAvail = namesBal + cb;
      const allowed = Math.min(totalAvail, maxAmount, info.max);
      setAmount(Math.max(0, +allowed.toFixed(2)));
    })();
    return () => { cancelled = true; };
  }, [picked, pickedCampaign, needsCampaignChoice, cart, maxAmount, namesBal]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return promoters.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [promoters, search]);

  const totalAvail = namesBal + campBal;
  const hardMax = picked ? Math.min(totalAvail, maxAmount, ruleInfo?.max ?? 0) : 0;

  const reset = () => {
    setPicked(null); setPickedCampaign(null); setCampaignsForPromoter([]);
    setNeedsCampaignChoice(false); setNamesBal(0); setCampBal(0);
    setSearch(""); setAmount(0); setRuleInfo(null);
  };

  const confirm = () => {
    if (!picked) return;
    const final = Math.min(amount, hardMax);
    if (final <= 0) return;
    onPick(picked.id, picked.name, +final.toFixed(2), pickedCampaign?.id ?? null);
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
            Vale até {formatBRL(maxAmount)} desta venda.
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
                  <button key={p.id} onClick={() => setPicked(p)} disabled={p.balance <= 0}
                    className="w-full p-3 text-left hover:bg-muted/40 flex items-center justify-between gap-2 disabled:opacity-40">
                    <span className="font-medium">{p.name}</span>
                    <Badge variant={p.balance > 0 ? "default" : "secondary"}>{formatBRL(p.balance)}</Badge>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : needsCampaignChoice ? (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {picked.name} está em {campaignsForPromoter.length} campanhas. Escolha qual aplicar:
            </div>
            <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
              <button onClick={() => { setPickedCampaign(null); setNeedsCampaignChoice(false); }}
                className="w-full p-3 text-left hover:bg-muted/40">
                <div className="font-medium">Sem campanha</div>
                <div className="text-xs text-muted-foreground">Usar só o crédito de nomes da lista</div>
              </button>
              {campaignsForPromoter.map((c) => (
                <button key={c.id} onClick={() => { setPickedCampaign(c); setNeedsCampaignChoice(false); }}
                  className="w-full p-3 text-left hover:bg-muted/40">
                  <div className="font-medium flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> {c.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Máx {c.max_percent}% · min {formatBRL(Number(c.min_purchase))}
                  </div>
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>trocar promoter</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Promoter</div>
                <div className="font-semibold">{picked.name}</div>
                {pickedCampaign && (
                  <div className="text-[11px] text-primary mt-0.5 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> {pickedCampaign.name}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Saldo total</div>
                <div className="font-bold text-success">{formatBRL(totalAvail)}</div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-0.5">
              <div className="flex justify-between"><span className="text-muted-foreground">Nomes da lista</span><span className="font-semibold">{formatBRL(namesBal)}</span></div>
              {pickedCampaign && (
                <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Campanha disponível agora</span><span className="font-semibold">{formatBRL(campBal)}</span></div>
              )}
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
          {picked && !needsCampaignChoice && (
            <Button onClick={confirm} disabled={amount <= 0 || amount > hardMax + 0.005}>
              Usar {formatBRL(Math.min(amount, hardMax))}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
