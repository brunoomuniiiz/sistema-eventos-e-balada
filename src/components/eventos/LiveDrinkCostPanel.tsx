import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Undo2, Wine, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";

type DrinkProduct = {
  id: string;
  name: string;
  cost_price: number;
  is_drink_input: boolean;
  is_sellable: boolean;
};

type Consumption = {
  id: string;
  product_name_snapshot: string;
  unit_cost_snapshot: number;
  quantity: number;
  total_cost: number;
  created_at: string;
  created_by_name: string | null;
};

export function LiveDrinkCostPanel({ eventId }: { eventId: string }) {
  const { ownerId, isOwner } = usePermissions();
  const qc = useQueryClient();
  const [extraPick, setExtraPick] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["drink-input-products", ownerId],
    enabled: !!ownerId && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, cost_price, is_drink_input, is_sellable")
        .eq("ativo_geral", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as DrinkProduct[];
    },
  });

  const { data: lancamentos = [], refetch } = useQuery({
    queryKey: ["event-drink-consumption", eventId],
    enabled: !!ownerId && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_drink_consumption")
        .select("id, product_name_snapshot, unit_cost_snapshot, quantity, total_cost, created_at, created_by_name")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Consumption[];
    },
  });

  const pinned = useMemo(() => products.filter((p) => p.is_drink_input), [products]);
  const allFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [products, search]);

  const totalCmv = useMemo(
    () => lancamentos.reduce((s, l) => s + Number(l.total_cost ?? 0), 0),
    [lancamentos]
  );
  const totalGarrafas = useMemo(
    () => lancamentos.reduce((s, l) => s + Number(l.quantity ?? 0), 0),
    [lancamentos]
  );

  const addMut = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase.rpc("register_drink_consumption", {
        p_event_id: eventId,
        p_product_id: productId,
        p_quantity: 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Garrafa lançada");
      qc.invalidateQueries({ queryKey: ["event-drink-consumption", eventId] });
      qc.invalidateQueries({ queryKey: ["event-drink-margin", eventId] });
      qc.invalidateQueries({ queryKey: ["pdv-stock-total", ownerId] });
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const undoMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("undo_drink_consumption", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento desfeito");
      qc.invalidateQueries({ queryKey: ["event-drink-consumption", eventId] });
      qc.invalidateQueries({ queryKey: ["event-drink-margin", eventId] });
      qc.invalidateQueries({ queryKey: ["pdv-stock-total", ownerId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isOwner) return null;

  const isUndoable = (createdAt: string) =>
    Date.now() - new Date(createdAt).getTime() < 5 * 60 * 1000;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Clique em <b>+1</b> a cada garrafa fechada aberta para drinks. O custo entra no CMV deste evento e baixa 1 do estoque.
        </div>
        <Badge variant="secondary" className="text-sm">
          {totalGarrafas} garrafas · {formatBRL(totalCmv)}
        </Badge>
      </div>

      {/* Grade rápida de insumos pinados */}
      {pinned.length === 0 ? (
        <div className="text-sm text-muted-foreground border border-dashed rounded p-4 text-center">
          Nenhum insumo pinado. Em <b>Produtos</b>, ative <i>"Insumo de drink (atalho no Ao Vivo)"</i> nos itens que você abre com frequência.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {pinned.map((p) => (
            <Card key={p.id} className="p-3 flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <Wine className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">{formatBRL(Number(p.cost_price))}</div>
                </div>
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={addMut.isPending}
                onClick={() => addMut.mutate(p.id)}
              >
                <Plus className="h-4 w-4 mr-1" /> 1 garrafa
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Busca para adicionar avulso */}
      <div className="space-y-2 pt-2 border-t">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Lançar outro produto</div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {allFiltered.length > 0 && (
            <Select value={extraPick} onValueChange={setExtraPick}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {allFiltered.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {formatBRL(Number(p.cost_price))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            disabled={!extraPick || addMut.isPending}
            onClick={() => {
              addMut.mutate(extraPick);
              setExtraPick("");
              setSearch("");
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Lançar
          </Button>
        </div>
      </div>

      {/* Lista cronológica */}
      <div className="space-y-2 pt-2 border-t">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Garrafas abertas neste evento</div>
        {lancamentos.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">Nenhum lançamento ainda.</div>
        ) : (
          <div className="space-y-1.5">
            {lancamentos.map((l) => (
              <div key={l.id} className="flex items-center gap-2 px-3 py-2 rounded border bg-card text-sm">
                <Wine className="h-3.5 w-3.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {Number(l.quantity)}× {l.product_name_snapshot}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {format(new Date(l.created_at), "HH:mm")}
                    {l.created_by_name ? ` · ${l.created_by_name}` : ""}
                  </div>
                </div>
                <div className="text-sm font-semibold">{formatBRL(Number(l.total_cost))}</div>
                {isUndoable(l.created_at) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => undoMut.mutate(l.id)}
                    disabled={undoMut.isPending}
                    title="Desfazer (até 5 min)"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
