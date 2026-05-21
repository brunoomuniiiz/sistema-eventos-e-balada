## Finalizar fluxo de pedidos com impressão automática

Completar os 2 itens que ficaram pendentes da implementação anterior:

### 1. Detectar se o pedido tem combo
- Em `LojinhaOrdersPanel.tsx`, ao carregar `lojinha_order_items`, fazer join com `products` para pegar `product_type`.
- Marcar o pedido como `hasCombo` se qualquer item for `product_type = 'combo'`.

### 2. Botão dinâmico por pedido
- **Pedido sem combo (só produtos avulsos)**: mostra botão verde **"Entregue"** → marca todas as `lojinha_order_units` como `delivered` + atualiza `lojinha_orders.delivered_at`.
- **Pedido com combo**: mostra status **"Cupom impresso — aguardando QR/código"** + botão secundário **"Reimprimir cupom"**. Entrega só acontece via `LojinhaScanner` (QR ou código de 6 dígitos).

### 3. Impressão automática ao confirmar pagamento
- Em `LojinhaOrdersPanel.tsx`, manter um `Set<string>` em `useRef` com os IDs já impressos (persistido em `localStorage` por sessão do navegador, chave `lojinha-printed-orders`).
- Quando o realtime/refresh entregar um pedido com `status = 'paid'` e `hasCombo = true` e o ID não estiver no Set → chamar `printOrder()` automaticamente e adicionar ao Set.
- Toast informando "Cupom impresso automaticamente — pedido #X".

### 4. Reimpressão manual
- Botão "Reimprimir cupom" sempre disponível em pedidos com combo (status `paid` ou `delivered`), chama o mesmo `printOrder()` já existente em `order-print.ts`.

### Arquivos
- `src/lojinha/components/LojinhaOrdersPanel.tsx` (única mudança real)
- `src/lojinha/api.ts` (incluir `product_type` no retorno de `listOrders`, se ainda não vier)

Sem mudanças de SQL — toda a infra (`pickup_code`, `delivered_at`, scanner) já existe da migration anterior.
