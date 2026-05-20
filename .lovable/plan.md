## Diagnóstico

Pedidos da lojinha são criados (vi 4 pedidos `pending` recentes em `lojinha_orders`), mas **nenhuma cobrança PIX é gravada com `order_id`** — as únicas `pix_charges` recentes são do PDV. Logo, `createPublicPixCharge` está estourando antes de inserir.

Encontrei um bug confirmado executando a função no banco:

```
ERROR: column reference "cart_token" is ambiguous
DETAIL: It could refer to either a PL/pgSQL variable or a table column.
QUERY: DELETE FROM public.lojinha_stock_reservations WHERE cart_token = cart_token
```

A função `lojinha_reserve_for_checkout` declara `cart_token text;` mas o DELETE usa `WHERE cart_token = cart_token`, que o Postgres resolve como `coluna = coluna` (e ainda dá erro de ambiguidade). Isso faz `createPublicPixCharge` falhar logo após inserir o charge — e provavelmente também trava o React (toast some, dialog não abre).

Suspeita secundária: o `INSERT INTO lojinha_stock_reservations` usa `VALUES (..., cart_token, ...)` que pode resolver para o nome da coluna em vez da variável. Vou prefixar a variável para garantir.

## Correção

### 1. Corrigir `lojinha_reserve_for_checkout` (migração)
- Renomear a variável `cart_token` para `v_cart_token` (sem ambiguidade com a coluna).
- Trocar o DELETE e o INSERT para usarem `v_cart_token`.
- Manter o resto da lógica (reservar 5 min só quando a venda zera o estoque, erro "esgotado" quando `available < quantity`).

### 2. Tornar o `createPublicPixCharge` mais resiliente (`src/lib/pix-public.functions.ts`)
- Mover o `lojinha_reserve_for_checkout` para **antes** do `createMpPixPayment` / `insert pix_charges`. Hoje, se a reserva falhar, já criamos cobrança no MP "órfã". A ordem correta é: validar estoque → reservar → criar PIX no MP → gravar charge.
- Em caso de erro do RPC, logar e propagar a mensagem real (já está OK, só confirmar).

### 3. Verificação
- Rodar `SELECT lojinha_reserve_for_checkout('<order-id>')` no banco e confirmar `{"ok": true}`.
- Pedir para você abrir um pedido na lojinha e checar que o QR aparece. Se ainda falhar, capturo o log do worker para isolar o erro do MP.

## Fora do escopo
- Não mexo nas regras de visibilidade/4 switches (já entregues na rodada anterior).
- Não mexo no webhook MP nem na liberação de reserva ao aprovar.
