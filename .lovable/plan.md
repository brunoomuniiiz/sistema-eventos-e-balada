## Como está hoje cada tela de produto

| Tela | Layout do card | Grid |
|---|---|---|
| **Loja pública** (`loja.$slug.tsx` — o que o cliente vê) | Card horizontal: foto 80×80 à esquerda, nome + descrição + preço no meio, botão +/− à direita. Encaixa porque é **1 coluna no mobile**. | `1 col` mobile · `2 col` sm · `3 col` lg |
| **Lojinha vendedor** (`LojinhaPosView`) | Já vertical compacto (foto em cima, nome embaixo). | `2 col` mobile · `3 col` md · `4 col` lg |
| **PDV** (`_app.pdv.tsx`) | Linha horizontal espremida (foto + nome + preço + +/− tudo na mesma linha). | `1 col` mobile · `2 col` sm · `3 col` lg |

O PDV estoura porque tenta espremer **5 elementos numa linha só** dentro de uma coluna larga. A loja pública não estoura porque o card é parecido mas fica **uma única coluna** no celular, então sobra largura.

## Sua sugestão: usar o modelo da loja pública em todo lugar

Faz total sentido — é o card mais "respirado", mostra foto grande, descrição, preço com destaque e botão +/− confortável. Vou padronizar nesse formato.

### Componente único `ProductCard`

Crio `src/components/sales/ProductCard.tsx` reaproveitando exatamente o desenho da loja pública (foto 80×80, info ao meio, +/− à direita, badges "Esgotado/Última unidade/Restam N"). Props:

- `product` (id, name, photo_url, price, description?)
- `inCartQty: number`
- `stockStatus: "ok" | "low" | "last" | "out"`
- `accentColor?: string` (loja pública passa o accent do bar; PDV/garçom usam `primary` do tema)
- `badge?: ReactNode` (PDV usa pra mostrar "C" de combo)
- `onAdd`, `onInc`, `onDec`

### Onde aplicar

1. **PDV (`_app.pdv.tsx`)** — substitui o `<button>` atual pelo `ProductCard`. Grid passa para `1 col` mobile · `2 col` sm · `3 col` lg (idêntico à loja pública). Mantém todos os filtros e a lógica de combo/estoque virtual.
2. **Lojinha vendedor (`LojinhaPosView.tsx`)** — substitui o card vertical compacto atual pelo mesmo `ProductCard`. Vira o mesmo visual que o vendedor já conhece da loja pública (afinal ele lança pelo mesmo cardápio).
3. **Loja pública (`loja.$slug.tsx`)** — refatora para usar o mesmo `ProductCard` (sem mudança visual, só extração).

Assim os três cardápios viram **o mesmo card e o mesmo grid**, e qualquer ajuste futuro acontece em um único lugar.

### Bug paralelo: "Vender (garçom)" sem produtos

A query do `LojinhaPosView` exige `lojinhaCanSell` no `enabled`. Quando você abre a aba **"Vender (garçom)"** (que já é protegida por `canVenderGarcom` na rota), o gate duplicado pode esconder o cardápio para personas garçom no ViewAs. Corrijo trocando o `enabled` para `!!ownerId` e atualizando o early-return para considerar `canVenderGarcom`. Sem isso, mesmo com o card novo o garçom continua vendo tela vazia.

Confirmei no banco: as 39 linhas de `products` estão com `disponivel_venda = true` e `ativo_geral = true` — os dados estão corretos, é só o gate do front.

## Fora de escopo

- Não mexo em RLS, estorno, PIN, eventos, portaria, promoters.
- Não mexo nas flags `sell_online` / `disponivel_venda` (já estão certas no banco).
- Não mexo no carrinho/checkout das três telas — só o card de produto.

Pode prosseguir nesse formato (criar `ProductCard` único e aplicar nas três telas + destravar a query do garçom)?