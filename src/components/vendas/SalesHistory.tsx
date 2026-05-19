import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Receipt, Clock } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

export function SalesHistory({ ownerId }: { ownerId: string | null }) {
  const { isOwner, can } = usePermissions();
  const showFinancials = isOwner || can("financeiro");

  if (showFinancials) return <FinancialHistory ownerId={ownerId} />;
  return <OperationalTimeline ownerId={ownerId} />;
}

function FinancialHistory({ ownerId }: { ownerId: string | null }) {
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

  if (isLoading) return <Loader />;
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

function OperationalTimeline({ ownerId }: { ownerId: string | null }) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["sales-timeline", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("id, product_name, quantity, created_at, sale:sales(employee_name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        product_name: string;
        quantity: number;
        created_at: string;
        sale: { employee_name: string | null } | null;
      }>;
    },
  });

  if (isLoading) return <Loader />;
  if (items.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        <Clock className="h-10 w-10 mx-auto mb-3 opacity-50" /> Nenhuma movimentação ainda
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card><CardContent className="p-4 text-sm text-muted-foreground">
        Linha do tempo operacional — últimas 200 saídas
      </CardContent></Card>
      <Card><CardContent className="p-0 divide-y">
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 p-3 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {i.quantity}x {i.product_name}
              </div>
              {i.sale?.employee_name && (
                <div className="text-xs text-muted-foreground">{i.sale.employee_name}</div>
              )}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {format(new Date(i.created_at), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}

function Loader() {
  return (
    <div className="grid place-items-center py-12">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}
