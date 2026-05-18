## 1. Fechamento de caixa em 3 etapas (revisão antes de confirmar)

Hoje: digita valores → senha → fecha direto. Vou transformar em **3 etapas dentro do `CashClosingDialog`**:

**Etapa 1 — Declaração (igual hoje)**
- Operador digita Dinheiro / Débito / Crédito / Pix sem ver o esperado.
- Botão: "Pedir autorização".

**Etapa 2 — Autorização**
- Abre o `AuthorizationDialog` (e-mail + senha do responsável).
- Ao aprovar, **guarda o `grant_token`** e vai para Etapa 3 (não fecha ainda).
- Para ter os esperados sem consumir o grant, crio uma RPC read-only `get_session_expected_totals()` que devolve: `expected_dinheiro` (= abertura + vendas em dinheiro − sangrias), `expected_debito`, `expected_credito`, `expected_pix`, `opening_amount`, `withdrawals_total`, `sales_count`.

**Etapa 3 — Revisão e confirmação**
- Tabela por forma de pagamento: **Esperado · Declarado · Diferença**.
  - **Dinheiro**: precisa bater exato. Diferença ≠ 0 → vermelho com aviso "O dinheiro precisa estar correto".
  - **Débito / Crédito / Pix**: sobra ou exato → ok; faltando → vermelho com aviso "Está faltando R$ X, verifique antes de confirmar".
- Resumo: abertura, sangrias, total de vendas.
- Dois botões: "Voltar e corrigir" (volta pra Etapa 1, mantém o token) e "Confirmar fechamento" (chama `close_cash_blind` com o `grant_token`).
- Se o token expirar entre etapas, mostro erro e peço nova autorização.

## 2. Abrir caixa — manter escolha de evento, mas corrigir erro quando não há evento

A UI continua igual (Select de evento com opção "Sem evento (bar normal)"). O problema é técnico: existem **duas versões da função `open_cash_session` no banco** (uma com 2 args, outra com 3), o que deixa a chamada RPC ambígua quando `_event_id` vem `undefined`.

Vou:
- Em migração SQL, **remover a versão antiga** `open_cash_session(_opening, _notes)` e manter só a com `_event_id uuid DEFAULT NULL`.
- Em `OpenCashDialog.submit`, passar `_event_id: eventId === "none" ? null : eventId` (null explícito em vez de undefined).
- Mantém intacta a possibilidade de selecionar evento quando houver.

## Arquivos afetados

- `src/components/vendas/CashClosingDialog.tsx` — reescrito com 3 etapas.
- `src/components/vendas/OpenCashDialog.tsx` — ajuste pequeno no submit.
- Migração SQL — nova RPC `get_session_expected_totals()` + drop da overload antiga de `open_cash_session`.

## Fora do escopo

- Não mexo em quem pode autorizar nem na lógica de `close_cash_blind`.
- Não mexo em PDV nem sangria.

Posso seguir?
