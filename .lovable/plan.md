## Resumo do que entendi

1. **Reserva = trava de estoque** que aparece tanto pro cliente da lojinha quanto pro garçom no PDV.
2. **Só reserva quando faltam 5 unidades ou menos** de algum produto envolvido. Acima de 5: só atualiza o carrinho local, sem travar.
3. **Combos contam pelos componentes**: combo com 5× Heineken trava as 5 Heinekens — ninguém mais consegue clicar em Heineken ou em outro combo que use Heineken até pagar ou expirar.
4. **Tempo de reserva: 5 minutos.** Sem pagamento em 5 min → pedido vira `abandoned`, estoque volta.
5. **Aba Pedidos do garçom**:
   - Produto **simples** (`product_type='simple'`): botão único **"Entregue"**.
   - Produto **combo** (`product_type='combo'`): imprime cupom físico com nº do pedido + QR + código curto legível pra digitar caso a câmera falhe.
6. **Aba Abandonados** só para owner/gerente, com IDs do Mercado Pago + status do PIX + botão "Marcar como conciliado".
7. **Limpeza:** pedidos `abandoned` com mais de 7 dias são deletados automaticamente.
8. **Bug visual:** `accent_color="0000"` está deixando os produtos da lojinha sem cor / parecendo desabilitados — normalizar pra `#e94560`.

---

## O que vou fazer

### 1) Migração SQL
- Em `lojinha_orders`: adicionar `expires_at`, `reconciled_at`, `reconciled_by`, `reconciled_note`. Permitir `status='abandoned'`. Policy UPDATE pro owner conciliar.
- **`lojinha_reserve_cart_item` (rewrite):** se produto for combo, expande em componentes via `combo_items` (qty × _qty). Para cada componente calcula `available = stock − reserved`. **Só cria reserva se `available ≤ 5`** em algum componente. TTL: 5 min. Retorna `{ok, low_stock, remaining, blocked_by?}`.
- **`lojinha_create_pos_order` / `lojinha_create_order` (ajuste):** converte reservas em `pending` com `expires_at=now()+5min`. Se estoque > 5 e não tinha reserva, cria direto.
- **`expire_pending_lojinha_orders()` + `pg_cron` a cada 1 min:** marca `pending` expirados como `abandoned` e libera reservas; deleta `abandoned` > 7 dias.
- **Fix cor:** `UPDATE lojinha_settings SET accent_color='#e94560' WHERE accent_color !~ '^#[0-9a-fA-F]{6}$'`.

### 2) Lojinha do cliente (`src/routes/loja.$slug.tsx`)
- Normalizar `accent_color` (fallback `#e94560` se inválido).
- Mostrar feedback do reserve: "Só restam X — reservados pra você por 5 min" / "Indisponível agora".

### 3) PDV do garçom (`LojinhaPosView.tsx`)
- Em `addToCart`, chamar `lojinha_reserve_cart_item`.
- Badge "Últimos X — reservado pra você (5 min)" quando `low_stock=true`.
- Se `ok:false`: toast "Esgotado neste momento", não adiciona.

### 4) Aba Pedidos (`LojinhaOrdersPanel.tsx`)
- Filtrar `status NOT IN ('abandoned','cancelled')`.
- Pago aguardando entrega:
  - **Só simples** → botão "Entregue" (chama `confirm_delivery_pos`).
  - **Tem combo** → card "Cupom impresso — aguardando QR" + botão "Reimprimir". Entrega só fecha via `LojinhaScanner` (QR ou código curto digitado).
- Ao virar `paid` com combo: dispara `printReceipt`.

### 5) Nova aba "Abandonados" (`_app.lojinha.tsx` + novo `LojinhaAbandonedPanel.tsx`)
- Visível só para owner/gerente (`isOwner`).
- Lista pedidos `abandoned` com cliente, total, `mp_payment_id`, status do `pix_charges`, criado em, e botão "Marcar como conciliado".

### 6) Cupom impresso (`src/lib/order-print.ts`)
- Mantém o QR. Adiciona código curto de 6 caracteres (derivado do `pickup_token`) abaixo do QR pro garçom digitar se a câmera falhar.
- `LojinhaScanner` já aceita digitação manual.

---

## Arquivos afetados

**SQL:** schema `lojinha_orders`, rewrite `lojinha_reserve_cart_item`, ajuste `lojinha_create_*`, `expire_pending_lojinha_orders()` + cron, fix `accent_color`.

**Frontend:**
- `src/routes/loja.$slug.tsx`
- `src/lojinha/components/LojinhaPosView.tsx`
- `src/lojinha/components/LojinhaOrdersPanel.tsx`
- `src/lojinha/components/LojinhaAbandonedPanel.tsx` (novo)
- `src/routes/_app.lojinha.tsx`
- `src/lib/order-print.ts`
- `src/lojinha/api.ts`

Confirma pra eu implementar?
