## Problema

No mobile, PDV e Garçom já têm 1 coluna, mas o card ficou esticado: nome curto (ex.: "Heineken") + preço à esquerda, e um espaço enorme até o botão `+` na ponta direita. Visualmente fica "vazio no meio".

A Lojinha Online (`src/routes/loja.$slug.tsx`) já resolveu isso com um layout compacto e equilibrado que o usuário gosta. Vamos espelhar exatamente esse layout.

## Padrão da Lojinha Online (referência)

Card = `<Card>` com `CardContent className="p-3 flex gap-3"`:

1. **Foto** `h-20 w-20 rounded-lg object-cover shrink-0` (fallback: bg-secondary + ícone)
2. **Bloco central `flex-1 min-w-0`**:
   - nome `font-medium truncate`
   - descrição `text-xs text-muted-foreground line-clamp-2` (quando houver)
   - preço `mt-1 font-bold` (cor do accent / `text-primary`)
   - chip de estoque baixo ("Última unidade" / "Restam 2") quando aplicável
3. **Ação à direita `flex flex-col items-center justify-center gap-1 shrink-0`**:
   - Se `inCart === 0` → botão `size="sm"` só com ícone `<Plus />`
   - Se `inCart > 0` → grupo `[-] [qtd] [+]` com botões `size="icon" h-7 w-7`
   - Esgotado → texto "Esgotado"

Isso elimina o espaço vazio (o `flex-1` da coluna central + descrição/preço/chips ocupam o miolo) e mantém o `+` colado na borda direita.

## Mudanças

### 1. `src/routes/_app.pdv.tsx`
Substituir o card atual do PDV pelo padrão acima:
- Manter `grid gap-2 sm:grid-cols-2 lg:grid-cols-3` (continua 1 coluna no mobile).
- Foto `h-20 w-20` (não mais 14/16) com fallback `ImageIcon`/`ShoppingBag`.
- Centro com nome `truncate`, alerta de estoque baixo como chip pill (`bg-amber-500/15 text-amber-600 px-2 py-0.5 rounded-full text-[11px]`), preço `font-bold text-gradient`.
- Direita:
  - Se a quantidade no carrinho do PDV é 0 → botão `size="sm"` com `<Plus />` (clica e adiciona 1, como hoje).
  - Se > 0 → mostrar `[-] [qtd] [+]` com handlers que aumentam/diminuem a quantidade da última linha desse produto no carrinho (mesma lógica que hoje, só muda a UI).
  - Sem estoque → "Esgotado" em destaque (`text-destructive`).
- Preservar `active:scale-[0.98]`, estados de seleção, permissões, lógica de venda/checkout — nada de business logic muda.

### 2. `src/lojinha/components/LojinhaPosView.tsx`
Mesmo padrão exato, com as cores do tema (`text-primary`) em vez do accent dinâmico da loja:
- Grid `grid gap-2 sm:grid-cols-2 lg:grid-cols-3`.
- Mesma estrutura foto 20×20 + centro flex-1 + ação à direita com `+` ou `[-][qtd][+]`.
- Reusar `photo_url` já carregado.

### 3. Sem mudanças em
- Carrinho/checkout sheet
- SplitPaymentEditor, fluxo de pagamento
- Queries, permissões, estoque, sangria
- Header "Caixa aberto" (já compactado na rodada anterior)

## Resultado esperado no mobile (≤640px)
- 1 produto por linha, altura ~92px (foto 80 + padding).
- Foto à esquerda, nome+preço ocupam o miolo (sem espaço vazio).
- `+` colado na direita; ao adicionar, vira `[-] 2 [+]` no mesmo lugar.
- Em `sm` → 2 colunas, em `lg+` → 3 colunas (mantém a melhoria que você aprovou).
