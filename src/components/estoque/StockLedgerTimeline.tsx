import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Search, ArrowUp, ArrowDown, ShoppingCart, ClipboardList, Hand,
  Truck, RotateCcw, Package, Clock, User,
} from "lucide-react";

type LedgerRow = {
  id: string;
  product_id: string;
  product_name_snapshot: string;
  location_id: string;
  location_name_snapshot: string | null;
  delta: number;
  qty_before: number;
  qty_after: number;
  source: string;
  source_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
};

const firstName = (n: string | null | undefined) =>
  (n ?? "Sistema").trim().split(/\s+/)[0];

const SOURCE_META: Record<string, { label: string; icon: typeof ShoppingCart; tone: string }> = {
  sale: { label: "Venda", icon: ShoppingCart, tone: "text-rose-400" },
  inventory: { label: "Inventário", icon: ClipboardList, tone: "text-sky-400" },
  manual: { label: "Ajuste manual", icon: Hand, tone: "text-amber-400" },
  purchase: { label: "Compra", icon: Truck, tone: "text-emerald-400" },
  transfer: { label: "Transferência", icon: RotateCcw, tone: "text-indigo-400" },
  backfill: { label: "Saldo inicial", icon: Package, tone: "text-muted-foreground" },
};

function metaOf(src: string) {
  return SOURCE_META[src] ?? { label: src, icon: Package, tone: "text-muted-foreground" };
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "Hoje";
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

export function StockLedgerTimeline() {
  const { ownerId, can } = usePermissions();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<LedgerRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock_ledger", ownerId],
    enabled: !!ownerId && can("estoque"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_ledger")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as LedgerRow[];
    },
    refetchInterval: 15000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.product_name_snapshot.toLowerCase().includes(q) ||
      (r.location_name_snapshot ?? "").toLowerCase().includes(q) ||
      (r.created_by_name ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, LedgerRow[]>();
    filtered.forEach((r) => {
      const day = new Date(r.created_at).toDateString();
      const list = map.get(day) ?? [];
      list.push(r);
      map.set(day, list);
    });
    return Array.from(map.entries());
  }, [filtered]);

  if (!can("estoque")) {
    return <Card><CardContent className="p-6 text-muted-foreground">Sem permissão.</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por produto, local ou quem alterou…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">Carregando…</CardContent></Card>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Nenhuma movimentação registrada.
        </CardContent></Card>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
          {grouped.map(([day, list]) => (
            <div key={day} className="mb-5">
              <div className="text-[11px] uppercase font-bold text-muted-foreground mb-2 -ml-6 pl-6">
                {fmtDayLabel(list[0].created_at)}
              </div>
              <div className="space-y-2">
                {list.map((r) => {
                  const m = metaOf(r.source);
                  const Icon = m.icon;
                  const isAdd = r.delta > 0;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="relative w-full text-left rounded-lg border bg-card hover:bg-accent/40 transition p-3 pl-4"
                    >
                      <span className={`absolute -left-[14px] top-3 h-3 w-3 rounded-full border-2 border-background ${isAdd ? "bg-emerald-500" : "bg-rose-500"}`} />
                      <div className="flex items-start gap-2">
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${m.tone}`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{r.product_name_snapshot}</div>
                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
                            <span className="tabular-nums">{r.qty_before}</span>
                            <span>→</span>
                            <span className={`inline-flex items-center gap-0.5 font-bold ${isAdd ? "text-emerald-500" : "text-rose-500"}`}>
                              {isAdd ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                              {Math.abs(r.delta)} un
                            </span>
                            <span>→</span>
                            <span className="tabular-nums font-bold">{r.qty_after}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{m.label}</span>
                            <span>·</span>
                            <span>{firstName(r.created_by_name)}</span>
                            <span>·</span>
                            <span>{new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                            {r.location_name_snapshot && <><span>·</span><span>{r.location_name_snapshot}</span></>}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[80vh]">
          {selected && (() => {
            const m = metaOf(selected.source);
            const Icon = m.icon;
            const isAdd = selected.delta > 0;
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${m.tone}`} />
                    {selected.product_name_snapshot}
                  </SheetTitle>
                  <SheetDescription>{m.label}</SheetDescription>
                </SheetHeader>

                <div className="space-y-4 mt-4">
                  <div className="rounded-lg border p-4 text-center">
                    <div className="text-xs uppercase font-bold text-muted-foreground mb-2">Movimentação</div>
                    <div className="flex items-center justify-center gap-2 text-lg">
                      <span className="tabular-nums font-bold">{selected.qty_before}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className={`inline-flex items-center gap-1 font-bold ${isAdd ? "text-emerald-500" : "text-rose-500"}`}>
                        {isAdd ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                        {isAdd ? "Adicionou" : "Removeu"} {Math.abs(selected.delta)} un
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="tabular-nums font-bold">{selected.qty_after}</span>
                    </div>
                  </div>

                  <div className="grid gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Alterado por</span>
                      <span className="font-semibold ml-auto">{firstName(selected.created_by_name)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Data e hora</span>
                      <span className="font-mono ml-auto">{fmtDateTime(selected.created_at)}</span>
                    </div>
                    {selected.location_name_snapshot && (
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Local</span>
                        <span className="font-medium ml-auto">{selected.location_name_snapshot}</span>
                      </div>
                    )}
                    {selected.reason && (
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <div className="text-[11px] uppercase font-bold text-muted-foreground mb-1">Motivo</div>
                        <div className="text-sm">{selected.reason}</div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
