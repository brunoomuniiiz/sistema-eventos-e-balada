## Entendi o fluxo correto

**Um QR por pedido** (não um por bebida). O garçom escaneia → valida tudo de uma vez → pedido vira `delivered` → QR some da tela do cliente. Anti-fraude: token usado uma vez só.

## Diagnóstico do que está quebrado hoje

1. **QR grande (`pickup_token`) não valida**: a RPC `lojinha_validate_qr` só procura em `lojinha_order_units.qr_token`. Quando o garçom escaneia o QR do pedido, retorna `invalid`.
2. **Sem copia-e-cola** no QR grande (fallback pra câmera ruim).
3. **QRs por unidade poluem a tela** e duplicam o conceito — confundem cliente e garçom.

## Mudanças

### 1) Backend — migração SQL
Reescrever `public.lojinha_validate_qr(_token text)` para:
- Procurar primeiro em `lojinha_orders.pickup_token` (com `FOR UPDATE`).
- Se achar: checar permissão `lojinha`, rejeitar se `status` já = `delivered` (retornar `already_delivered` com cliente + horário), senão marcar **todas as unidades** pendentes como `delivered` (com `delivered_by`/`delivered_by_name`/`delivered_at`), marcar o pedido como `delivered`, e **anular o `pickup_token`** (`SET pickup_token = NULL`) para invalidar.
- Retornar `{ok:true, customer_name, product_name: "<N> itens", order_total}`.
- Fallback: se não achar pickup_token, manter o comportamento antigo (procurar em `qr_token` de unidade) por compatibilidade.

### 2) Frontend — `src/routes/loja.$slug_.pedido.$orderId.tsx`
- **Manter só o QR grande do pedido** (`pickup_token`). Remover o bloco `units.map` com QRs por unidade.
- Quando `order.status === 'delivered'` (ou `pickup_token === null`): esconder o QR e mostrar card de confirmação ("Pedido entregue — obrigado!").
- Abaixo do QR grande adicionar:
  - `pickup_token` em fonte mono + botão "Copiar código de retirada" (padrão `navigator.clipboard.writeText` + `toast.success`).
  - Texto: "Câmera do garçom não leu? Toque em 'Copiar código' e peça pra ele colar."
- O polling/realtime já existente (`refetch` em mudanças de `lojinha_orders`) faz o QR sumir automaticamente quando `status` virar `delivered`.

### 3) Frontend — `src/lojinha/components/LojinhaScanner.tsx`
Nenhuma mudança estrutural. Ele já chama `validateQr(token)`; com a RPC nova, o mesmo botão passa a aceitar `pickup_token` colado/escaneado. Só ajustar a mensagem de sucesso para mostrar `customer_name + product_name` (que vai conter "N itens" quando for pedido inteiro).

## Arquivos afetados
- Migração SQL: `public.lojinha_validate_qr`
- `src/routes/loja.$slug_.pedido.$orderId.tsx`
- `src/lojinha/components/LojinhaScanner.tsx` (toast de sucesso apenas)
