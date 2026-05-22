## Decisão de arquitetura

**Não** criar uma "forma de pagamento" customizada (`consumacao` em `sale_payments`). Forma de pagamento é canal financeiro — usar para algo que não move dinheiro polui todos os relatórios (mix por método, conciliação, sangrias, fechamento de caixa, ranking por vendedor, etc.) e cria muitos `if` espalhados.

**Caminho escolhido: tipo de venda.** A coluna `sales.category` já existe (hoje só `'bar'`). Vamos adicionar `'consumacao'` + `consumacao_target`. A venda fica com `total = 0`, **sem nenhuma linha em `sale_payments`** — então não aparece em nenhum lugar do faturamento, mas os `sale_items` continuam disparando o gatilho de baixa de estoque normalmente.

Vantagens:
- Faturamento bruto, mix por canal, ranking de vendedor, fechamento cego de caixa: **nenhum precisa mudar** (já filtram ou somam por `sale_payments`).
- DRE do evento ganha **uma única consulta** agregando custo das vendas tipo `consumacao` daquele `event_id`.
- Painel ao vivo ganha **uma view por target** sem inventar nada.
- Cupom e baixa de estoque reaproveitam 100% do fluxo do PDV.

## Mudanças no banco

```sql
-- 1) Tipo de venda
ALTER TABLE sales ADD COLUMN consumacao_target text
  CHECK (consumacao_target IN ('banda','dj','seguranca','funcionario','sorteio'));
-- (já existe sales.category; vamos só passar a aceitar 'consumacao')

-- 2) Permissão por funcionário
ALTER TABLE user_roles ADD COLUMN pode_lancar_consumacao boolean NOT NULL DEFAULT false;

-- 3) RPC de leitura para o painel ao vivo + DRE
CREATE FUNCTION get_event_consumacao(_event_id uuid)
  RETURNS jsonb  -- { by_target: [...], items: [...], totals: { cost, retail, qty } }
```

`payment_method` da venda fica como `'dinheiro'` apenas para satisfazer o CHECK existente — mas como não há linha em `sale_payments` e `total = 0`, o registro nunca entra em nenhuma soma de canal.

## Fluxo no PDV

1. Funcionário adiciona produtos normalmente.
2. Na tela do carrinho, se `user_roles.pode_lancar_consumacao = true`, aparece um botão secundário **"Consumação"** ao lado do "Finalizar".
3. Clicou → abre dialog obrigatório **"Para quem é essa consumação?"** com 5 opções (Banda · DJ · Segurança · Funcionário · Sorteio).
4. Confirma → cria `sales(category='consumacao', consumacao_target=<x>, total=0, event_id=<evento ativo>)`, insere `sale_items` (preserva `cost_price_snapshot` e `unit_price` — preço de balcão, para o gerencial enxergar quanto "vale"), **não cria** `sale_payments`. Estoque baixa pelo trigger atual.
5. Imprime cupom marcado como "CONSUMAÇÃO INTERNA — sem valor fiscal" com o destino.

## Painel ao vivo (gerente)

Novo bloco em `LiveDashboardPanel` chamado **"Consumação interna"**, visível só com permissão `vendas`/`financeiro`/owner.

```
Consumação interna · evento "Sextou 23/05"          [+] expandir

  Total: 47 itens · custo R$ 312,40 · balcão R$ 1.820,00

  Por destino
  ─────────────────────────────────
  DJ            8 itens   R$ 56,00   (R$ 360 balcão)
  Banda        15 itens   R$ 98,00   (R$ 540 balcão)
  Segurança    12 itens   R$ 84,00   (R$ 460 balcão)
  Funcionário  10 itens   R$ 64,00   (R$ 380 balcão)
  Sorteio       2 itens   R$ 10,40   (R$  80 balcão)

  Detalhe (expandido)
  20:14  Red Bull        x2  → DJ           custo R$ 9   · balcão R$ 40
  20:32  Red Label dose  x3  → Banda        custo R$ 24  · balcão R$ 90
  ...
```

Atualiza a cada 10s junto com o resto do painel.

## DRE / Fechamento do evento

Em `EventCostsManager` / página de fechamento, somar custo (`SUM(quantity * cost_price_snapshot)`) das vendas tipo `consumacao` desse evento e exibir como **uma linha única** "Consumação" abatendo do lucro. Não vira `event_costs` real — é calculado on-the-fly da venda para evitar duplicidade. Mostra ao lado, em cinza, "valor balcão equivalente: R$ X" para referência.

## Permissões

- `SellerPermissionDialog`: novo toggle "Pode lançar consumação interna" (perto do toggle de crédito promoter).
- `SellerPermissionsPanel.select`: incluir `pode_lancar_consumacao`.
- `usePermissions`: expor `canConsumacao`.
- PDV: botão "Consumação" só renderiza com `canConsumacao && eventId`.
- RLS de `sales`: já cobre INSERT por `has_permission('vendas')`, então fica ok — a checagem do toggle é feita na UI.

## Arquivos afetados

- `supabase/migrations/...` (migration nova)
- `src/components/vendas/SellerPermissionDialog.tsx` (+ toggle)
- `src/components/vendas/SellerPermissionsPanel.tsx` (select)
- `src/hooks/usePermissions.tsx` (`canConsumacao`)
- `src/routes/_app.pdv.tsx` (botão + dialog de target + branch de salvar sem `sale_payments`)
- `src/components/vendas/ConsumacaoDialog.tsx` (novo — escolha do destino)
- `src/components/vendas/ConsumacaoLivePanel.tsx` (novo — bloco do dashboard)
- `src/components/vendas/LiveDashboardPanel.tsx` (renderiza o bloco novo)
- `src/components/financeiro/EventCostsManager.tsx` (linha "Consumação")
- `src/routes/pdv.cupom.$id.tsx` (faixa "CONSUMAÇÃO INTERNA" quando `category='consumacao'`)

## Não-objetivos

- Não vou mudar `sale_payments` nem o CHECK de `payment_method`.
- Não vou criar uma tabela paralela só para consumação — `sales + sale_items` resolvem com 2 colunas novas e ganhamos cupom, estoque e auditoria de graça.
- Não vou criar `event_costs` automáticos para cada consumação (evita inflar custo se alguém também lançar manualmente).
