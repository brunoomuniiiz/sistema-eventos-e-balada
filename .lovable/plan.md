# Integração PIX — Mercado Pago (modo teste)

Secrets já salvos: `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`.

## O que vou construir

### 1. Backend (TanStack server functions + server route)
- **`src/lib/mp.server.ts`** — helper para chamar a API do MP (`POST /v1/payments`) com `MP_ACCESS_TOKEN`, retorna `qr_code` (copia-e-cola), `qr_code_base64` (imagem), `payment_id` e `expires_at`.
- **`src/lib/pix.functions.ts`** — `createPixCharge({ amount, description, refType: 'venda'|'pedido_loja', refId })` cria registro em `pix_charges` (status `pending`), chama MP, devolve QR pro frontend.
- **`src/lib/pix.functions.ts`** — `getPixChargeStatus({ chargeId })` para polling do frontend enquanto cliente paga.
- **`src/routes/api/public/mp-webhook.ts`** — recebe notificação do MP, valida assinatura via `MP_WEBHOOK_SECRET` (header `x-signature` + `x-request-id`), busca pagamento na API MP, atualiza `pix_charges.status` e dispara confirmação da venda/pedido (baixa estoque, marca pago).

### 2. Banco
Nova tabela `pix_charges`:
- `id`, `mp_payment_id`, `amount`, `status` (`pending|approved|rejected|expired`)
- `ref_type` (`venda` | `pedido_loja`), `ref_id`
- `qr_code`, `qr_code_base64`, `expires_at`, `paid_at`
- RLS: leitura por funcionários autenticados; webhook escreve via `supabaseAdmin`.

### 3. Frontend
- **`PixQrDialog.tsx`** — modal mostra QR (imagem + copia-e-cola + botão copiar), countdown de expiração, faz polling a cada 3s no status; quando `approved`, fecha modal e segue fluxo (imprime comanda / confirma pedido).
- **PDV**: ao escolher forma de pagamento "PIX", em vez de só registrar, abre `PixQrDialog`. Só finaliza venda quando webhook aprovar.
- **Checkout da lojinha**: mesma coisa — cliente vê QR, ao aprovar pedido vai pra status "pago/aguardando preparo".

### 4. URL do webhook (você cola no painel MP)
Depois de implementar, te passo a URL exata no formato:
`https://project--a7bea670-6163-41ba-aa57-6c998ab77578.lovable.app/api/public/mp-webhook`

## Teste
1. Faço uma venda no PDV com PIX
2. Pago com a conta **comprador de teste** do MP
3. Webhook chega → venda fecha sozinha → conferimos no histórico

## Fora de escopo desta etapa
- Cartão de crédito/débito MP (fica pra depois)
- Estorno/cancelamento via API (por ora cancela manual)
- Split de pagamento entre promoters
