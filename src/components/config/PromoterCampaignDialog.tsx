import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Users, X, AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaignId?: string | null;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function PromoterCampaignDialog({ open, onOpenChange, campaignId }: Props) {
  const qc = useQueryClient();
  const isEdit = !!campaignId;

  const [name, setName] = useState("");
  const [eventId, setEventId] = useState<string>("");
  const [creditAmount, setCreditAmount] = useState(50);
  const [minPurchase, setMinPurchase] = useState(0);
  const [maxPercent, setMaxPercent] = useState(50);
  const [excludedProducts, setExcludedProducts] = useState<string[]>([]);
  const [excludedCategories, setExcludedCategories] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [validFrom, setValidFrom] = useState<string>("");
  const [validUntil, setValidUntil] = useState<string>("");
  const [validWeekdays, setValidWeekdays] = useState<number[]>([]);
  const [appliesToPromotions, setAppliesToPromotions] = useState(false);
  const [notes, setNotes] = useState("");
  const [selectedPromoters, setSelectedPromoters] = useState<string[]>([]);

  // listas
  const { data: events = [] } = useQuery({
    queryKey: ["pcc-events", open],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("events").select("id, name, date").order("date", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const { data: promoters = [] } = useQuery({
    queryKey: ["pcc-promoters", open],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("promoters").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["pcc-products", open],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, category_id").eq("ativo_geral", true).order("name");
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["pcc-categories", open],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("product_categories").select("id, name").order("name");
      return data ?? [];
    },
  });

  // campanhas ativas no mesmo evento (para sinalizar duplicidade)
  const { data: siblings = [] } = useQuery({
    queryKey: ["pcc-siblings", eventId, open],
    enabled: open && !!eventId,
    queryFn: async () => {
      const { data: cs } = await supabase
        .from("promoter_credit_campaigns")
        .select("id, name")
        .eq("event_id", eventId)
        .eq("enabled", true);
      const ids = (cs ?? []).map((c) => c.id).filter((id) => id !== campaignId);
      if (!ids.length) return [] as { promoter_id: string; campaign_name: string }[];
      const { data: ms } = await supabase
        .from("promoter_credit_campaign_members")
        .select("promoter_id, campaign_id")
        .in("campaign_id", ids);
      const byCamp = new Map((cs ?? []).map((c) => [c.id, c.name] as const));
      return (ms ?? []).map((m) => ({
        promoter_id: m.promoter_id,
        campaign_name: byCamp.get(m.campaign_id) ?? "",
      }));
    },
  });

  const duplicateMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of siblings) if (!m.has(s.promoter_id)) m.set(s.promoter_id, s.campaign_name);
    return m;
  }, [siblings]);

  // carrega campanha em edição
  const { data: existing } = useQuery({
    queryKey: ["pcc-load", campaignId, open],
    enabled: open && !!campaignId,
    queryFn: async () => {
      const { data } = await supabase.from("promoter_credit_campaigns").select("*").eq("id", campaignId!).maybeSingle();
      const { data: mems } = await supabase
        .from("promoter_credit_campaign_members")
        .select("promoter_id")
        .eq("campaign_id", campaignId!);
      return { c: data, members: (mems ?? []).map((m) => m.promoter_id) };
    },
  });

  useEffect(() => {
    if (!open) return;
    if (existing?.c) {
      const c = existing.c;
      setName(c.name);
      setEventId(c.event_id);
      setCreditAmount(Number(c.credit_amount));
      setMinPurchase(Number(c.min_purchase));
      setMaxPercent(Number(c.max_percent));
      setExcludedProducts(c.excluded_product_ids ?? []);
      setExcludedCategories(c.excluded_category_ids ?? []);
      setEnabled(!!c.enabled);
      setValidFrom(c.valid_from ? toLocalInput(c.valid_from) : "");
      setValidUntil(c.valid_until ? toLocalInput(c.valid_until) : "");
      setValidWeekdays(c.valid_weekdays ?? []);
      setAppliesToPromotions(!!c.applies_to_promotions);
      setNotes(c.notes ?? "");
      setSelectedPromoters(existing.members ?? []);
    } else if (open && !campaignId) {
      setName(""); setEventId(""); setCreditAmount(50); setMinPurchase(0); setMaxPercent(50);
      setExcludedProducts([]); setExcludedCategories([]); setEnabled(true);
      setValidFrom(""); setValidUntil(""); setValidWeekdays([]);
      setAppliesToPromotions(false); setNotes(""); setSelectedPromoters([]);
    }
  }, [open, existing, campaignId]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Dê um nome para a campanha");
      if (!eventId) throw new Error("Escolha o evento");
      const { data, error } = await supabase.rpc("upsert_promoter_credit_campaign", {
        _campaign_id: campaignId ?? null,
        _event_id: eventId,
        _name: name.trim(),
        _credit_amount: creditAmount,
        _min_purchase: minPurchase,
        _max_percent: maxPercent,
        _excluded_product_ids: excludedProducts,
        _excluded_category_ids: excludedCategories,
        _valid_from: validFrom ? new Date(validFrom).toISOString() : null,
        _valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        _valid_weekdays: validWeekdays.length ? validWeekdays : null,
        _applies_to_promotions: appliesToPromotions,
        _enabled: enabled,
        _notes: notes.trim() || null,
        _promoter_ids: selectedPromoters,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Campanha atualizada" : "Campanha criada e créditos liberados");
      qc.invalidateQueries({ queryKey: ["promoter-campaigns"] });
      qc.invalidateQueries({ queryKey: ["promoter-balances"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleProd = (id: string) =>
    setExcludedProducts((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleCat = (id: string) =>
    setExcludedCategories((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const togglePromoter = (id: string) =>
    setSelectedPromoters((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleDay = (d: number) =>
    setValidWeekdays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl text-gradient">
            <Sparkles className="h-5 w-5 text-primary" />
            {isEdit ? "Editar campanha" : "Nova campanha de crédito"}
          </DialogTitle>
          <DialogDescription>
            Defina valor, regras e os promoters que recebem o crédito desta campanha.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="dados" className="mt-2">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="dados">Valor & regras</TabsTrigger>
            <TabsTrigger value="janela">Janela</TabsTrigger>
            <TabsTrigger value="promoters">
              Promoters <Badge variant="secondary" className="ml-1.5">{selectedPromoters.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome da campanha *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Sex VIP até 22h" />
              </div>
              <div>
                <Label>Evento *</Label>
                <Select value={eventId} onValueChange={setEventId}>
                  <SelectTrigger><SelectValue placeholder="Escolha o evento" /></SelectTrigger>
                  <SelectContent>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor do crédito *</Label>
                <CurrencyInput value={creditAmount} onChange={setCreditAmount} />
              </div>
              <div>
                <Label>Compra mínima</Label>
                <CurrencyInput value={minPurchase} onChange={setMinPurchase} />
              </div>
              <div>
                <Label>Máx % da venda elegível</Label>
                <Input type="number" min={0} max={100} value={maxPercent}
                  onChange={(e) => setMaxPercent(Math.min(100, Math.max(0, +e.target.value || 0)))} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Teto absoluto: nunca abate mais que {maxPercent}% do subtotal elegível.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Categorias bloqueadas</Label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <Badge key={c.id} variant={excludedCategories.includes(c.id) ? "destructive" : "outline"}
                    className="cursor-pointer" onClick={() => toggleCat(c.id)}>
                    {excludedCategories.includes(c.id) && <X className="h-3 w-3 mr-1" />}{c.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Produtos bloqueados</Label>
              <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                {products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/30 rounded px-1.5 py-1">
                    <input type="checkbox" checked={excludedProducts.includes(p.id)} onChange={() => toggleProd(p.id)} />
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <div className="text-sm font-medium">Vale em produtos em promoção</div>
                <div className="text-xs text-muted-foreground">Se desligado, créditos não abatem produtos com promoção ativa.</div>
              </div>
              <Switch checked={appliesToPromotions} onCheckedChange={setAppliesToPromotions} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <div className="text-sm font-medium">Campanha ativa</div>
                <div className="text-xs text-muted-foreground">Desligue para suspender sem apagar.</div>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div>
              <Label>Anotações</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </TabsContent>

          <TabsContent value="janela" className="space-y-4 pt-4">
            <div className="rounded-lg border p-3 text-xs text-muted-foreground flex items-start gap-2">
              <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                A janela vale só para o <strong>crédito da campanha</strong>. O crédito ganho com nomes na lista
                continua sempre disponível, sem horário.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vale a partir de</Label>
                <Input type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
              </div>
              <div>
                <Label>Vale até</Label>
                <Input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Dias da semana (opcional)</Label>
              <div className="flex gap-1.5 mt-1.5">
                {WEEKDAYS.map((d, i) => (
                  <Badge key={i} variant={validWeekdays.includes(i) ? "default" : "outline"}
                    className="cursor-pointer" onClick={() => toggleDay(i)}>{d}</Badge>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Vazio = todos os dias.</p>
            </div>
          </TabsContent>

          <TabsContent value="promoters" className="space-y-3 pt-4">
            <div className="text-xs text-muted-foreground">
              {selectedPromoters.length} selecionado(s). Promoters em outra campanha ativa do mesmo evento
              aparecem com aviso.
            </div>
            <div className="max-h-80 overflow-y-auto border rounded-lg divide-y">
              {promoters.map((p) => {
                const dup = duplicateMap.get(p.id);
                const checked = selectedPromoters.includes(p.id);
                return (
                  <label key={p.id} className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 ${dup && !checked ? "opacity-60" : ""}`}>
                    <input type="checkbox" checked={checked} onChange={() => togglePromoter(p.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{p.name}</div>
                      {dup && (
                        <div className="text-[11px] text-amber-500 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> já em "{dup}"
                        </div>
                      )}
                    </div>
                    <Badge variant="outline">{formatBRL(creditAmount)}</Badge>
                  </label>
                );
              })}
              {promoters.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" /> Nenhum promoter cadastrado
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
            className="bg-gradient-primary text-primary-foreground">
            {saveMut.isPending ? "Salvando..." : isEdit ? "Salvar" : "Criar campanha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
