
# Custo dos drinks no Ao Vivo + Margem Móvel

## Conceito

- No Ao Vivo do evento, owner clica `+1 Orloff`, `+1 Beefeater`, `+1 Fim Rocks`. Cada clique = 1 garrafa fechada aberta para drinks.
- O custo unitário da garrafa (snapshot no momento) é lançado como CMV de drinks **do evento atual** e dá baixa de 1 unidade no estoque da locação do evento.
- Faturamento continua sempre por evento. O CMV bruto por evento pode ser injusto isoladamente (abriu no fim, mal usou) — então a métrica oficial é **margem dos drinks em janela móvel** (últimos N eventos ou últimos 30 dias):
  - Margem % = (Faturamento Drinks − CMV Drinks) / Faturamento Drinks
  - Custo médio por drink = CMV Drinks / nº drinks vendidos
- "Insumos não vendáveis" (Fim Rocks, 51, Gin Beefeater) ficam no catálogo de produtos com flag `não vendável` — não aparecem no PDV, aparecem na grade de insumos do ao vivo e continuam tendo estoque/custo.

## Mudanças de banco

1. `products`
   - `is_sellable boolean default true` — quando `false`, o produto some do PDV e da lojinha, continua no estoque e no painel de insumos.
   - `is_drink_input boolean default false` — atalho que faz o produto aparecer na grade rápida de insumos do Ao Vivo (Orloff, Red Label, Gin, Fim Rocks, 51 ficam pinados).
   - (já existe `cost_price` / preço de custo — usaremos como fonte do snapshot)

2. Nova tabela `event_drink_consumption`
   - `event_id`, `product_id`, `product_name_snapshot`, `unit_cost_snapshot`, `quantity` (default 1), `total_cost`, `stock_location_id`, `created_by`, `created_by_name`, `created_at`.
   - RLS: owner CRUD; vendas/eventos permission = SELECT.
   - Trigger ou RPC `register_drink_consumption(event_id, product_id, qty)`:
     - lê `cost_price` atual
     - insere o registro
     - chama o mesmo caminho de baixa de estoque que combos/vendas já usam (locação do evento)
     - retorna o item criado

3. RPC `get_event_drink_margin(p_event_id uuid, p_window_events int default 4)`
   - Retorna do próprio evento: `revenue_drinks`, `cmv_drinks`, `drinks_qty`, `margin_pct`, `avg_cost_per_drink`.
   - Retorna também janela móvel: mesmos números agregando os últimos N eventos (incluindo o atual) do mesmo owner. Para identificar "venda de drink" usamos `products.category = 'drink'` (ou um flag `is_drink` — confirmar qual já existe; se não houver, adiciono `products.is_drink boolean`).

## UI

1. **`ProductForm`** (catálogo): dois switches novos
   - "Não vendável (insumo)" — esconde do PDV/lojinha.
   - "Insumo de drink (atalho no Ao Vivo)" — pinna na grade rápida.

2. **Novo componente `LiveDrinkCostPanel.tsx`** dentro de `_app.eventos.$eventId.tsx`, visível só para owner, na aba Ao Vivo:
   - Grade de cards dos produtos `is_drink_input = true` com nome + custo unit + botão grande `+1 garrafa`.
   - Busca rápida pra adicionar outro produto pontualmente.
   - Lista cronológica dos lançamentos do evento (produto, hora, quem lançou, custo) com "desfazer" (RPC inverso, devolve estoque) nos últimos 5 minutos.
   - Totalizador: `CMV Drinks deste evento: R$ XXX (Y garrafas)`.

3. **Card "Margem de Drinks" no `EventFinancialsPanel`** (e atalho no financeiro do evento):
   - Toggle: `Este evento` | `Últimos 4 eventos` | `Últimos 30 dias`.
   - Mostra Faturamento, CMV, Margem %, Custo médio/drink, Volume.
   - Texto guia explicando por que a janela móvel é a métrica de referência.

4. **Filtro no PDV**: queries de produtos vendáveis ganham `is_sellable = true` (1 linha em cada listagem do PDV + lojinha).

## Fluxo do owner

1. Cadastra Fim Rocks e 51 cachaça em Produtos com "Não vendável" + "Insumo de drink" + preço de custo.
2. Marca Orloff/Red Label/Beefeater como "Insumo de drink" também (continuam vendáveis).
3. Durante o evento, abre o painel "Custo dos Drinks" e vai clicando `+1` conforme abre as garrafas.
4. No financeiro do evento vê CMV bruto + Margem Móvel — a margem móvel é a referência real.

## Arquivos

**Migração** (1):
- `add_drink_consumption_and_product_flags.sql`: colunas em `products`, tabela `event_drink_consumption` + grants/RLS, RPC `register_drink_consumption`, RPC `undo_drink_consumption`, RPC `get_event_drink_margin`.

**Novos**:
- `src/components/eventos/LiveDrinkCostPanel.tsx`
- `src/components/eventos/DrinkMarginCard.tsx`

**Editar**:
- `src/components/produtos/ProductForm.tsx` (2 switches)
- `src/routes/_app.eventos.$eventId.tsx` (montar os 2 novos componentes, owner-only)
- queries do PDV (`useProducts` / lojinha listagens) — filtrar `is_sellable`
- `EventFinancialsPanel` — incluir `DrinkMarginCard`

## Fora do escopo (intencional)

- Medir ml/fração de garrafa.
- Rateio retroativo entre eventos. A justiça vem da janela móvel, não do rateio.
- Receita de drink (qual garrafa entra em qual drink). Você só registra "abri 1 X" — basta pro objetivo.

## Pergunta final antes de implementar

Para identificar "venda de drink" no faturamento, posso usar a `category` do produto (ex.: categoria chamada "Drinks") ou prefere um flag explícito `products.is_drink boolean`? O flag é mais robusto se você tiver subcategorias; a categoria é mais simples se já existe uma única "Drinks".
