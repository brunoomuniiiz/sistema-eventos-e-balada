# PIX no checkout do cliente da Lojinha

Hoje o PIX real (Mercado Pago) só funciona no PDV interno e no PDV de balcão da Lojinha. O cliente final que pede pelo celular (`/loja/:slug`) cai numa tela "Aguardando pagamento" sem QR. Vamos plugar o mesmo fluxo PIX ali.

## Fluxo
1. Cliente monta carrinho em `/loja/:slug` → clica "Finalizar pedido".
2. App cria o pedido (`lojinha_orders`) com status `aguardando_pagamento` e payment_method `pix`.
3. Redireciona para `/loja/:slug/pedido/:orderId`.
4. Nessa página, se status = `aguardando_pagamento` e método = `pix` → gera cobrança PIX automaticamente e mostra QR + copia-e-cola + contador (mesmo `PixQrDialog`, agora como bloco inline na página).
5. Webhook do MP confirma → status do pedido vira `pago` → tela troca pra "Pedido pago, retire no balcão" com os QRs dos itens (que o admin já validou).

## Mudanças técnicas

### Backend
- `src/lib/pix.functions.ts`: 
  - `createPixCharge` aceita chamada sem auth pra origin `lojinha` (cliente não está logado). Hoje exige `requireSupabaseAuth`. Vou:
    - Criar `createPublicPixCharge` (sem auth) que recebe `orderId` + valida que pedido existe, está `aguardando_pagamento`, e usa o owner do pedido.
    - `getPublicPixChargeStatus` (sem auth) só lê status pelo `orderId`.
- `src/routes/api/public/mp-webhook.ts`: além de atualizar `pix_charges`, quando approved e `order_id` setado → atualizar `lojinha_orders.status = 'pago'`.

### Frontend
- `src/routes/loja.$slug.pedido.$orderId.tsx`:
  - Se método = pix e status = aguardando → render inline do QR (extrair conteúdo do `PixQrDialog` num componente reutilizável `PixCheckoutPanel`).
  - Poll a cada 3s usando `getPublicPixChargeStatus`.
- `src/routes/loja.$slug.tsx` (ou onde finaliza pedido do cliente): garantir que o pedido nasce com `payment_method = 'pix'` e redireciona pra página do pedido.

### Banco
- Migration: garantir que `lojinha_orders` tem coluna `payment_method` (provavelmente já tem). Verificar e, se faltar, adicionar.

## Fora de escopo
- Cartão na lojinha (continua "em breve").
- Cobrança parcial / split.
- Refund automático.

## Pra testar
1. Abrir `/loja/:slug` em aba anônima (sem login).
2. Montar carrinho, finalizar.
3. QR aparece — pagar com conta comprador de teste do MP.
4. Tela atualiza sozinha pra "pago".
