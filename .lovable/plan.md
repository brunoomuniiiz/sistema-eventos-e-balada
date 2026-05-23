## Problema

Os cards do PDV/Garçom usam exatamente o mesmo markup da Lojinha Online (`p-3 flex gap-3`, foto `h-20 w-20`, miolo com `flex-1`). Na Lojinha Online o miolo é preenchido por descrição + chips de estoque; no PDV os produtos quase nunca têm descrição, então sobra um vazio enorme entre o preço e o `+`.

## Solução: card menor de 1 coluna

Aplicar nos dois arquivos abaixo o mesmo padrão compacto.

### Estrutura nova do card

```text
┌───────────────────────────────────────┐
│ [📷64]  Heineken                      │
│         R$ 12,00   [-] 2 [+]          │
└───────────────────────────────────────┘
```

- Wrapper: `p-2 flex gap-2 items-center` (era `p-3 gap-3`)
- Foto: `h-14 w-14 rounded-md object-cover shrink-0` (era 20×20)
- Bloco central `flex-1 min-w-0`:
  - nome `text-sm font-medium truncate leading-tight`
  - linha inferior `flex items-center justify-between gap-2 mt-0.5`:
    - preço `text-sm font-bold` (gradient no PDV, primary no Garçom)
    - ação à direita **dentro da mesma linha do preço**, não mais em coluna separada
- Ação:
  - `inCart === 0` → `<Button size="icon" className="h-7 w-7"><Plus className="h-3 w-3"/></Button>`
  - `inCart > 0` → `[-] qtd [+]` com botões `h-7 w-7`, número `w-5 text-center text-sm`
  - PDV sem estoque → "Esgotado" `text-[11px] text-destructive`
  - PDV com pouco estoque → chip pequeno `text-[10px]` ao lado do preço (não em linha separada)

A diferença chave vs. hoje: o `+` deixa de ficar em coluna própria (`shrink-0` no final do flex) e passa para **dentro do bloco central**, na mesma linha do preço, usando `justify-between`. Isso elimina por completo o espaço morto, porque o miolo vira `nome` em cima e `preço ↔ botão` embaixo.

### Grid

Mantém `grid gap-2 sm:grid-cols-2 lg:grid-cols-3` (1 coluna no mobile como você pediu, 2/3 em telas maiores).

Altura do card resultante: ~72px (foto 56 + padding 16).

## Arquivos

### 1. `src/routes/_app.pdv.tsx`
Substituir o card atual pelo padrão acima. Preservar:
- `addToCart`, `updateQty`, lógica de carrinho, permissões, estoque, sangria
- Estado de seleção (borda primary quando `inCart`)
- `active:scale-95` no `+`

### 2. `src/lojinha/components/LojinhaPosView.tsx`
Mesma estrutura, com `text-primary` no preço (sem accent dinâmico).

## Sem mudanças
- Lojinha Online (`src/routes/loja.$slug.tsx`) continua como está — lá o miolo tem descrição e o layout funciona.
- Carrinho/checkout, SplitPaymentEditor, queries, header de caixa aberto.
