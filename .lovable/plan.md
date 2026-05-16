# Ajustes — Login, PDV, Estoque, Produtos

## 1. Tirar popup "Abrir evento" no login
- Remover `useEventStartReminder()` de `src/routes/_app.tsx`. Evento é aberto manualmente em `/eventos`.

## 2. Fluxo de login do funcionário (wizard de 2 passos)
Quando o operador entra no `/pdv` sem sessão de caixa aberta, abrir um modal único com 2 etapas:

**Passo 1 — Confirmar evento do dia**
- Busca eventos com `date::date = hoje` e status `upcoming/live/ongoing`.
- Se houver 1 evento: pré-selecionado, operador só clica "Confirmar".
- Se houver vários: select com o do dia já marcado.
- Se não houver nenhum: opção "Sem evento (bar normal)" já marcada.

**Passo 2 — Abrir caixa**
- Se `can_sell_cash = true`: mostra campo "Valor inicial (R$)" obrigatório + observação.
- Se `can_sell_cash = false`: **esconde o campo de valor** e o texto diz "Você não opera dinheiro — caixa abre em R$ 0,00". Botão único "Abrir caixa".
- Em ambos os casos chama `open_cash_session(_opening, _notes, _event_id)`.

Implementado dentro de `OpenCashDialog.tsx` (reaproveita a query de eventos do dia já existente).

## 3. PDV "cego" para o vendedor
Em `src/routes/_app.pdv.tsx`:
- Remover os selects de **Local** e **Evento** do topo (já vêm da sessão).
- Remover badges "X un. aqui" / "X combo(s) possíveis" / "Sem estoque".
- Produto só fica desabilitado (opaco) quando `SUM(product_stock.quantity)` em todos os locais = 0.
- **Aviso discreto** somente quando estoque total ≤ 10: pequeno selo "Últimas {n}". Acima disso, nada.
- Combos: indisponíveis quando `min(stock_componente_i / qty_i) = 0` em todos os locais.

## 4. Estoque — visão do dono (`/estoque`)
- Adicionar cards de resumo no topo: **Total de produtos**, **Total de unidades**, **Sem estoque**, **Estoque baixo (≤10)**.
- Manter coluna "Total" agregando todos os locais na lista.

## 5. Inventário às cegas
- Ao contar, a coluna **Sistema** (`system_qty`) fica escondida por padrão; toggle "Mostrar sistema" só para o dono.
- Input "Contagem" começa vazio (sem default = system_qty).
- Diferença só aparece depois de fechar o inventário (já calculada por `close_inventory`).

## 6. Categorias de produto
**Banco** (migração):
- Tabela `product_categories(id, user_id, name, icon, sort_order, is_default)` com RLS:
  - Manage: `has_permission('estoque')`.
  - Read: `has_permission('vendas')` (PDV filtra).
- Coluna `products.category_id uuid` (nullable, sem FK rígida).
- Função `seed_default_product_categories(_user_id)` → **Combos, Narguilé, Long, Baldes, Não alcoólicos, Variados**.
- Chamada no `handle_new_user` + backfill para owners existentes.

**Produtos** (`_app.produtos.tsx`):
- Nova aba "Categorias": CRUD (criar, renomear, reordenar, apagar → produtos viram `category_id = NULL`).
- Form de produto: Select "Categoria" com "+ Nova categoria" inline.
- Lista mostra a categoria e filtro por categoria.

**PDV**: chips de categorias acima do grid. Produtos sem categoria caem em "Variados" visualmente.

**Vendas** (`_app.vendas.tsx`): bloco "Por categoria" no relatório.

## 7. Tudo editável
Categorias de produto, de despesa fixa/variável e de custo de evento — todas com CRUD. Defaults podem ser renomeadas/apagadas.

---

## Arquivos
- 1 migração SQL nova.
- Editar: `src/routes/_app.tsx`, `src/routes/_app.pdv.tsx`, `src/routes/_app.produtos.tsx`, `src/routes/_app.estoque.tsx`, `src/routes/_app.vendas.tsx`, `src/components/vendas/OpenCashDialog.tsx`.

## Fora de escopo
Portaria, promoters, eventos públicos, autenticação, financeiro.

**Posso seguir?**
