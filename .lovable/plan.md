# Deixar o app 100% responsivo (mobile / tablet / desktop)

Consigo sim. Vou fazer uma passada sistemática em **todas as rotas e painéis**, sem mudar lógica de negócio — só layout/CSS.

## Escopo (todas as abas)

**Rotas `/_app/*`:**
- `/dashboard`, `/ao-vivo`, `/vendas`, `/pdv`, `/produtos`, `/estoque`
- `/eventos` (lista + detalhe), `/portaria`, `/pedidos-liberar`
- `/financeiro` (Despesas, Investimento, Mensal), `/configuracao`
- `/funcionarios`, `/promoters`, `/lojinha`, `/admin-caixas`, `/bar-settings`

**Rotas públicas:** `/loja/:slug`, `/loja/:slug/pedido/:id`, `/e/:slug`, `/lista/:slug`, `/auth`, `/pdv-cupom/:id`

**Componentes pesados que costumam quebrar:**
- `LiveDashboardPanel`, `QuickConsumacaoCard`, `QuickEventCostCard`, `ConsumacaoLivePanel`
- `SalesHistory`, `LojinhaOrdersPanel`, `LojinhaAbandonedPanel`, `LojinhaPosView`
- `ExpensesTab`, `InvestmentTab`, `SupplierConsumptionSheet`
- `EventCostsManager`, `EventLandingManager`, `EventPromotersManager`
- `TeamPanel`, `PromotersPanel`, `CaixasAdminPanel`, `SellerPermissionsPanel`
- Todos os Dialog/Sheet (formulários do financeiro, PDV, estoque)

## Padrões que vou aplicar

1. **Containers**: `max-w-7xl mx-auto px-4 md:px-8` consistente; remover larguras fixas em `px`.
2. **Grids**: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3/4` em vez de `grid-cols-N` cru. Cards de KPI viram `grid-cols-2 md:grid-cols-4`.
3. **Tabelas grandes** (ranking vendedor, histórico de vendas, consumação, lojinha, financeiro):
   - Wrapper `overflow-x-auto` + `min-w-[640px]` na `<table>`
   - **OU** layout alternativo em mobile: lista de cards (`hidden md:table` + `md:hidden` card list) quando a tabela tem muitas colunas críticas (ex: "Entrada por funcionário", `SalesHistory`, `LojinhaOrdersPanel`).
4. **Headers/Toolbars** com filtros: `flex-wrap gap-2`, selects passam a `w-full sm:w-auto`, botões viram `flex-1 sm:flex-none`.
5. **Dialogs e Sheets**: `max-w-[95vw] sm:max-w-lg`, conteúdo com `max-h-[85vh] overflow-y-auto`, footer sticky em mobile.
6. **Typography**: títulos `text-2xl md:text-3xl`, números grandes `text-3xl md:text-4xl`.
7. **PDV (`/pdv`)**: grid de produtos `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`, carrinho vira drawer em mobile (botão flutuante com badge de itens) e sidebar em `lg+`.
8. **Lojinha cliente** (`/loja/:slug`): grid `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`, carrinho como sheet em mobile.
9. **Sidebar do app**: já tem bottom nav mobile + sidebar desktop — vou só revisar overflow do bottom nav em telas pequenas (≤360px) e o scroll horizontal dos itens.
10. **Inputs de moeda/data**: largura fluida, `inputMode` correto pra abrir teclado numérico no celular.
11. **Imagens**: `w-full h-auto object-cover` + `aspect-*` em produtos/eventos.
12. **Safe-area iOS**: `pb-[env(safe-area-inset-bottom)]` em barras fixas (já feito no AppLayout, vou conferir nos drawers).

## Breakpoints alvo

- **Mobile**: 360–767px (foco principal — é onde os vendedores usam)
- **Tablet**: 768–1023px
- **Desktop**: ≥1024px

## Como vou executar

1. Varrer rota por rota, abrir cada arquivo, aplicar os padrões acima cirurgicamente.
2. Não mexer em RPC, hooks de dados, regras de negócio — só `className` e estrutura JSX quando precisar de layout alternativo mobile/desktop.
3. Conferir no preview em 375px, 768px e 1280px após cada bloco de rotas.

## Entrega em ondas (pra não virar 1 mega-commit)

- **Onda 1**: Shell + telas mais usadas no celular → `/pdv`, `/ao-vivo`, `/vendas`, `/portaria`, `/loja/:slug`
- **Onda 2**: Admin no tablet/desktop → `/dashboard`, `/financeiro`, `/produtos`, `/estoque`, `/eventos`
- **Onda 3**: Config e secundárias → `/configuracao`, `/funcionarios`, `/promoters`, `/lojinha` admin, `/admin-caixas`, dialogs restantes

## Fora do escopo

- Redesign visual (cores, fontes, hierarquia) — só responsividade.
- Mudanças em queries, permissões ou fluxos.

Posso começar pela **Onda 1** assim que aprovar?
