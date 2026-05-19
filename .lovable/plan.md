
## Pix Dinâmico Mercado Pago — Plano

Integração unificada do Pix do Mercado Pago em duas telas (PDV `/vendas` e lojinha `/loja/$slug`), com confirmação via webhook e baixa de estoque automática.

### Pré-requisito (você precisa fazer)

1. Criar conta no Mercado Pago (mercadopago.com.br).
2. Em **Suas integrações → Criar aplicação** (tipo "Pagamentos online" / "Checkout Pro" — qualquer um serve para Pix API).
3. Copiar o **Access Token de produção** (`APP_USR-...`) em *Credenciais de produção*.
4. Quando eu pedir, vou abrir um formulário seguro para você colar `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` (uma string aleatória que eu te ajudo a gerar). A URL do webhook eu te entrego pronta para você colar em *Webhooks → Configurar notificações* no painel MP.

### O que vou construir

**1. Banco (`pix_charges`)** — uma migration nova
- Tabela `pix_charges` com: `id`, `sector` (`bar`/`portaria`/`lojinha`), `origin` (`pdv`/`lojinha`), `order_id` (FK opcional para `orders` da lojinha), `sale_payload` (jsonb com itens/desconto/etc. para o PDV finalizar a venda só após pago), `amount`, `mp_payment_id`, `qr_code` (texto Copia e Cola), `qr_code_base64` (imagem PNG), `status` (`pending`/`approved`/`expired`/`cancelled`), `expires_at`, `paid_at`, `user_id`, `created_at`.
- RLS: dono do bar lê/insere; lojinha cria via server fn (admin client).
- Realtime habilitado em `pix_charges`.
- RPC `finalize_sale_from_pix(charge_id)` que, dentro de uma transação, lê `sale_payload`, chama o fluxo de venda existente (mesmo caminho de `finalize()` do PDV) e baixa estoque. Reaproveita os triggers que já tem (inclusive `enforce_sector_cash_open`).

**2. Backend (TanStack server functions + 1 server route público)**

Arquivos:
- `src/lib/mp.server.ts` — wrapper de `fetch` da API MP (`POST /v1/payments` e `GET /v1/payments/:id`), lendo `MP_ACCESS_TOKEN` de `process.env` dentro de cada chamada.
- `src/lib/pix.functions.ts`:
  - `createPixCharge({ sector, origin, amount, salePayload?, orderId?, description })` — cria pagamento Pix no MP, persiste em `pix_charges`, retorna `{ chargeId, qrCode, qrCodeBase64, expiresAt }`.
  - `getPixChargeStatus({ chargeId })` — fallback "Já paguei": consulta MP, atualiza linha, dispara finalize se aprovado.
  - `cancelPixCharge({ chargeId })` — opcional, marca cancelado.
- `src/routes/api/public/mp-webhook.ts` — server route que o MP chama. Valida assinatura HMAC `x-signature` + `x-request-id` conforme spec MP (usando `MP_WEBHOOK_SECRET`), busca `GET /v1/payments/:id`, se `status=approved` atualiza `pix_charges` e chama a RPC `finalize_sale_from_pix`. Idempotente (no-op se já `approved`).

**3. Frontend**

Componente compartilhado:
- `src/components/pix/PixQrDialog.tsx` — modal centralizado com QR grande (img base64), código Copia e Cola + botão "Copiar", countdown de expiração, spinner "Aguardando pagamento…". Subscreve Realtime em `pix_charges` por `id`. Ao receber `status=approved`: toca som de caixa registradora (asset novo `src/assets/cash-register.mp3` — gero curto via Web Audio fallback se não houver), fecha o modal, dispara callback `onApproved`. Botão "Cancelar".

PDV (`src/routes/_app.pdv.tsx`):
- Em `finalize()`, se método dominante = `pix` e não há divisão em dinheiro: em vez de inserir `sales` direto, monta `salePayload` (mesma estrutura usada hoje), chama `createPixCharge({ sector: 'bar', origin: 'pdv', salePayload, amount: total })` e abre `PixQrDialog`. A venda só é gravada pelo webhook → RPC. Após `onApproved`, mostra toast e limpa carrinho.

Lojinha (`src/routes/loja.$slug.tsx`):
- No checkout Pix substitui o placeholder "em configuração": cria order como hoje (pending) + `createPixCharge({ sector: 'lojinha', origin: 'lojinha', orderId, amount })`. Renderiza inline o `PixQrDialog` (modo embed) com QR, Copia e Cola, countdown. Ao aprovar (webhook), order vira `paid` (já existe `mark_order_paid`), estoque baixa pelos triggers existentes, tela atualiza via Realtime.

### Detalhes técnicos

```text
Vendedor clica Finalizar (Pix)
        │
        ▼
  createPixCharge ──► POST /v1/payments (MP) ──► insert pix_charges (pending)
        │                                              │
        └──► retorna QR + Copia/Cola ─► PixQrDialog ◄──┘ (Realtime subscribe)
                                                       
   MP cobra cliente → notifica:
   POST /api/public/mp-webhook  (HMAC verificado)
        │
        ▼
   GET /v1/payments/:id (confirma approved)
        │
        ▼
   UPDATE pix_charges SET status='approved'
        │
        ▼
   RPC finalize_sale_from_pix → INSERT sales + sale_payments + baixa estoque
        │
        ▼
   Realtime push → Dialog fecha + som "ka-ching"
```

- Segurança webhook: HMAC-SHA256 do template `id:<dataId>;request-id:<reqId>;ts:<ts>;` exigido pelo MP, com timing-safe compare.
- Expiração: padrão 15 min (`date_of_expiration` no payload MP). Job de limpeza opcional depois.
- Bloqueio de caixa: já garantido pelo trigger existente `enforce_sector_cash_open` (vai falhar a `finalize_sale_from_pix` se o caixa não estiver `open` — exibo erro no admin caso aconteça).

### Secrets que vou pedir depois da sua aprovação
- `MP_ACCESS_TOKEN`
- `MP_WEBHOOK_SECRET`

### Arquivos
- novo: migration `pix_charges` + RPC
- novo: `src/lib/mp.server.ts`, `src/lib/pix.functions.ts`
- novo: `src/routes/api/public/mp-webhook.ts`
- novo: `src/components/pix/PixQrDialog.tsx`, `src/hooks/usePixCharge.tsx`
- novo: `src/assets/cash-register.mp3` (asset curto)
- editado: `src/routes/_app.pdv.tsx` (fluxo Pix)
- editado: `src/routes/loja.$slug.tsx` (checkout Pix real)
- editado: `src/lojinha/components/LojinhaSettingsPanel.tsx` (remover aviso "em configuração")

### Fora de escopo (avisa se quiser)
- Cartão / Point Smart (maquininha) — fica para outra rodada
- Conciliação financeira automática no módulo `/financeiro`
- Reembolsos pelo painel
