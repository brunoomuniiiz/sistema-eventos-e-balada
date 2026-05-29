import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, KeyRound, Package } from "lucide-react";
import { toast } from "sonner";
import { AuthorizationDialog } from "@/components/AuthorizationDialog";

type Props = {
  ownerId: string;
  productId: string;
  productName: string;
};

type Loc = { id: string; name: string; is_default: boolean };
type Row = { location_id: string; quantity: number };

export function StockAdjustPanel({ ownerId, productId, productName }: Props) {
  const qc = useQueryClient();
  const [locId, setLocId] = useState<string>("");
  const [delta, setDelta] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [askPin, setAskPin] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: locations = [] } = useQuery({
    queryKey: ["stock_locations_min", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_locations")
        .select("id, name, is_default")
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      const list = data as Loc[];
      if (list[0] && !locId) setLocId(list[0].id);
      return list;
    },
  });

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["product_stock_rows", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stock")
        .select("location_id, quantity")
        .eq("product_id", productId);
      if (error) throw error;
      return data as Row[];
    },
  });

  const totalAtual = rows.reduce((s, r) => s + (r.quantity ?? 0), 0);
  const qtyAt = (lid: string) => rows.find((r) => r.location_id === lid)?.quantity ?? 0;

  const apply = async (token: string) => {
    if (!locId) return toast.error("Selecione um local");
    const n = parseInt(delta, 10);
    if (!Number.isFinite(n) || n === 0) return toast.error("Informe quantidade (+ adicionar, − remover)");
    setSaving(true);
    try {
      const { error } = await supabase.rpc("adjust_product_stock", {
        _product_id: productId,
        _location_id: locId,
        _delta: n,
        _reason: reason.trim() || (n > 0 ? "Entrada manual" : "Saída manual"),
        _grant_token: token,
      });
      if (error) throw error;
      toast.success("Estoque ajustado");
      setDelta("");
      setReason("");
      refetch();
      qc.invalidateQueries({ queryKey: ["products-full"] });
      qc.invalidateQueries({ queryKey: ["product_stock"] });
      qc.invalidateQueries({ queryKey: ["stock_ledger"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ajustar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3 bg-card/30">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        <Label className="font-semibold">Estoque atual</Label>
        <span className="ml-auto text-sm font-bold tabular-nums">{totalAtual} un</span>
      </div>

      {locations.length > 1 && (
        <Select value={locId} onValueChange={setLocId}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Local" /></SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name} — {qtyAt(l.id)} un
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setDelta((d) => String(-(Math.abs(parseInt(d, 10) || 1))))}
          title="Remover"
        ><Minus className="h-4 w-4" /></Button>
        <Input
          type="number"
          inputMode="numeric"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder="Quantidade (+ ou −)"
          className="h-9 text-center font-bold"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setDelta((d) => String(Math.abs(parseInt(d, 10) || 1)))}
          title="Adicionar"
        ><Plus className="h-4 w-4" /></Button>
      </div>

      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (opcional) — ex: quebra, doação, recontagem"
        className="h-9 text-sm"
      />

      <Button
        type="button"
        onClick={() => setAskPin(true)}
        disabled={saving || !delta}
        className="w-full gap-2"
      >
        <KeyRound className="h-4 w-4" /> Aplicar ajuste (exige PIN)
      </Button>

      <p className="text-[11px] text-muted-foreground">
        Toda alteração fica registrada no Extrato de Estoque com seu nome e horário.
      </p>

      <AuthorizationDialog
        open={askPin}
        onOpenChange={setAskPin}
        scope="operation"
        title="Confirmar ajuste de estoque"
        description={`${productName}: ${parseInt(delta || "0", 10) > 0 ? "+" : ""}${delta || 0} un`}
        onApproved={(token) => apply(token)}
      />
    </div>
  );
}
