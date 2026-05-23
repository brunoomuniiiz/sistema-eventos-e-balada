import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Beer, ChevronDown, ChevronUp, Music2, Disc3, ShieldCheck, UserCog, Gift, User } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Target = "banda" | "dj" | "seguranca" | "funcionario" | "sorteio";

type ByRecipient = { target: Target; recipient_name: string; qty: number; cost: number; retail: number };

type Payload = {
  by_target: Array<{ target: Target; qty: number; cost: number; retail: number }>;
  by_recipient: ByRecipient[];
  items: Array<{
    sale_id: string;
    created_at: string;
    employee_name: string | null;
    target: Target;
    recipient_name: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    cost_price_snapshot: number;
    cost_total: number;
    retail_total: number;
  }>;
  totals: { qty: number; cost: number; retail: number };
};

const TARGET_META: Record<Target, { label: string; icon: React.ReactNode }> = {
  banda:       { label: "Banda",            icon: <Music2 className="h-3.5 w-3.5" /> },
  dj:          { label: "DJ",               icon: <Disc3 className="h-3.5 w-3.5" /> },
  seguranca:   { label: "Segurança",        icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  funcionario: { label: "Funcionário",      icon: <UserCog className="h-3.5 w-3.5" /> },
  sorteio:     { label: "Ganhador sorteio", icon: <Gift className="h-3.5 w-3.5" /> },
};

export function ConsumacaoLivePanel({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["event-consumacao", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_consumacao" as never, { _event_id: eventId } as never);
      if (error) throw error;
      return data as unknown as Payload;
    },
    refetchInterval: 10000,
  });

  const totals = data?.totals ?? { qty: 0, cost: 0, retail: 0 };
  const byTarget = data?.by_target ?? [];
  const byRecipient = data?.by_recipient ?? [];
  const items = data?.items ?? [];

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Beer className="h-4 w-4 text-primary" />
            <span className="font-display font-bold">Consumação interna</span>
            <Badge variant="outline" className="text-[10px]">{eventName}</Badge>
          </div>
          <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <><ChevronUp className="h-3.5 w-3.5" /> Recolher</> : <><ChevronDown className="h-3.5 w-3.5" /> Detalhar</>}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Itens entregues à equipe e atrações. Não somam faturamento — só baixam estoque e contabilizam custo no fechamento.
        </p>

        {isLoading && !data ? (
          <div className="text-xs text-muted-foreground py-3">Carregando…</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Itens" value={String(totals.qty)} />
              <Metric label="Custo total" value={formatBRL(Number(totals.cost))} highlight />
              <Metric label="Valor balcão" value={formatBRL(Number(totals.retail))} muted />
            </div>

            {byTarget.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Nenhuma consumação lançada ainda.</p>
            ) : (
              <div className="border rounded-lg divide-y">
                {byTarget.map((b) => {
                  const meta = TARGET_META[b.target];
                  return (
                    <div key={b.target} className="p-2 flex items-center gap-2 text-sm">
                      <span className="text-primary">{meta?.icon}</span>
                      <span className="font-medium flex-1">{meta?.label ?? b.target}</span>
                      <span className="text-xs text-muted-foreground">{Number(b.qty)} itens</span>
                      <span className="font-semibold w-24 text-right">{formatBRL(Number(b.cost))}</span>
                      <span className="text-[11px] text-muted-foreground w-24 text-right">balcão {formatBRL(Number(b.retail))}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {byRecipient.filter((r) => r.recipient_name && r.recipient_name !== "—").length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Por pessoa</div>
                <div className="border rounded-lg divide-y">
                  {byRecipient
                    .filter((r) => r.recipient_name && r.recipient_name !== "—")
                    .map((r, i) => {
                      const meta = TARGET_META[r.target];
                      return (
                        <div key={`${r.target}-${r.recipient_name}-${i}`} className="p-2 flex items-center gap-2 text-xs">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium truncate flex-1">
                            {r.recipient_name} <span className="text-muted-foreground">· {meta?.label ?? r.target}</span>
                          </span>
                          <span className="text-muted-foreground">{Number(r.qty)} itens</span>
                          <span className="font-semibold w-20 text-right">{formatBRL(Number(r.cost))}</span>
                          <span className="text-muted-foreground w-20 text-right">balcão {formatBRL(Number(r.retail))}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {expanded && items.length > 0 && (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Horário</th>
                      <th className="text-left py-2 px-2">Produto</th>
                      <th className="text-left py-2 px-2">Destino</th>
                      <th className="text-left py-2 px-2">Para quem</th>
                      <th className="text-right py-2 px-2">Qtd</th>
                      <th className="text-right py-2 px-2">Custo</th>
                      <th className="text-right py-2 px-2">Balcão</th>
                      <th className="text-left py-2 px-2">Lançado por</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((it, idx) => {
                      const meta = TARGET_META[it.target];
                      return (
                        <tr key={`${it.sale_id}-${idx}`}>
                          <td className="py-1.5 px-2 text-muted-foreground">{format(new Date(it.created_at), "HH:mm", { locale: ptBR })}</td>
                          <td className="py-1.5 px-2 font-medium">{it.product_name}</td>
                          <td className="py-1.5 px-2">{meta?.label ?? it.target}</td>
                          <td className="py-1.5 px-2 text-muted-foreground">{it.recipient_name ?? "—"}</td>
                          <td className="py-1.5 px-2 text-right">{Number(it.quantity)}</td>
                          <td className="py-1.5 px-2 text-right">{formatBRL(Number(it.cost_total))}</td>
                          <td className="py-1.5 px-2 text-right text-muted-foreground">{formatBRL(Number(it.retail_total))}</td>
                          <td className="py-1.5 px-2 text-muted-foreground truncate max-w-[140px]">{it.employee_name ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, highlight, muted }: { label: string; value: string; highlight?: boolean; muted?: boolean }) {
  return (
    <div className="rounded-lg border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-bold ${highlight ? "text-destructive" : muted ? "text-muted-foreground" : ""}`}>{value}</div>
    </div>
  );
}
