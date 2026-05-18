# Lojinha — módulo separado de venda online com QR

Tudo da venda online vive num módulo isolado ("lojinha") para não interferir no PDV, fechamento de caixa, estoque ou financeiro atuais. Para qualquer ajuste futuro, basta dizer "lojinha".

## Isolamento

- **Pasta dedicada** `src/lojinha/` com seus próprios componentes, hooks e helpers.
- **Rotas próprias**:
  - `/loja/$slug` — vitrine pública (cliente)
  - `/loja/$slug/pedido/$id` — tela do pedido pago com QRs
  - `/_app/lojinha` — painel admin (configuração + pedidos + scanner)
  - `/api/public/mp-webhook` — webhook do Mercado Pago
- **Tabelas com prefixo `lojinha_`** (não toca em `products`, `sales`, `cash_sessions`).
- **RPCs com prefixo `lojinha_`**.
- **Permissão nova** `lojinha` em `user_roles.permissions`.

## Dashboard

Novo card "Vendas online" no `/_app/dashboard` mostrando:
- Pedidos pagos hoje (qtd + R$).
- Itens pendentes de retirada.
- Link "Abrir lojinha" → `/_app/lojinha`.

Sem mexer em mais nada do dashboard.

## Fluxo do cliente

1. Acessa `/loja/{slug}` no celular → catálogo (produtos marcados `sell_online`).
2. Monta carrinho → estoque fica **reservado temporariamente** (TTL 15 min).
3. Primeira compra: pede nome + email + WhatsApp (salvo em `localStorage`).
4. Paga via Mercado Pago Checkout Pro (Pix / débito / crédito).
5. Volta para `/loja/{slug}/pedido/{id}` (polling + Realtime).
6. Pago: tela mostra **1 QR por unidade** ("Heineken 600 — 1 de 3"), cada um com status (válido / entregue).

## Fluxo do garçom

1. Aba "Lojinha" no app (requer permissão `lojinha`).
2. Botão grande "Validar QR" → abre câmera (`html5-qrcode`) ou input manual.
3. Ao escanear: mostra produto + cliente. Botão "Entregar" → marca unidade `delivered`, invalida QR. Se já entregue → alerta vermelho.

## Estoque (dois momentos)

- **Reserva no carrinho**: nova coluna `lojinha_reserved_qty` em `product_stock` (não mexe na `reserved_qty` se existir, é coluna própria). RPC libera reservas expiradas antes de cada leitura.
- **Baixa definitiva no pagamento confirmado** (webhook MP):
  - Subtrai de `product_stock.quantity` (combos explodem em componentes, igual PDV).
  - Libera `lojinha_reserved_qty`.
  - Gera `lojinha_order_units` com `qr_token` (24 bytes) por unidade.
  - **Registra a venda em `sales` + `sale_items`** com `category='online'` e `session_id=NULL`, para aparecer no Financeiro sem afetar fechamento de caixa.
- **QR só entrega** — não mexe em estoque.
- Cancelamento/estorno: estorna `product_stock.quantity` e marca pedido `cancelled`.

## Banco (novas tabelas, todas com RLS por `owner_id` e permissão `lojinha`)

- `lojinha_settings(user_id, enabled, slug UNIQUE, stock_location_id, pickup_message, accent_color)`
- `lojinha_orders(id, user_id, customer_name, customer_email, customer_phone, subtotal, total, status, mp_preference_id, mp_payment_id, paid_at, created_at)` — status: `pending|paid|partial|delivered|cancelled|refunded`
- `lojinha_order_items(id, order_id, product_id, product_name_snapshot, unit_price, quantity)`
- `lojinha_order_units(id, order_id, order_item_id, product_id, qr_token UNIQUE, status, delivered_at, delivered_by, delivered_by_name)`
- `lojinha_stock_reservations(id, product_id, location_id, quantity, cart_token, expires_at)`

Alterações mínimas em tabelas existentes:
- `products`: `sell_online boolean DEFAULT false`, `online_price numeric NULL`.
- `product_stock`: `lojinha_reserved_qty integer DEFAULT 0`.
- `sales`: aceitar `category='online'` (string, sem mudar schema se já for texto livre).

RPCs:
- `lojinha_get_storefront(_slug)` — público.
- `lojinha_reserve_cart_item(_cart_token, _product_id, _qty)` — público.
- `lojinha_release_expired_reservations()` — chamada lazy.
- `lojinha_create_order(_cart_token, _customer, _items)` — público, cria `pending`.
- `lojinha_confirm_payment(_order_id, _mp_payment_id)` — chamada pelo webhook (admin client).
- `lojinha_validate_qr(_token)` — autenticada com permissão `lojinha`.

## Pagamento

- Secret: `MERCADO_PAGO_ACCESS_TOKEN` (te peço depois da migração).
- Server fn `lojinha.createMpPreference` monta Checkout Pro com `external_reference=order.id` e `notification_url` apontando ao webhook.
- Server route `/api/public/mp-webhook` valida via API do MP pelo `payment_id` e chama `lojinha_confirm_payment` com `supabaseAdmin`.

## Painel admin (`/_app/lojinha`)

- **Configuração**: liga/desliga loja, define slug, escolhe localização de estoque, mensagem de retirada, cor de destaque.
- **Produtos**: na tela de Produtos atual, adiciono toggle "Vender online" + campo `online_price`. (única alteração em tela existente — bem pequena.)
- **Pedidos**: lista com filtros (pago, pendente entrega, entregue, cancelado), valor, tempo desde pagamento.
- **Scanner**: tela full-screen com câmera + input manual.

## Bibliotecas

- `html5-qrcode` (scanner)
- `qrcode.react` (renderiza QR)

## Fora do escopo

- Envio do QR/nota por WhatsApp (próxima rodada).
- Cupons online.
- Refund pelo painel (manual no MP por ora).

## Ordem de implementação

1. Migração SQL + permissão `lojinha`.
2. Toggle "Vender online" em Produtos + tela de configuração da loja.
3. Vitrine pública + carrinho + reserva temporária + tela do cliente.
4. Mercado Pago (preference + webhook + tela de pedido com QRs).
5. Painel `/_app/lojinha` + scanner.
6. Card "Vendas online" no dashboard.

Posso seguir? Primeiro passo: rodo a migração e te peço o `MERCADO_PAGO_ACCESS_TOKEN`.