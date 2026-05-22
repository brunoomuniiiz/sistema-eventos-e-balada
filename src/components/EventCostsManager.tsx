import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

const NEW_CATEGORY_VALUE = "__new__";

export function EventCostsManager({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [categoryId, setCategoryId] = useState<string>("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const { data: categories = [] } = useQuery({
    queryKey: ["cost-categories", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: costs = [] } = useQuery({
    queryKey: ["event-costs", eventId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_costs")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: consumacao } = useQuery({
    queryKey: ["event-consumacao-dre", eventId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_consumacao" as never, { _event_id: eventId } as never);
      if (error) throw error;
      return data as unknown as {
        by_target: Array<{ target: string; qty: number; cost: number; retail: number }>;
        totals: { qty: number; cost: number; retail: number };
      } | null;
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const value = Number(amount);
      if (!value || value <= 0) throw new Error("Informe um valor maior que zero");

      let finalCategoryId: string | null = null;
      let finalCategoryName = "";

      if (categoryId === NEW_CATEGORY_VALUE) {
        const trimmed = newCategoryName.trim();
        if (!trimmed) throw new Error("Informe o nome da nova categoria");
        const { data: created, error: catErr } = await supabase
          .from("cost_categories")
          .insert({ user_id: user.id, name: trimmed })
          .select()
          .single();
        if (catErr) throw catErr;
        finalCategoryId = created.id;
        finalCategoryName = created.name;
      } else {
        const cat = categories.find((c) => c.id === categoryId);
        if (!cat) throw new Error("Selecione uma categoria");
        finalCategoryId = cat.id;
        finalCategoryName = cat.name;
      }

      const { error } = await supabase.from("event_costs").insert({
        user_id: user.id,
        event_id: eventId,
        category_id: finalCategoryId,
        category_name: finalCategoryName,
        description: description.trim() || null,
        amount: value,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Custo adicionado");
      setDescription("");
      setAmount("");
      setNewCategoryName("");
      setCategoryId("");
      qc.invalidateQueries({ queryKey: ["event-costs", eventId] });
      qc.invalidateQueries({ queryKey: ["cost-categories"] });
      qc.invalidateQueries({ queryKey: ["monthly-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_costs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Custo removido");
      qc.invalidateQueries({ queryKey: ["event-costs", eventId] });
      qc.invalidateQueries({ queryKey: ["monthly-summary"] });
    },
  });

  const total = costs.reduce((s, c) => s + Number(c.amount), 0);

  const consumacaoCost = Number(consumacao?.totals?.cost ?? 0);
  const consumacaoRetail = Number(consumacao?.totals?.retail ?? 0);
  const totalWithConsumacao = total + consumacaoCost;

  return (
    <div className="space-y-4">
      {/* Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addMut.mutate();
        }}
        className="grid sm:grid-cols-12 gap-3 items-end"
      >
        <div className="sm:col-span-4 space-y-1.5">
          <Label>Categoria</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
              <SelectItem value={NEW_CATEGORY_VALUE}>+ Nova categoria…</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {categoryId === NEW_CATEGORY_VALUE && (
          <div className="sm:col-span-4 space-y-1.5">
            <Label>Nome da nova categoria</Label>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Ex: Decoração"
            />
          </div>
        )}

        <div className={`space-y-1.5 ${categoryId === NEW_CATEGORY_VALUE ? "sm:col-span-2" : "sm:col-span-5"}`}>
          <Label>Descrição (opcional)</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: João - segurança"
          />
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <Label>Valor (R$)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </div>

        <div className="sm:col-span-1">
          <Button
            type="submit"
            disabled={addMut.isPending}
            className="w-full bg-gradient-primary text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </form>

      {/* Lista */}
      {costs.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-6 border border-dashed border-border/60 rounded-lg">
          Nenhum custo lançado ainda.
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <ul className="divide-y divide-border/60">
            {costs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-3 hover:bg-secondary/30">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-medium text-sm">{c.category_name}</span>
                  </div>
                  {c.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate ml-5">
                      {c.description}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-semibold text-destructive">{formatBRL(Number(c.amount))}</div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Remover este custo?")) deleteMut.mutate(c.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="bg-secondary/40 px-4 py-2.5 flex items-center justify-between border-t border-border/60">
            <span className="text-sm text-muted-foreground">Total de custos</span>
            <span className="font-bold text-destructive">{formatBRL(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
