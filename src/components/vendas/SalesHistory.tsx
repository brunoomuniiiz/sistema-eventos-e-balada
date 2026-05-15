import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Receipt } from "lucide-react";

export function SalesHistory({ ownerId }: { ownerId: string | null }) {
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales-history", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, payment_method, created_at, employee_name, category, discount_value")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="grid place-items-center py-12"><div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>;
  if (sales.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        <Receipt className="h-10 w-10 mx-auto mb-3 opacity-50" /> Nenhuma venda ainda
      </CardContent></Card>
    );
  }

  const total = sales.reduce((s, x) => s + Number(x.total), 0);

  return (
    <div className="space-y-3">
      <Card><CardContent className="p-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{sales.length} vendas (últimas 100)</span>
        <span className="text-xl font-bold text-gradient">{formatBRL(total)}</span>
      </CardContent></Card>
      <Card><CardContent className="p-0 divide-y">
        {sales.map((s) => (
          <div key={s.id} className="flex items-center gap-3 p-3 text-sm">
            <div className="flex-1 min-w-0">
              <div className="font-medium">{s.employee_name ?? "—"}</div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(s.created_at), "dd/MM HH:mm", { locale: ptBR })} · {s.payment_method} · {s.category}
              </div>
            </div>
            {Number(s.discount_value) > 0 && (
              <span className="text-xs text-emerald-500">-{formatBRL(Number(s.discount_value))}</span>
            )}
            <span className="font-semibold">{formatBRL(Number(s.total))}</span>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
