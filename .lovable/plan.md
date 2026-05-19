## Decisão: estoque único por bar

Acabamos com a ideia de múltiplos locais. Cada owner passa a ter **um único `stock_location`** ("Estoque"). Lojinha, PDV e inventário leem/escrevem nesse local sempre. Some o seletor de local da UI.

## Migração de dados (idempotente, por owner)

Para cada `user_id` em `stock_locations`:
1. Escolher um local "canônico" — o mais antigo (`MIN(created_at)`); renomear para "Estoque".
2. `UPDATE product_stock` consolidar: somar `quantity` e `lojinha_reserved_qty` de todos os locais do owner no canônico. Inserir linha para produtos que só existiam nos outros locais.
3. `UPDATE sales SET location_id = canônico` para todas vendas desse owner.
4. `UPDATE lojinha_settings SET stock_location_id = canônico`.
5. `UPDATE stock_inventories SET location_id = canônico`.
6. `UPDATE lojinha_stock_reservations SET location_id = canônico`.
7. `DELETE FROM product_stock` das linhas dos locais não-canônicos.
8. `DELETE FROM stock_locations` dos não-canônicos.

Resultado: cada owner fica com 1 só local, com soma de todos os estoques.

## Schema / RPCs

- **Não removo** a coluna `location_id` (mantém histórico em sales/inventários). Apenas paro de oferecer escolha.
- **`lojinha_get_storefront`**: recriar para listar **todos** produtos com `sell_online = true`, e calcular `available_qty`:
  - Produto simples (`track_stock = true`): `product_stock.quantity − lojinha_reserved_qty` no único local do owner.
  - Produto simples sem track_stock: `available_qty = 9999` (sempre disponível).
  - Combo (`product_type = 'combo'`): `MIN(floor(componente.quantity / item.quantity))` sobre `combo_items`. Se sem componentes definidos, `0`.
- Não filtrar por estoque — esgotados aparecem com badge "Esgotado".

## UI

- **`src/lojinha/components/LojinhaSettingsPanel.tsx`**: remover o seletor "Local da lojinha". Mostrar apenas "Estoque: <nome do local>" como info (ou esconder a linha).
- **`src/routes/_app.estoque.tsx`**: remover abas/seleção de local; sempre opera no único local. Esconder gestão de locais.
- **`src/routes/_app.pdv.tsx`**: remover seletor de local; usa o único do owner.
- **`src/routes/loja.$slug.tsx`** e **`LojinhaPosView.tsx`**: produto esgotado fica visível com opacidade reduzida + "Esgotado" + botão desabilitado. Ordenar disponíveis primeiro.

## Checkout — copy sobre cookies

Acima dos campos do `Sheet` de finalização adicionar:
> "Preencha só na primeira compra — salvamos no seu navegador para a próxima ser num toque. Para apagar, limpe os cookies deste site."

## Redirect pós-login por permissão (`src/routes/index.tsx`)

1. Owner → `/dashboard`.
2. `can("vendas")` → `/pdv`.
3. `lojinhaCanSell` ou `can("lojinha")` → `/lojinha`.
4. Senão, primeira permissão: `portaria → /portaria`, `estoque → /estoque`, `eventos → /eventos`, `financeiro → /financeiro`, `funcionarios → /funcionarios`, `promoters → /promoters`.
5. Fallback `/dashboard`.

## Arquivos a tocar

- `supabase/migrations/<nova>.sql` — consolidação + nova `lojinha_get_storefront`.
- `src/lojinha/components/LojinhaSettingsPanel.tsx`
- `src/routes/_app.estoque.tsx`
- `src/routes/_app.pdv.tsx`
- `src/routes/loja.$slug.tsx`
- `src/lojinha/components/LojinhaPosView.tsx`
- `src/routes/index.tsx`

## Fora do escopo

- Reintroduzir multi-estoque depois (se mudar de ideia, recriamos locais e a coluna continua lá).
- Reservar combos com explosão de componentes no carrinho online — combo aparece, mas a reserva continua tentando subtrair como item; ajuste fino fica para próxima.