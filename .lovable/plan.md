# Plano: combo bloqueado e botão de Sangria

## Problema 1 — Combo "Orloff + Red Bull" aparece sem estoque

Confirmado no banco:
- `orloff` e `red bull` têm `products.stock_quantity = 48` e `track_stock = true`.
- Porém **não existem linhas em `product_stock`** para esses produtos (ainda não foram alocados em nenhum local de estoque).
- Para produtos **simples**, o PDV já trata isso como "sem rastreio efetivo" (regra: só considera "sem estoque" se houver pelo menos uma linha em `product_stock`). Por isso Orloff e Red Bull individualmente continuam vendáveis.
- Para **combos**, a regra atual é `tracked = isCombo` (sempre rastreado). O cálculo virtual `min(stockMap[componente] / qty)` retorna 0 porque `stockMap` está vazio para esses componentes → combo é marcado como sem estoque.

### Correção (em `src/routes/_app.pdv.tsx`)

Aplicar ao combo a mesma regra usada para produtos simples: **só considerar o componente no cálculo se ele tiver linhas em `product_stock` E `track_stock = true`**. Componentes sem rastreio efetivo são tratados como ilimitados.

- Em `comboStockMap`, buscar também `products.track_stock` (já carregado em `products`) e usar `productsWithStockRows` para filtrar componentes.
- Se **nenhum** componente do combo é rastreado efetivamente → combo fica ilimitado (não bloqueia).
- Se **algum** é rastreado → `min(floor(stock / qty))` apenas entre os rastreados.
- Em `tracked` (linha 419), trocar `isCombo || …` por `isCombo ? hasAnyTrackedComponent(p.id) : (p.track_stock && productsWithStockRows.has(p.id))`.

Resultado: combo Orloff+Red Bull volta a aparecer disponível, mesmo sem linhas em `product_stock` (vendedor pode vender; o trigger `decrement_product_stock` continua deduzindo se/quando houver linhas).

## Problema 2 — Como faço a sangria?

O fluxo de sangria já existe, mas hoje o **botão "Sangria"** só aparece na tela **PDV** (Vendas → aba PDV), no card "Caixa aberto", canto direito. Na aba **Fechamento** só aparece a *lista* de sangrias já feitas, sem botão para criar — daí a confusão.

### Correção (em `src/components/vendas/SessionWithdrawalsCard.tsx`)

Adicionar botão **"Nova sangria"** no topo do card, ao lado do total, abrindo o `WithdrawalDialog` existente (já pede valor + motivo + autorização do responsável com e-mail/senha, e desconta apenas do dinheiro em espécie). Após gravar, invalidar `["session-withdrawals", sessionId]` para a lista atualizar.

Nenhuma mudança de banco. Nenhum impacto em permissão (a RPC `register_withdrawal` já exige autorização via `consume_grant` com escopo `withdrawal`).

## Arquivos a editar

- `src/routes/_app.pdv.tsx` — ajustar `comboStockMap` e cálculo de `tracked` para combos.
- `src/components/vendas/SessionWithdrawalsCard.tsx` — adicionar botão "Nova sangria" + `WithdrawalDialog`.

## Fora de escopo

- Não criar linhas em `product_stock` automaticamente para Orloff/Red Bull (isso é decisão do usuário, via tela de Estoque).
- Não mexer em RPC, RLS, fluxo de autorização nem no `decrement_product_stock`.

Posso seguir?
