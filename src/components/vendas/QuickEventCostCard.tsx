import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Zap, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SupplierConsumptionSheet } from "@/components/financeiro/SupplierConsumptionSheet";

interface Props {
  eventId: string | null;
  eventName?: string | null;
}

const QUICK_CATS = ["DJ", "Segurança", "Som", "Cachê", "Bar", "Marketing", "Aluguel", "Outros"];

export function QuickEventCostCard({ eventId, eventName }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);

  const { data: recent = [] } = useQuery({
    queryKey: ["event-costs-recent", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_costs")
        .select("id, amount, category_name, description, created_at")
        .eq("event_id", eventId!)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!user || !eventId) throw new Error("Sem evento ativo");
      if (amount <= 0) throw new Error("Valor inválido");
      if (!category) throw new Error("Escolha a categoria");
      const { error } = await supabase.from("event_costs").insert({
        user_id: user.id,
        event_id: eventId,
        amount,
        category_name: category,
        description: description.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Custo de ${formatBRL(amount)} lançado`);
      setAmount(0);
      setCategory("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["event-costs-recent", eventId] });
      qc.invalidateQueries({ queryKey: ["financeiro-real"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!eventId) return null;

  return (
    <Card className="border-primary/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="font-display font-bold">Custo rápido</span>
          </div>
          {eventName && <span className="text-[11px] text-muted-foreground truncate">→ {eventName}</span>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[120px_140px_1fr_auto] gap-2">
          <CurrencyInput value={amount} onChange={setAmount} placeholder="R$ 0,00" />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              {QUICK_CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" />
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Plus className="h-4 w-4" /> Lançar
          </Button>
        </div>

        {recent.length > 0 && (
          <div className="space-y-1 pt-2 border-t">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Últimos custos da noite</div>
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-sm py-1">
                <span className="text-xs text-muted-foreground w-12">{format(new Date(r.created_at), "HH:mm", { locale: ptBR })}</span>
                <span className="font-medium w-20">{r.category_name}</span>
                <span className="flex-1 truncate text-xs text-muted-foreground">{r.description ?? "—"}</span>
                <span className="font-semibold text-destructive">-{formatBRL(Number(r.amount))}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
