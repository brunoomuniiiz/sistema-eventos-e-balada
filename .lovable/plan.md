# Plano: Refatoração de Estoque, Visibilidade e Checkout

## 1. Estoque: nunca baixar antes do pagamento + reserva inteligente

**Como está hoje**
- A baixa real (`product_stock.quantity`) já só acontece via trigger `decrement_product_stock` quando a venda é gravada (PDV em dinheiro/cartão) ou via `finalize_sale_from_pix` (webhook MP `approved`). Isso está correto.
- O que dá a sensação de "baixa prematura" é `lojinha_reserve_cart_item`: hoje ele incrementa `lojinha_reserved_qty` **toda vez** que o cliente adiciona ao carrinho — então o produto some da loja antes de pagar.

**Nova regra (sua decisão)**
- Ao adicionar ao carrinho: **não reserva nada**. O estoque continua disponível globalmente para todos os canais.
- A reserva só acontece no momento em que o cliente **gera o PIX** (cria a `pix_charge`) — e somente se for "estoque crítico":
  - Se há **1 unidade restante** (a que o cliente quer): reserva por **5 minutos**, exibe aviso "última unidade — pague em até 5 min ou volta para venda".
  - Se há **2 unidades restantes**: não reserva, mas mostra aviso amarelo "restam só 2 — confirme no balcão antes de pagar".
  - Se há ≥ 3: comportamento normal, sem reserva nem aviso.
- Se o pagamento expirar (timeout do MP ou 5 min sem `approved`): job `lojinha_release_expired_reservations` (já existe) devolve para o estoque global.

**Mudanças técnicas**
- `lojinha_reserve_cart_item`: deixar de reservar no add-to-cart. Manter a função só para uso interno do checkout (ou substituir por `lojinha_reserve_for_checkout(orderId)` chamada dentro de `createPublicPixCharge`).
- `lojinha_get_storefront`: incluir `available_qty` real (sem subtrair reservas, exceto a reserva de checkout) e um campo `low_stock_warning: 'last_one' | 'last_two' | null`.
- `loja.$slug.tsx`: remover chamadas de `reserveCartItem` ao mexer no carrinho. Mostrar badge amarelo "restam só 2" / vermelho "última unidade" no card do produto e no resumo do carrinho.
- `createPublicPixCharge`: tentar reservar a unidade no momento de criar o PIX; se não conseguir (alguém comprou antes), devolver erro claro "produto esgotado, atualize o carrinho".

## 2. Estoque unificado entre PDV, garçom mobile e lojinha pública

**Causa da divergência de combos**
- `lojinha_get_storefront` calcula `available_qty` de combo como `MIN(floor(componente.quantity / ci.quantity))` mas filtra por `location_id = lojinha_settings.stock_location_id`. PDV/garçom usam outra location → números diferentes.

**Ação**
- Criar função SQL única `product_available_qty(product_id, location_id)` que serve combo e simples.
- PDV, garçom mobile (`LojinhaPosView`) e lojinha pública passam a chamá-la.
- Definir explicitamente a `location_id` "de venda": usar a location do caixa aberto quando há sessão; caso contrário, `lojinha_settings.stock_location_id`. (Decisão técnica — se preferir uma location única global para todos, me avise.)

## 3. Visibilidade de produtos por canal

**Migration (`products`)**
- Adicionar 4 colunas `boolean not null default true`:
  - `ativo_geral` (renomeia/substitui `is_available`).
  - `visivel_pdv_caixa`.
  - `visivel_mobile_garcom`.
  - `visivel_lojinha_cliente` (renomeia/substitui `sell_online`).
- Backfill: `ativo_geral := is_available`, `visivel_lojinha_cliente := sell_online`. Mantenho `is_available`/`sell_online` por compatibilidade temporária e removo depois.

**Admin (`_app.produtos.tsx`)**
- Bloco "Visibilidade" no formulário de produto com 4 switches.

**Queries**
- `lojinha_get_storefront`: `WHERE ativo_geral AND visivel_lojinha_cliente`.
- PDV (`_app.pdv.tsx`): filtra por `ativo_geral AND visivel_pdv_caixa`.
- Garçom mobile (`LojinhaPosView`): filtra por `ativo_geral AND visivel_mobile_garcom`.
- `ativo_geral = false` esconde de tudo (inclusive admin de vendas).

## 4. Lojinha pública: só PIX

- Em `loja.$slug.tsx` / `loja.$slug.pedido.$orderId.tsx`: garantir que a UI só oferece PIX. Já está perto disso — vou auditar e remover qualquer botão/menção residual a dinheiro ou cartão.
- Backend não muda (já só cria `pix_charge`).

## Resumo dos avisos no checkout da lojinha

| Estoque restante | Comportamento |
|---|---|
| ≥ 3 | Normal, sem aviso, sem reserva |
| 2 | Aviso amarelo "Restam só 2 — confirme no balcão antes de pagar". Sem reserva |
| 1 | Aviso vermelho "Última unidade". Ao gerar PIX, reserva por 5 min |
| 0 (após reserva de outro) | "Esgotado, atualize o carrinho" |

## Questões abertas

1. **Location única vs por canal?** Posso assumir: PDV/garçom usam a location do caixa aberto; lojinha usa `lojinha_settings.stock_location_id`. OK?
2. **Renomear ou duplicar flags?** Recomendo renomear `is_available → ativo_geral` e `sell_online → visivel_lojinha_cliente` (mais limpo). Confirma?
3. **"Garçom mobile"** = `LojinhaPosView` (POS interno acessado pelos garçons). Confirma?
