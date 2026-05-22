## Diagnóstico confirmado

O PIX de R$ 2 foi aprovado no Mercado Pago, mas ficou `pending` no app:

- `mp_payment_id`: `159808142013`
- Mercado Pago: `approved / accredited`
- Banco do app: `pix_charges.status = pending`
- Pedido: `lojinha_orders.status = pending`

Isso indica que o webhook não está atualizando a cobrança/pedido. A tela de sucesso depende do pedido virar `paid`, então ela nunca apareceu.

## Plano de correção

### 1. Corrigir agora o pedido pago de R$ 2
- Atualizar a cobrança `159808142013` para `approved`.
- Atualizar o pedido vinculado para `paid`, com `paid_at` e `mp_payment_id`.
- Liberar a reserva de estoque do pedido.
- Isso deve fazer a página do pedido mostrar a tela de pagamento confirmado.

### 2. Criar fallback de conciliação automática na tela do pedido
- No `getPublicPixChargeStatus`, além de ler o banco, consultar o Mercado Pago quando a cobrança ainda estiver `pending`.
- Se o Mercado Pago disser `approved`, aplicar a mesma lógica do webhook:
  - marcar `pix_charges` como `approved`
  - marcar `lojinha_orders` como `paid`
  - gravar `paid_at`
  - liberar reserva
- Assim, mesmo que o webhook falhe, o polling da própria tela confirma o pagamento.

### 3. Corrigir o webhook para pedidos da lojinha
- Extrair a lógica de “pagamento aprovado” para um helper reutilizável, evitando diferença entre webhook e fallback.
- Garantir que o webhook também libere reserva e atualize pedido quando `origin = lojinha`.
- Melhorar logs quando o webhook recebe evento mas não atualiza nenhuma cobrança.

### 4. Aumentar expiração do PIX
- Mudar o padrão de `createMpPixPayment` de 30 minutos para 24 horas, ou definir explicitamente no PIX da lojinha.
- Minha recomendação: **24h para lojinha online** e manter **30min no PDV**, porque PDV é venda presencial.

### 5. Adicionar conciliação manual no admin
- No painel de pedidos/abandonados da lojinha, exibir cobranças pendentes/abandonadas com `mp_payment_id`.
- Adicionar botão “Verificar Mercado Pago”.
- Se o pagamento estiver aprovado no Mercado Pago, liberar botão “Conciliar como pago”.
- Isso resolve casos em que o cliente pagou, saiu da tela, ou o webhook caiu.

### 6. Produtos novos da lojinha
- Ajustar `lojinha_get_storefront`: produtos sem linha em `product_stock` na location da lojinha não devem sumir como estoque zero automaticamente.
- Para produto sem controle real de estoque ou sem registro de estoque, tratar como disponível.
- Manter quantidade real para itens que têm estoque cadastrado.

## Resultado esperado

- O pedido de R$ 2 entra como pago agora.
- Próximos PIX pagos aparecem como sucesso mesmo se o webhook atrasar/falhar.
- Você terá uma tela para reconciliar manualmente pagamentos aprovados no Mercado Pago.
- Produtos novos aparecem na lojinha online quando estiverem marcados como visíveis.