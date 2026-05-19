## Objetivo

1. Tornar a visibilidade na lojinha o **padrão** de todo produto, com toggle rápido na lista de produtos.
2. Produtos sem estoque no local da lojinha **somem automaticamente** do storefront.
3. Storefront público mobile-first: **categorias no topo** (com "Todos" inicial) + **busca por lupa**.

---

## 1. Banco de dados (migração)

- `products.sell_online` → default `true`.
- Backfill: `UPDATE products SET sell_online = true` (todos passam a aparecer; owner desliga manualmente quando precisar).
- Ajustar `lojinha_get_storefront` para:
  - Filtrar `available_qty > 0` (sem estoque = não aparece).
  - Retornar também `category_name` junto de cada produto (pra renderizar abas de categoria sem nova query).
- Nova RPC `lojinha_toggle_sell_online(_product_id uuid)` — flip atômico do flag, respeita RLS de `estoque`.

## 2. Página de produtos (`/_app/produtos`)

- Adicionar **toggle inline "Na lojinha"** em cada card/linha:
  - Ícone `Store` + switch verde/cinza, 1 clique.
  - Tooltip: *"Quando o estoque acabar no local da lojinha, some sozinho do site"*.
- Pequeno contador no topo: *"X de Y produtos na lojinha"*.

## 3. Storefront público (`/loja/$slug`) — mobile-first

Layout reescrito pensando em celular primeiro (viewport ~375px) e escalando bem pra desktop:

- **Header compacto** com nome da loja + cor de destaque (já existe).
- **Barra de busca com lupa** logo abaixo do header:
  - Input com ícone `Search` à esquerda, filtra produtos por nome/descrição em tempo real (client-side).
  - Em mobile: largura total. Em desktop (md+): max-width centralizado.
- **Tabs de categorias horizontais** logo abaixo da busca:
  - Primeira aba sempre **"Todos"** (selecionada por padrão).
  - Demais abas geradas dinamicamente a partir das categorias dos produtos disponíveis.
  - Scroll horizontal em mobile (`overflow-x-auto`, sem barra visível, snap suave).
  - Chips arredondados, cor ativa = `accent_color` da loja.
- **Grid de produtos**:
  - Mobile: 1 coluna (cards full-width, foto à esquerda, info à direita — como está hoje).
  - Tablet (md): 2 colunas.
  - Desktop (lg): 3 colunas.
- **Estado vazio**: quando busca/categoria não retorna nada → mensagem amigável com ícone.
- **Barra inferior fixa do carrinho**: já existe, manter, garantir que não sobrepõe último item (padding-bottom já está em 32).

## 4. PDV do garçom (`LojinhaPosView`)

- Aplicar mesmo padrão: lupa + tabs de categoria + "Todos" inicial (já é mobile-first por natureza). Ajustar pra usar os mesmos dados que o storefront retorna.

## 5. Regras de preço e estoque

- `online_price` continua opcional. Se `NULL`, usa `price` normal.
- Estoque acabou no local da lojinha → produto some automaticamente (regra na RPC, sem precisar de cron).

---

## Arquivos a tocar

- `supabase/migrations/<novo>.sql` — default, backfill, RPC toggle, ajuste `lojinha_get_storefront`.
- `src/lojinha/api.ts` — `toggleProductOnline(productId)` + atualizar tipo `StorefrontProduct` com `category_name`.
- `src/routes/_app.produtos.tsx` — toggle inline + contador.
- `src/routes/loja.$slug.tsx` — reescrever a área de listagem com busca + tabs de categoria + grid responsivo.
- `src/lojinha/components/LojinhaPosView.tsx` — espelhar busca + tabs.

## Fora do escopo

- Ordenação manual de produtos no storefront.
- Edição em massa de preço online.
- Imagens de capa por categoria.