import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { listMigrationTables, runMigration, migrateAuthUsers } from "@/lib/migration.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Database, Loader2, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/migracao")({
  component: MigracaoPage,
});

type Result = { table: string; read: number; written: number; error?: string };

function MigracaoPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fnList = useServerFn(listMigrationTables);
  const fnRun = useServerFn(runMigration);

  const [tables, setTables] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetUrl, setTargetUrl] = useState("");
  const [targetKey, setTargetKey] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  const allowed = user?.email === "mateusdeleonmd@gmail.com";

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!allowed) return;
    fnList()
      .then((r) => {
        setTables(r.tables);
        setSelected(new Set(r.tables));
      })
      .catch((e) => toast.error(e.message));
  }, [allowed, fnList]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="p-8 max-w-md text-center space-y-3">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">
            Esta página só pode ser acessada pelo usuário autorizado.
          </p>
          <Button variant="outline" onClick={() => navigate({ to: "/" })}>Voltar</Button>
        </Card>
      </div>
    );
  }

  const toggle = (t: string) => {
    const n = new Set(selected);
    if (n.has(t)) n.delete(t); else n.add(t);
    setSelected(n);
  };

  const run = async () => {
    if (!targetUrl || !targetKey) {
      toast.error("Preencha URL e service role key do destino");
      return;
    }
    if (selected.size === 0) {
      toast.error("Selecione ao menos uma tabela");
      return;
    }
    if (!confirm(`Migrar ${selected.size} tabelas para ${targetUrl}?\n\nO schema (tabelas, RLS, functions) precisa já existir no destino.`)) return;

    setRunning(true);
    setResults([]);
    try {
      const r = await fnRun({
        data: {
          targetUrl,
          targetServiceKey: targetKey,
          tables: Array.from(selected),
        },
      });
      setResults(r.results);
      const errs = r.results.filter((x) => x.error).length;
      if (errs === 0) toast.success("Migração concluída sem erros");
      else toast.warning(`Migração concluída com ${errs} erro(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Database className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Migração para Supabase externo</h1>
          <p className="text-sm text-muted-foreground">
            Copia os dados de todas as tabelas do banco atual para outro Supabase via service role.
          </p>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <div className="grid gap-3">
          <div>
            <Label>URL do projeto destino</Label>
            <Input
              placeholder="https://xxxxxx.supabase.co"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value.trim())}
            />
          </div>
          <div>
            <Label>Service role key do destino</Label>
            <Input
              type="password"
              placeholder="eyJhbGciOi... (service_role)"
              value={targetKey}
              onChange={(e) => setTargetKey(e.target.value.trim())}
            />
            <p className="text-xs text-muted-foreground mt-1">
              A chave nunca é salva — fica apenas em memória durante esta execução.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
          <p className="font-semibold text-amber-500">⚠️ Pré-requisitos no destino</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
            <li>Schema já criado (rode o dump SQL antes desta migração)</li>
            <li>Tabelas vazias (ou conflitos farão upsert por chave primária)</li>
            <li>RLS, functions e triggers já aplicados</li>
          </ul>
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Tabelas a migrar ({selected.size}/{tables.length})</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(tables))}>Todas</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Nenhuma</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-80 overflow-auto">
          {tables.map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={selected.has(t)} onCheckedChange={() => toggle(t)} />
              <span className="font-mono text-xs">{t}</span>
            </label>
          ))}
        </div>
      </Card>

      <Button onClick={run} disabled={running} size="lg" className="w-full gap-2">
        {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Migrando…</> : <>Iniciar migração</>}
      </Button>

      {results.length > 0 && (
        <Card className="p-6 space-y-2">
          <h2 className="font-bold mb-2">Resultado</h2>
          <div className="space-y-1 text-sm font-mono">
            {results.map((r) => (
              <div key={r.table} className="flex items-start gap-2 py-1 border-b border-border/40">
                {r.error ? (
                  <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{r.table}</span>
                    <span className="text-muted-foreground text-xs">
                      lidas: {r.read} · gravadas: {r.written}
                    </span>
                  </div>
                  {r.error && (
                    <div className="text-xs text-destructive break-all mt-1">{r.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
