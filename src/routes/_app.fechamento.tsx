import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Banknote, CreditCard, Smartphone, Lock, AlertTriangle, CheckCircle2, History } from "lucide-react";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_app/fechamento")({
  component: FechamentoPage,
});

type Closing = {
  id: string;
  closed_by_name: string | null;
  declared_dinheiro: number;
  declared_debito: number;
  declared_credito: number;
  declared_pix: number;
  expected_dinheiro: number;
  expected_debito: number;
  expected_credito: number;
  expected_pix: number;
  sales_count: number;
  notes: string | null;
  created_at: string;
};

const METHODS = [
  { key: "dinheiro", label: "Dinheiro", icon: Banknote },
  { key: "debito", label: "Débito", icon: CreditCard },
  { key: "credito", label: "Crédito", icon: CreditCard },
  { key: "pix", label: "Pix", icon: Smartphone },
] as const;

function FechamentoPage() {
  const { ownerId, can, loading } = usePermissions();
  const qc = useQueryClient();
  const [values, setValues] = useState({ dinheiro: "", debito: "", credito: "", pix: "" });
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Closing | null>(null);

  const { data: history = [] } = useQuery({
    queryKey: ["cash_closings", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_closings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Closing[];
    },
    enabled: !!ownerId && can("vendas"),
  });

  if (loading) return null;
  if (!can("vendas")) {
    return <PageHeader title="Fechamento" subtitle="Você não tem permissão para acessar esta página" />;
  }

  const parse = (v: string) => parseFloat(v.replace(",", ".")) || 0;

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("close_cash_blind", {
        _declared_dinheiro: parse(values.dinheiro),
        _declared_debito: parse(values.debito),
        _declared_credito: parse(values.credito),
        _declared_pix: parse(values.pix),
        _notes: notes.trim() || undefined,
      });
      if (error) throw error;
      const id = data as unknown as string;
      const { data: closing } = await supabase
        .from("cash_closings").select("*").eq("id", id).single();
      if (closing) setResult(closing as Closing);
      toast.success("Caixa fechado!");
      setValues({ dinheiro: "", debito: "", credito: "", pix: "" });
      setNotes("");
      qc.invalidateQueries({ queryKey: ["cash_closings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao fechar caixa");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div>
        <PageHeader title="Resultado do fechamento" subtitle="Comparação entre informado e sistema" />
        <ClosingReport closing={result} />
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => setResult(null)} className="flex-1">Novo fechamento</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Fechamento de Caixa" subtitle="Digite os valores em mãos. O sistema só revela o esperado depois de você enviar." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" /> Caixa cego
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            {METHODS.map((m) => (
              <div key={m.key}>
                <Label className="flex items-center gap-2 mb-1.5"><m.icon className="h-4 w-4" /> {m.label}</Label>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={values[m.key]}
                  onChange={(e) => setValues({ ...values, [m.key]: e.target.value })}
                  className="text-lg h-12"
                />
              </div>
            ))}
          </div>
          <div>
            <Label>Observações (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sangria, troco inicial, ocorrências..." />
          </div>
          <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Confira bem antes de enviar — o resultado mostra divergências e amarra todas as vendas em aberto a este fechamento.</span>
          </div>
          <Button size="lg" className="w-full h-14 text-base font-bold" onClick={submit} disabled={submitting}>
            <Lock className="h-5 w-5" />
            {submitting ? "Fechando..." : "Fechar caixa"}
          </Button>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display font-bold text-lg mb-3 flex items-center gap-2">
            <History className="h-4 w-4" /> Últimos fechamentos
          </h3>
          <div className="space-y-3">
            {history.map((c) => <ClosingReport key={c.id} closing={c} compact />)}
          </div>
        </div>
      )}
    </div>
  );
}

function ClosingReport({ closing, compact = false }: { closing: Closing; compact?: boolean }) {
  const rows = METHODS.map((m) => {
    const declared = Number(closing[`declared_${m.key}` as keyof Closing] ?? 0);
    const expected = Number(closing[`expected_${m.key}` as keyof Closing] ?? 0);
    const diff = declared - expected;
    return { ...m, declared, expected, diff };
  });
  const totalDeclared = rows.reduce((s, r) => s + r.declared, 0);
  const totalExpected = rows.reduce((s, r) => s + r.expected, 0);
  const totalDiff = totalDeclared - totalExpected;

  return (
    <Card>
      <CardContent className={compact ? "p-4" : "p-6"}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-semibold">{new Date(closing.created_at).toLocaleString("pt-BR")}</div>
            <div className="text-xs text-muted-foreground">
              {closing.closed_by_name ?? "—"} · {closing.sales_count} venda{closing.sales_count !== 1 ? "s" : ""}
            </div>
          </div>
          <DiffBadge value={totalDiff} large />
        </div>

        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-1.5 border-t text-sm">
              <div className="flex items-center gap-2"><r.icon className="h-3.5 w-3.5 text-muted-foreground" />{r.label}</div>
              <div className="text-right text-muted-foreground text-xs">
                <div>Sistema</div>
                <div className="font-mono text-foreground">{formatBRL(r.expected)}</div>
              </div>
              <div className="text-right text-muted-foreground text-xs">
                <div>Informado</div>
                <div className="font-mono text-foreground">{formatBRL(r.declared)}</div>
              </div>
              <DiffBadge value={r.diff} />
            </div>
          ))}
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 pt-2 border-t-2 font-bold">
            <div>Total</div>
            <div className="text-right font-mono">{formatBRL(totalExpected)}</div>
            <div className="text-right font-mono">{formatBRL(totalDeclared)}</div>
            <DiffBadge value={totalDiff} />
          </div>
        </div>

        {closing.notes && (
          <div className="mt-3 pt-3 border-t text-sm text-muted-foreground italic">"{closing.notes}"</div>
        )}
      </CardContent>
    </Card>
  );
}

function DiffBadge({ value, large = false }: { value: number; large?: boolean }) {
  const ok = Math.abs(value) < 0.01;
  const positive = value > 0;
  const cls = ok
    ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
    : positive
    ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
    : "bg-destructive/15 text-destructive border-destructive/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono font-semibold ${large ? "text-base" : "text-xs"} ${cls}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {ok ? "OK" : `${positive ? "+" : ""}${formatBRL(value)}`}
    </span>
  );
}
