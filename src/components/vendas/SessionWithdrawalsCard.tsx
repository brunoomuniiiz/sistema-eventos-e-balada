import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowDownToLine, Plus } from "lucide-react";
import { WithdrawalDialog } from "@/components/vendas/WithdrawalDialog";
import { usePermissions } from "@/hooks/usePermissions";

export function SessionWithdrawalsCard() {
  const qc = useQueryClient();
  const { canSangria } = usePermissions();
  const [open, setOpen] = useState(false);

  const { data: session } = useQuery({
    queryKey: ["my-cash-session-wd-card"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_open_session");
      if (error) throw error;
      return data as null | { id: string };
    },
  });

  const sessionId = session?.id ?? null;

  const { data: withdrawals = [] } = useQuery({
    queryKey: ["session-withdrawals", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_withdrawals")
        .select("id, amount, reason, created_at, created_by_name, authorized_by_name")
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = withdrawals.reduce((s, w) => s + Number(w.amount), 0);

  const onDone = () => {
    qc.invalidateQueries({ queryKey: ["session-withdrawals", sessionId] });
    qc.invalidateQueries({ queryKey: ["my-cash-session-wd-card"] });
    qc.invalidateQueries({ queryKey: ["my-cash-session"] });
  };

  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-display font-bold flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-primary" /> Sangrias da sessão atual
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{formatBRL(total)}</span>
              {canSangria && (
                <Button size="sm" onClick={() => setOpen(true)} disabled={!sessionId}>
                  <Plus className="h-4 w-4" /> Nova sangria
                </Button>
              )}
            </div>
          </div>
          {!sessionId ? (
            <p className="text-xs text-muted-foreground">Abra o caixa no PDV para registrar sangrias.</p>
          ) : withdrawals.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma sangria registrada.</p>
          ) : (
            <div className="divide-y border rounded-lg">
              {withdrawals.map((w) => (
                <div key={w.id} className="p-3 text-sm flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{formatBRL(Number(w.amount))}</div>
                    {w.reason && <div className="text-xs text-muted-foreground">{w.reason}</div>}
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Feita por <strong>{w.created_by_name ?? "—"}</strong> · Autorizada por{" "}
                      <strong>{w.authorized_by_name ?? "—"}</strong>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {format(new Date(w.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <WithdrawalDialog open={open} onOpenChange={setOpen} onDone={onDone} />
    </>
  );
}
