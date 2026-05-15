## 1. Cargos pré-definidos (presets de permissões)

Criar 4 presets aplicados ao convidar funcionário em **Configuração → Funcionários**:

| Cargo | Permissões padrão | Extras |
|---|---|---|
| Caixa Bar | `vendas` | pode abrir caixa, sangria precisa autorização |
| Caixa Portaria | `portaria` | só vê aba Portaria |
| Gerente | `vendas, estoque, eventos, promoters, financeiro, portaria, funcionarios` | `can_authorize=true`, `can_discount=true` |
| Custom | nenhum | usuário marca manualmente |

- Adiciona `<Select>` "Cargo" no formulário de convite — ao trocar, pré-marca os checkboxes (mas continuam editáveis).
- Coluna `role_preset text` em `user_roles` para mostrar o cargo na lista.
- AppLayout já filtra menu por `can(...)`, então o Caixa Portaria automaticamente verá só Portaria.

## 2. Vínculo de evento ao abrir caixa

- `cash_sessions` ganha coluna `event_id uuid`.
- `OpenCashDialog` busca evento(s) com `date::date = today` e status ≠ encerrado:
  - se houver 1 → pré-seleciona, operador confirma data
  - se houver vários → mostra select
  - se nenhum → operador segue sem evento (modo "bar normal")
- `open_cash_session` aceita `_event_id` opcional.
- Vendas feitas durante a sessão herdam `event_id` automaticamente (preencher no insert do PDV a partir da sessão aberta).

## 3. Auto-aviso de evento na hora do start

- Sem cron / sem mudança automática de status.
- Hook global `useEventStartReminder` no `_app` layout:
  - a cada minuto, se há evento com `date <= now()` e `status='upcoming'`, dispara um toast persistente "Evento X começou — abrir agora?" com botão que chama RPC `start_event(_id)` (atualiza status para `live`).
- Adicionar status `'live'` ao filtro de eventos do dia no item 2.

## 4. Bug do combo "sem estoque"

**Causa provável:** o combo é cadastrado com `track_stock=true` (default), mas combos não recebem `product_stock`. Algum ponto do PDV/UI bloqueia a venda como se o **combo** estivesse zerado, ignorando o estoque dos componentes.

**Correções:**
1. Ao salvar produto tipo `combo`, forçar `track_stock = false` (combo nunca tem estoque próprio — quem tem é o componente).
2. Calcular **estoque virtual** do combo no PDV: `min(stock_componente_i / qty_no_combo)` na localização atual. Mostrar isso no card do combo e bloquear se = 0.
3. Garantir que o trigger `decrement_product_stock` decremente os componentes na localização da venda. Se `sales.location_id` vier nulo, cair no `stock_locations.is_default`. Adicionar índice/log para diagnosticar.
4. No editor de combos (`Produtos → Combos`), reforçar que o campo "Quantidade" é por unidade de combo vendida (label + helper text). Já existe; só ficar mais explícito.

## 5. Migrations necessárias

```sql
ALTER TABLE user_roles ADD COLUMN role_preset text;
ALTER TABLE cash_sessions ADD COLUMN event_id uuid;
-- forçar track_stock=false em combos existentes
UPDATE products SET track_stock=false WHERE product_type='combo';
-- nova RPC start_event(_id)
-- atualizar open_cash_session(_opening, _notes, _event_id)
-- atualizar fluxo de inserção de venda no PDV para herdar event_id da sessão
```

## 6. Arquivos afetados

- `src/components/config/TeamPanel.tsx` — select de cargo + presets
- `supabase/functions/invite-staff/index.ts` — aceitar `role_preset`
- `src/components/vendas/OpenCashDialog.tsx` — seletor de evento do dia
- `src/routes/_app.pdv.tsx` — calcular estoque virtual de combo, herdar `event_id` da sessão
- `src/routes/_app.produtos.tsx` — forçar `track_stock=false` em combos
- `src/routes/_app.tsx` (layout) — montar `useEventStartReminder`
- nova migration

Posso seguir com essa implementação?