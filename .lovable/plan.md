# Plano — Janela de operação + funcionário-promoter

## 1. Migration

- Adicionar `promoter_id uuid` em `user_roles` (FK opcional → `promoters.id`).
- Função SQL `public.close_expired_events()`: marca `status = 'ended'` em eventos `ongoing` onde `now() > date + (auto_close_hours_after + 1) * interval '1 hour'`.
- Cron a cada 15 min chamando essa função (pg_cron direto, SQL-only — não precisa de endpoint).

## 2. Hook `useOperationWindow()`

Novo `src/hooks/useOperationWindow.ts`:
- Busca próximo evento (`upcoming` ou `ongoing`) do owner.
- Retorna `{ isOpen, currentEvent, nextEventDate, closesAt }`.
- `isOpen = true` quando `now ∈ [event.date - 1h, event.date + auto_close_hours_after + 1h]`.

## 3. Gate global em `_app.tsx`

Wrapper que decide acesso fora da janela:
- **Owner** → passa sempre.
- **Tem permissão `eventos` OU `promoters`** → passa, mas o sidebar esconde abas operacionais (PDV, Estoque, Portaria, Financeiro, Lojinha) — só vê Eventos/Promoters.
- **Tem `promoter_id` vinculado** → redireciona pra `/meus-eventos` (visão promoter comum).
- **Demais** → tela cheia "Bar fechado. Próximo evento: {data} às {hora}."

Dentro da janela tudo funciona normal como hoje.

## 4. TeamPanel — funcionário é promoter

Em `src/components/config/TeamPanel.tsx`, em cada card de funcionário:
- Toggle **"Também é promoter"**.
- Quando ligado: select com promoters cadastrados → grava `user_roles.promoter_id`.
- Desligar limpa o vínculo.

## 5. Lojinha pública com gate

Em `src/routes/loja.$slug.tsx`:
- Mesma checagem de janela do owner dono da lojinha.
- Fora da janela: tela "Loja fechada. Reabre em {data} às {hora}."
- `lojinha_settings.enabled` continua manual (mestre liga/desliga); a janela só sobrepõe quando `enabled = true`.

## 6. PIX externo no relatório

Pequeno ajuste em `TerminalsBreakdown.tsx`: separar `pix_chave` (PIX manual) de `pix` (QR MP) como duas linhas distintas.

## Arquivos

**Criar:**
- `src/hooks/useOperationWindow.ts`
- `src/components/OperationClosedScreen.tsx`
- Migration com `promoter_id` + função + cron

**Editar:**
- `src/routes/_app.tsx` (gate global)
- `src/components/config/TeamPanel.tsx` (toggle promoter)
- `src/routes/loja.$slug.tsx` (gate público)
- `src/components/financeiro/TerminalsBreakdown.tsx` (linha PIX manual)
- `src/hooks/usePermissions.tsx` (expor `promoterId`)

## Ordem

1. Migration (promoter_id + cron de fechar evento)
2. Hook `useOperationWindow` + tela "Bar fechado"
3. Gate em `_app.tsx` (com regras de exceção)
4. TeamPanel toggle promoter
5. Gate na lojinha pública
6. Ajuste PIX manual no relatório

Confirma pra eu partir pro passo 1.