## Diagnóstico

PDV (`src/routes/_app.pdv.tsx`) e Garçom (`src/lojinha/components/LojinhaPosView.tsx`) hoje renderizam os produtos como **cards quadrados em grade de 2 colunas** no mobile (`grid-cols-2`). Você quer o mesmo formato da lojinha pública (`src/routes/loja.$slug.tsx` linha 262): **1 coluna no mobile**, card em linha (foto à esquerda, nome+preço no meio, botão + à direita), mais denso e fácil de tocar com uma mão.

O "rolar pro lado" provavelmente é o usuário escapando do hit-test do card (não overflow real) — mesmo assim, com 1 coluna o problema some.

## O que vai mudar

### 1. PDV — `src/routes/_app.pdv.tsx`

Substituir o card quadrado (linhas ~552-579) por um card em linha estilo lojinha:

- Grid: trocar `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3` por `grid gap-2 sm:grid-cols-2 lg:grid-cols-3`.
- Card vira `<button>` com `p-2 flex gap-3 items-center rounded-xl border ...`:
  - Foto/placeholder `h-14 w-14 sm:h-16 sm:w-16 rounded-lg object-cover shrink-0` (placeholder com ícone `ShoppingBag`/`Layers` quando for combo, ou usar `photo_url` do produto se existir).
  - Bloco central `flex-1 min-w-0`: nome `font-medium text-sm truncate`, preço `text-base font-bold text-gradient`, alerta de estoque baixo `text-[11px] text-amber-500` na mesma região.
  - Lado direito `shrink-0`: badge `inCart.quantity` (igual ao "1, 2…" da lojinha) ou ícone `+` discreto; e badge "Combo" só como `text-[10px]` no rodapé do nome (não absoluto).
- Adicionar `photo_url` à query de produtos do PDV (já existe na tabela, basta incluir no `select`). Sem foto cai no placeholder.
- Manter `active:scale-95` e estados de selecionado (`border-primary bg-primary/10`) e esgotado (`opacity-40`).

### 2. Garçom — `src/lojinha/components/LojinhaPosView.tsx`

Mesma mudança no grid (linha 404) e no card (linhas 405-420):

- Grid: `grid grid-cols-2 sm:grid-cols-3 gap-2` → `grid gap-2 sm:grid-cols-2 lg:grid-cols-3`.
- Card em linha idêntico ao do PDV, aproveitando o `photo_url` que já está na query.
- Manter o FAB do carrinho fixo no rodapé.

### 3. Padding e ar do PDV no mobile (pequeno extra)

- Barra "Caixa aberto" (linha 454): manter mas reduzir `p-3` → `p-2 sm:p-3` e o botão "Sangria" passa a `size="sm" variant="outline"` com label `<span className="sm:hidden">Sangrar</span><span className="hidden sm:inline">Sangria</span>` — só pra dar mais espaço pros cards.
- Busca + chips ficam como estão.

### Fora do escopo (não muda)

- Lógica de venda, sheet de checkout, SplitPaymentEditor, permissões, estoque, RPC — nada disso.
- Apenas a apresentação da lista de produtos do PDV e do Garçom.

## Resultado esperado

- No celular, lista vira coluna única, cada item compacto (~72 px de altura), igual à lojinha pública.
- Em `sm+` continua 2 colunas; em `lg+` 3 colunas (tablet/desktop).
- Mais produtos visíveis na primeira tela, sem rolagem lateral, e botão de adicionar/quantidade alinhado à direita.
