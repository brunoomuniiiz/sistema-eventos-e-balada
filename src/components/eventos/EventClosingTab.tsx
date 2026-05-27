import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronRight, Loader2, LockKeyhole, RotateCcw, Wallet } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StaffClosingSheet } from "./StaffClosingSheet";

type StaffRow = {
  staff_user_id: string;
  staff_name: string;
  accepts_cash: boolean;
  total_system: number;
  closing_id: string | null;
  closed_at: string | null;
  total_reported: number | null;
};

export function EventClosingTab({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const [active, setActive] = useState<StaffRow | null>(null);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["event-staff-to-close", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_staff_to_close", { _event_id: eventId });
      if (error) throw error;
      return (data ?? []) as unknown as StaffRow[];
    },
  });

  const reopenMut = useMutation({
    mutationFn: async (closingId: string) => {
      const { error } = await supabase.rpc("reopen_staff_closing", { _closing_id: closingId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fechamento reaberto");
      qc.invalidateQueries({ queryKey: ["event-staff-to-close", eventId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalSystem = staff.reduce((s, x) => s + Number(x.total_system), 0);
  const totalReported = staff.reduce((s, x) => s + Number(x.total_reported ?? 0), 0);
  const pendingCount = staff.filter((s) => !s.closing_id).length;
  const allDone = staff.length > 0 && pendingCount === 0;

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <Card className="glass border-border/60">
        <CardContent className="p-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[11px] text-muted-foreground uppercase">Sistema</div>
            <div className="font-bold mt-0.5">{formatBRL(totalSystem)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase">Real (relatório)</div>
            <div className="font-bold mt-0.5 text-primary">{formatBRL(totalReported)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase">Status</div>
            <div className="mt-0.5">
              {allDone
                ? <Badge className="bg-emerald-500">Tudo fechado</Badge>
                : <Badge variant="outline">{pendingCount} pendente(s)</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : staff.length === 0 ? (
        <Card className="glass border-border/60">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum funcionário operou neste evento ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {staff.map((s) => {
            const isClosed = !!s.closing_id;
            return (
              <div
                key={s.staff_user_id}
                className={cn(
                  "rounded-lg border p-3 flex items-center gap-3",
                  isClosed ? "bg-emerald-500/5 border-emerald-500/30" : "bg-card/40",
                )}
              >
                <button
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                  onClick={() => setActive(s)}
                >
                  <div className={cn(
                    "h-9 w-9 rounded-full grid place-items-center shrink-0",
                    isClosed ? "bg-emerald-500 text-white" : "bg-muted",
                  )}>
                    {isClosed ? <Check className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {s.staff_name}
                      {s.accepts_cash && <Wallet className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Sistema {formatBRL(s.total_system)}
                      {isClosed && s.total_reported !== null && (
                        <> · Real <span className="text-foreground font-medium">{formatBRL(s.total_reported)}</span></>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
                {isClosed && s.closing_id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Reabrir fechamento de ${s.staff_name}?`)) reopenMut.mutate(s.closing_id!);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {active && (
        <StaffClosingSheet
          open={!!active}
          onOpenChange={(v) => !v && setActive(null)}
          eventId={eventId}
          staffUserId={active.staff_user_id}
          staffName={active.staff_name}
          acceptsCash={active.accepts_cash}
        />
      )}
    </div>
  );
}
