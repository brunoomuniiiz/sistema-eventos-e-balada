## Problema

Tela de `/vendas` e `/portaria` ficam presas em "Carregando estado do caixa…".

Causa raiz identificada nos logs de rede:

```
POST .../rpc/get_sector_statuses  → 405
{"code":"25006","message":"cannot execute INSERT in a read-only transaction"}
```

A função `public.get_sector_statuses()` está declarada como `STABLE`, então o PostgREST a executa em transação read-only. Mas internamente ela chama `_ensure_sector_row()`, que faz `INSERT` da linha do setor caso ainda não exista — daí o erro 25006. Como a RPC falha sempre, o React Query nunca traz dados, `row` permanece `null`, e o `CashGate` mostra o loader infinitamente.

## Correção

**1. Migration** — recriar `get_sector_statuses()` como `VOLATILE` (default) para permitir o INSERT do `_ensure_sector_row`:

```sql
CREATE OR REPLACE FUNCTION public.get_sector_statuses()
RETURNS SETOF public.cash_register_sectors
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _owner uuid;
BEGIN
  _owner := public.get_owner_id(auth.uid());
  IF _owner IS NULL THEN RETURN; END IF;
  PERFORM public._ensure_sector_row(_owner, 'bar');
  PERFORM public._ensure_sector_row(_owner, 'portaria');
  RETURN QUERY SELECT * FROM public.cash_register_sectors
    WHERE user_id = _owner ORDER BY sector;
END $$;
```
(Removido o `STABLE`.)

**2. Hardening do `CashGate.tsx`** — para não voltar a travar caso a RPC falhe no futuro:
- Pegar `error` do `useSectorStatus`.
- Se `error` → mostrar card com a mensagem real (não loader).
- Se `!isLoading && !row` → tratar como "setor não inicializado" com botão "Tentar novamente" em vez de loader infinito.

## Arquivos

- Nova migration em `supabase/migrations/` redefinindo `get_sector_statuses` sem `STABLE`.
- `src/components/caixa/CashGate.tsx` — expor `error`, separar estados loading/erro/sem-row.
- `src/hooks/useSectorCash.tsx` — repassar `error` no retorno de `useSectorStatus`.

Sem mudanças em RLS, regras de negócio ou UI das vendas em si.