import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Sparkles, Pencil, Trash2, Users, Calendar, Clock } from "lucide-react";
import { PromoterCampaignDialog } from "./PromoterCampaignDialog";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";

export function PromoterCampaignsPanel() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["promoter-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promoter_credit_campaigns")
        .select("*, events(name, date)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // membros count
      const ids = (data ?? []).map((c) => c.id);
      const counts = new Map<string, number>();
      if (ids.length) {
        const { data: mems } = await supabase
          .from("promoter_credit_campaign_members")
          .select("campaign_id")
          .in("campaign_id", ids);
        for (const m of mems ?? []) counts.set(m.campaign_id, (counts.get(m.campaign_id) ?? 0) + 1);
      }
      return (data ?? []).map((c: any) => ({ ...c, member_count: counts.get(c.id) ?? 0 }));
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("promoter_credit_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campanha removida");
      qc.invalidateQueries({ queryKey: ["promoter-campaigns"] });
      qc.invalidateQueries({ queryKey: ["promoter-balances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {campaigns.length} campanha(s)
        </div>
        <Button onClick={() => { setEditingId(null); setDialogOpen(true); }}
          className="bg-gradient-primary text-primary-foreground glow-primary">
          <Plus className="h-4 w-4 mr-1.5" /> Nova campanha
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Carregando...</div>
      ) : campaigns.length === 0 ? (
        <Card className="glass border-border/60">
          <CardContent className="py-12 text-center">
            <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">Nenhuma campanha ainda.</p>
            <p className="text-xs text-muted-foreground mt-1">Crie uma para liberar crédito em lote para vários promoters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {campaigns.map((c: any) => (
            <Card key={c.id} className={`glass border-border/60 ${!c.enabled ? "opacity-60" : ""}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" /> {c.name}
                      {!c.enabled && <Badge variant="secondary" className="text-[10px]">inativa</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Calendar className="h-3 w-3" /> {c.events?.name ?? "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-muted-foreground">por promoter</div>
                    <div className="font-bold text-success">{formatBRL(Number(c.credit_amount))}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <Stat label="Min" value={formatBRL(Number(c.min_purchase))} />
                  <Stat label="Máx" value={`${c.max_percent}%`} />
                  <Stat label="Promoters" value={String(c.member_count)} icon={<Users className="h-3 w-3" />} />
                </div>

                {(c.valid_from || c.valid_until || (c.valid_weekdays && c.valid_weekdays.length > 0)) && (
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    {c.valid_from && new Date(c.valid_from).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    {c.valid_until && ` → ${new Date(c.valid_until).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`}
                    {c.valid_weekdays?.length > 0 && ` · ${c.valid_weekdays.map((d: number) => ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][d]).join(", ")}`}
                  </div>
                )}

                <div className="flex justify-end gap-1 pt-2 border-t border-border/50">
                  <Button size="sm" variant="ghost" onClick={() => { setEditingId(c.id); setDialogOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (confirm(`Remover campanha "${c.name}"? Os créditos já lançados permanecem.`)) delMut.mutate(c.id);
                  }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PromoterCampaignDialog open={dialogOpen} onOpenChange={setDialogOpen} campaignId={editingId} />
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded bg-muted/40 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
