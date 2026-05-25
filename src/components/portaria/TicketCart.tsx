import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { formatBRL } from "@/lib/format";

export type CartLine = {
  key: string;
  ticket_type_id: string | null;
  name: string;
  gender: string | null;
  amount: number;       // valor unitário atual (price_early/late ou override)
  baseAmount: number;   // valor calculado automaticamente
  qty: number;
};

type TicketType = {
  id: string;
  event_id: string;
  name: string;
  price_early: number;
  price_late: number;
  switch_at: string | null;
  gender_target: string | null;
  is_active: boolean;
  sort_order: number;
};

export function currentTicketPrice(t: TicketType, now = new Date()): number {
  if (!t.switch_at) return Number(t.price_early || 0);
  const switchAt = new Date(t.switch_at);
  return now >= switchAt ? Number(t.price_late || 0) : Number(t.price_early || 0);
}

function genderLabel(g: string | null) {
  if (g === "F") return "Feminino";
  if (g === "M") return "Masculino";
  return "Unissex";
}

interface Props {
  eventId: string;
  cart: CartLine[];
  setCart: (c: CartLine[]) => void;
}

export function TicketCart({ eventId, cart, setCart }: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: tickets = [] } = useQuery({
    queryKey: ["portaria-ticket-types", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_types")
        .select("id, event_id, name, price_early, price_late, switch_at, gender_target, is_active, sort_order")
        .eq("event_id", eventId)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as TicketType[];
    },
  });

  const total = useMemo(
    () => cart.reduce((s, l) => s + l.amount * l.qty, 0),
    [cart],
  );

  const addTicket = (t: TicketType) => {
    const price = currentTicketPrice(t);
    const idx = cart.findIndex(
      (l) => l.ticket_type_id === t.id && l.amount === price,
    );
    if (idx >= 0) {
      const next = [...cart];
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
      setCart(next);
    } else {
      setCart([
        ...cart,
        {
          key: `${t.id}-${Date.now()}`,
          ticket_type_id: t.id,
          name: t.name,
          gender: t.gender_target,
          amount: price,
          baseAmount: price,
          qty: 1,
        },
      ]);
    }
  };

  const changeQty = (key: string, delta: number) => {
    const next: CartLine[] = [];
    for (const l of cart) {
      if (l.key !== key) { next.push(l); continue; }
      const q = l.qty + delta;
      if (q > 0) next.push({ ...l, qty: q });
    }
    setCart(next);
  };

  const removeLine = (key: string) =>
    setCart(cart.filter((l) => l.key !== key));

  const saveEdit = (key: string) => {
    const v = Number((editValue || "0").replace(",", "."));
    if (!Number.isFinite(v) || v < 0) return;
    setCart(cart.map((l) => (l.key === key ? { ...l, amount: v } : l)));
    setEditingKey(null);
  };

  return (
    <div className="space-y-4">
      {/* Tipos disponíveis */}
      {tickets.length === 0 ? (
        <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">
          Nenhum tipo de ingresso cadastrado no evento. Cadastre em Eventos &rarr; Landing.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {tickets.map((t) => {
            const price = currentTicketPrice(t);
            const isLate = !!t.switch_at && new Date() >= new Date(t.switch_at);
            return (
              <button
                key={t.id}
                onClick={() => addTicket(t)}
                className="text-left rounded-lg border border-border bg-card hover:border-primary/60 active:scale-[0.99] transition p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold truncate">{t.name}</div>
                  {t.gender_target && (
                    <Badge variant="outline" className="text-[10px]">{genderLabel(t.gender_target)}</Badge>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <div className="text-xl font-bold text-gradient">{formatBRL(price)}</div>
                  {isLate && <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/40">após virada</Badge>}
                </div>
              </button>
            );
          })}
          {/* Sempre disponível: entrada livre sem tipo */}
          <button
            onClick={() => setCart([...cart, {
              key: `livre-${Date.now()}`,
              ticket_type_id: null,
              name: "Entrada avulsa",
              gender: null,
              amount: 0,
              baseAmount: 0,
              qty: 1,
            }])}
            className="text-left rounded-lg border border-dashed border-border hover:border-primary/60 transition p-3 text-sm text-muted-foreground"
          >
            <Plus className="h-4 w-4 inline" /> Entrada avulsa (valor livre)
          </button>
        </div>
      )}

      {/* Carrinho */}
      <div className="space-y-2">
        {cart.length === 0 ? (
          <p className="text-xs text-center text-muted-foreground py-4">
            Toque em um tipo de ingresso acima para começar.
          </p>
        ) : (
          cart.map((l) => (
            <Card key={l.key}>
              <CardContent className="p-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate flex items-center gap-2">
                    {l.name}
                    {l.gender && <Badge variant="outline" className="text-[10px]">{genderLabel(l.gender)}</Badge>}
                    {l.amount !== l.baseAmount && (
                      <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/40">alterado</Badge>
                    )}
                  </div>
                  {editingKey === l.key ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.50"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 w-24"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(l.key); }}
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveEdit(l.key)}>
                        <Check className="h-4 w-4 text-emerald-500" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingKey(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingKey(l.key); setEditValue(String(l.amount)); }}
                      className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {formatBRL(l.amount)} × {l.qty}
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(l.key, -1)}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-6 text-center font-bold">{l.qty}</span>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(l.key, +1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeLine(l.key)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Total */}
      <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/30">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">Total do carrinho</div>
          <div className="text-3xl font-bold text-gradient">{formatBRL(total)}</div>
        </CardContent>
      </Card>
    </div>
  );
}
