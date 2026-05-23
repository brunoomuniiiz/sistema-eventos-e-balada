## Diagnóstico

O motivo das abas "voltarem grandes" ao clicar é o `CompactTabsTrigger` (em `src/components/ui/compact-tabs.tsx`): hoje a aba **ativa** força o nome completo via `group-data-[state=active]:inline`. Como no mobile só cabem ~3 abas, quando uma vira ativa ela expande e empurra as demais para a 2ª linha / corta — exatamente o efeito de "ficou grande de novo" em Vendas, Produtos, Configuração e na sub-aba "Variáveis" do Financeiro.

A página do evento (`/_app/eventos/$eventId`) não tem abas — o que está "muito grande" é o título (`text-3xl md:text-4xl`), o flyer hero (`md:w-2/5` mas com `aspect-video` largo no mobile) e os paddings (`p-6 md:p-8`).

## O que vai mudar

### 1. `src/components/ui/compact-tabs.tsx` — abas sempre compactas no mobile
- Remover o comportamento de "ativa expande". A regra fica:
  - `< sm`: sempre mostra `short` (se existir); senão mostra `children`.
  - `sm+`: sempre mostra `children`.
- Trocar os spans:
  ```tsx
  {short ? (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{children}</span>
    </>
  ) : <span>{children}</span>}
  ```
- Reduzir o tamanho no mobile: `text-[11px] sm:text-sm`, `px-2 py-1.5 sm:px-2.5`, `min-h-9`.
- Manter `flex-wrap` para garantir que, se mesmo assim não couber, quebra em 2 linhas sem cortar.
- O indicador da ativa continua sendo o `data-[state=active]:bg-background data-[state=active]:shadow` — fica claro qual está selecionada sem precisar do texto inteiro.

Isso resolve sozinho Vendas (PDV/Garçom/Configuração/Histórico), Produtos (Cat./Categ./Estq.), Financeiro (Var.), Configuração, Estoque e Portaria.

### 2. `src/routes/_app.financeiro.tsx` — siglas mais enxutas
- 6 abas em uma linha de 360 px ficam apertadas. Encurtar:
  - "Por evento" → `Eve.`
  - "Bar avulso" → `Bar`
  - "Custos fixos" → `Fixos`
  - "Custos variáveis" → `Var.`
  - "Investimento" → `Inv.`
  - "Mensal" → `Mês`
- Já está assim — só validar; com a correção do item 1 elas param de inflar.
- Trocar o grid de MiniStat de `grid-cols-2 md:grid-cols-3` para `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` (8 cards ficam mais leves no tablet).

### 3. `src/routes/_app.produtos.tsx` — encolher mais um toque
- Sigla "Categorias" passa de `Categ.` para `Cat2` não — manter `Categ.` mas com a fonte menor já fica ok pelo item 1.
- O catálogo (header com botão "Novo produto" + busca + chips de categoria) hoje fica largo demais no mobile. Ajustar:
  - O header de ações vira `flex-col sm:flex-row` com `gap-2`.
  - Os chips de categoria recebem `overflow-x-auto -mx-4 px-4 pb-1 flex-nowrap` para rolar lateralmente sem quebrar o layout.
  - Botão "Comprar" + "Novo produto" passam para `flex-1 sm:flex-none` no mobile.

### 4. `src/routes/_app.eventos.$eventId.tsx` — diminuir hero e títulos no mobile
- Título: `text-2xl sm:text-3xl md:text-4xl` (em vez de `text-3xl md:text-4xl`).
- Hero card: trocar a aspect-ratio do flyer no mobile para `aspect-[4/3]` em vez de `aspect-video`, e reduzir paddings para `p-4 sm:p-6 md:p-8`.
- Linha superior de botões "Eventos / Editar / Excluir": permitir `flex-wrap gap-2` e botões `size="sm"` com labels mais curtos no mobile (`Editar` → ícone só `<Pencil />` em `< sm` via `<span className="hidden sm:inline">`).
- Resumo financeiro (4 cards): trocar `text-lg md:text-xl` para `text-base sm:text-lg md:text-xl` e `p-4` para `p-3 sm:p-4`.
- Form "Faturamento do evento": já é `sm:grid-cols-2`, manter; só reduzir `CardHeader`/`CardTitle` para `text-base sm:text-lg`.

### 5. Sem mudanças em
- Lógica, queries, RLS, RPC, vendas, permissões, banco — nada disso.
- O componente Lojinha (`LojinhaPosView`) — já está bom para o garçom.

## Resultado esperado
- Toda barra de abas no app fica em **uma linha só** no celular de 360 px, mesmo com a aba ativa, e ainda dá pra ver de relance qual está selecionada (fundo + sombra).
- Ao clicar nada "infla", nada quebra de linha por culpa do texto.
- Página de evento e catálogo de produtos ficam confortáveis em telas estreitas.
