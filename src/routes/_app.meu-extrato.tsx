import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/meu-extrato")({
  component: MeuExtratoPage,
});

function MeuExtratoPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["promoter-my-statement", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: prs } = await supabase
        .from("promoters")
        .select("id")
        .eq("user_id", user!.id);
      const ids = (prs ?? []).map((p) => p.id);
      if (ids.length === 0) return { credits: [], redemptions: [], earned: 0, spent: 0, balance: 0, events: {} as Record<string, string> };

      const [{ data: credits }, { data: redemptions }] = await Promise.all([
        supabase.from("promoter_credits")
          .select("id, amount, source, status, gender, created_at, event_id")
          .in("promoter_id", ids)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("promoter_credit_redemptions")
          .select("id, amount, created_at, sale_id")
          .in("promoter_id", ids)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const earned = (credits ?? []).reduce((s, c) => s + Number(c.amount ?? 0), 0);
      const spent = (redemptions ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const active = (credits ?? []).filter((c) => c.status === "active").reduce((s, c) => s + Number(c.amount ?? 0), 0);
      const balance = active - spent;

      const evIds = Array.from(new Set((credits ?? []).map((c) => c.event_id).filter(Boolean)));
      const events: Record<string, string> = {};
      if (evIds.length) {
        const { data: evs } = await supabase.from("events").select("id, name").in("id", evIds);
        for (const e of evs ?? []) events[e.id] = e.name;
      }

      return { credits: credits ?? [], redemptions: redemptions ?? [], earned, spent, balance: Math.max(0, balance), events };
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Meu extrato" subtitle="Crédito ganho com nomes e seus consumos" />

      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground">Saldo disponível</div>
          <div className="text-lg font-bold text-success flex items-center gap-1"><Sparkles className="h-4 w-4" />{formatBRL(data?.balance ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground">Total ganho</div>
          <div className="text-lg font-bold flex items-center gap-1"><TrendingUp className="h-4 w-4 text-success" />{formatBRL(data?.earned ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground">Total gasto</div>
          <div className="text-lg font-bold flex items-center gap-1"><TrendingDown className="h-4 w-4 text-destructive" />{formatBRL(data?.spent ?? 0)}</div>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="text-sm font-semibold">Créditos ganhos</div>
              {(data?.credits ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">Nada por aqui ainda.</p>
              ) : data!.credits.map((c) => (
                <div key={c.id} className="flex items-center gap-2 p-2 rounded border bg-card/40 text-xs">
                  <Badge variant={c.status === "active" ? "default" : c.status === "consumed" ? "secondary" : "outline"} className="shrink-0">{c.status}</Badge>
                  <span className="flex-1 truncate text-muted-foreground">
                    {data!.events[c.event_id] ?? "—"} · {c.source}{c.gender ? ` · ${c.gender}` : ""}
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap">{format(new Date(c.created_at), "dd/MM", { locale: ptBR })}</span>
                  <span className="font-semibold text-success">+{formatBRL(Number(c.amount))}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="text-sm font-semibold">Consumos</div>
              {(data?.redemptions ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">Nenhum consumo ainda.</p>
              ) : data!.redemptions.map((r) => (
                <div key={r.id} className="flex items-center gap-2 p-2 rounded border bg-card/40 text-xs">
                  <span className="flex-1 text-muted-foreground">Venda {String(r.sale_id).slice(0, 8)}…</span>
                  <span className="text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                  <span className="font-semibold text-destructive">-{formatBRL(Number(r.amount))}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
