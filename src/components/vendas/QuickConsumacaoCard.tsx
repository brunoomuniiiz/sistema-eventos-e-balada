import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Beer, Plus, Minus, Trash2, Search, Music2, Disc3, ShieldCheck, UserCog, Gift } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

type Target = "banda" | "dj" | "seguranca" | "funcionario" | "sorteio";

const TARGETS: { value: Target; label: string; icon: React.ReactNode; placeholder: string }[] = [
  { value: "seguranca",   label: "Segurança",  icon: <ShieldCheck className="h-3.5 w-3.5" />, placeholder: "ex.: Gledson (som)" },
  { value: "banda",       label: "Banda",      icon: <Music2 className="h-3.5 w-3.5" />,      placeholder: "ex.: Banda Os Caras" },
  { value: "dj",          label: "DJ",         icon: <Disc3 className="h-3.5 w-3.5" />,       placeholder: "ex.: DJ Fulano" },
  { value: "funcionario", label: "Funcionário",icon: <UserCog className="h-3.5 w-3.5" />,     placeholder: "ex.: nome do funcionário" },
  { value: "sorteio",     label: "Sorteio",    icon: <Gift className="h-3.5 w-3.5" />,        placeholder: "ex.: ganhador" },
];

type Product = { id: string; name: string; price: number; cost_price: number; track_stock: boolean };
type Item = { product_id: string; name: string; unit_price: number; cost_price: number; quantity: number };

interface Props {
  eventId: string;
  eventName?: string | null;
}

export function QuickConsumacaoCard({ eventId, eventName }: Props) {
  const { user } = useAuth();
  const { ownerId, canConsumacao } = usePermissions();
  const qc = useQueryClient();

  const [target, setTarget] = useState<Target>("seguranca");
  const [recipient, setRecipient] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Item[]>([]);

  const { data: locationId } = useQuery({
    queryKey: ["default-location", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_locations")
        .select("id")
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.id ?? null;
    },
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["consumacao-products", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, cost_price, track_stock, is_available, ativo_geral")
        .eq("is_available", true)
        .eq("ativo_geral", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [products, search]);

  const add = (p: Product) => {
    setItems((cur) => {
      const idx = cur.findIndex((i) => i.product_id === p.id);
      if (idx >= 0) {
        const n = [...cur];
        n[idx] = { ...n[idx], quantity: n[idx].quantity + 1 };
        return n;
      }
      return [...cur, { product_id: p.id, name: p.name, unit_price: Number(p.price), cost_price: Number(p.cost_price), quantity: 1 }];
    });
    setSearch("");
  };

  const inc = (id: string, d: number) =>
    setItems((cur) => cur.flatMap((i) => i.product_id === id ? (i.quantity + d <= 0 ? [] : [{ ...i, quantity: i.quantity + d }]) : [i]));

  const totalCost = items.reduce((s, i) => s + i.cost_price * i.quantity, 0);
  const totalRetail = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  const placeholder = TARGETS.find((t) => t.value === target)?.placeholder ?? "";

  const save = useMutation({
    mutationFn: async () => {
      if (!user || !ownerId) throw new Error("Não autenticado");
      if (items.length === 0) throw new Error("Adicione produtos");
      if (!locationId) throw new Error("Nenhum estoque padrão configurado");

      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          user_id: ownerId,
          employee_name: user.email ?? null,
          payment_method: "dinheiro",
          total: 0,
          location_id: locationId,
          event_id: eventId,
          category: "consumacao",
          consumacao_target: target,
          consumacao_recipient_name: recipient.trim() || null,
        } as never)
        .select("id")
        .single();
      if (saleErr) throw saleErr;

      const rows = items.map((i) => ({
        user_id: ownerId,
        sale_id: (sale as { id: string }).id,
        product_id: i.product_id,
        product_name: i.name,
        unit_price: i.unit_price,
        quantity: i.quantity,
        subtotal: 0,
        cost_price_snapshot: i.cost_price,
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(rows);
      if (itemsErr) throw itemsErr;
    },
    onSuccess: () => {
      toast.success(`Consumação registrada${recipient.trim() ? ` para ${recipient.trim()}` : ""}`);
      setItems([]);
      setRecipient("");
      qc.invalidateQueries({ queryKey: ["event-consumacao", eventId] });
      qc.invalidateQueries({ queryKey: ["pdv-stock-total"] });
      qc.invalidateQueries({ queryKey: ["investments-offsets"] });
      qc.invalidateQueries({ queryKey: ["expense-offsets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canConsumacao) return null;

  return (
    <Card className="border-primary/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Beer className="h-4 w-4 text-primary" />
            <span className="font-display font-bold">Consumação interna</span>
          </div>
          {eventName && <span className="text-[11px] text-muted-foreground truncate">→ {eventName}</span>}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TARGETS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTarget(t.value)}
              className={`px-2.5 py-1 rounded-full border text-xs font-medium flex items-center gap-1 transition ${
                target === t.value ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:border-primary"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <Input
          placeholder={`Nome de quem pegou — ${placeholder}`}
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />

        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar produto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filtered.length > 0 && (
            <div className="absolute z-10 mt-1 left-0 right-0 bg-popover border rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => add(p)}
                  className="w-full text-left p-2 hover:bg-muted flex items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">custo {formatBRL(Number(p.cost_price))}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border rounded-lg divide-y">
            {items.map((i) => (
              <div key={i.product_id} className="p-2 flex items-center gap-2">
                <span className="flex-1 truncate text-sm font-medium">{i.name}</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => inc(i.product_id, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold">{i.quantity}</span>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => inc(i.product_id, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <span className="text-[11px] text-muted-foreground w-20 text-right">
                  custo {formatBRL(i.cost_price * i.quantity)}
                </span>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => inc(i.product_id, -i.quantity)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Badge variant="outline" className="justify-center py-1.5">{totalQty} itens</Badge>
            <Badge variant="outline" className="justify-center py-1.5 text-destructive border-destructive/40">
              custo {formatBRL(totalCost)}
            </Badge>
            <Badge variant="outline" className="justify-center py-1.5 text-muted-foreground">
              balcão {formatBRL(totalRetail)}
            </Badge>
          </div>
        )}

        <Button
          className="w-full"
          disabled={save.isPending || items.length === 0}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Lançando…" : "Lançar consumação"}
        </Button>
      </CardContent>
    </Card>
  );
}
