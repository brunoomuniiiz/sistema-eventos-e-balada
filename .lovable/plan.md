## Problema

Hoje, quando você (ou o garçom) clica em **Pix** dentro da Lojinha → aba **Vender**, o sistema:

1. cria o pedido (`lojinha_create_pos_order`) ✅
2. mostra um spinner com texto *"Quando o Mercado Pago estiver conectado, o QR Pix aparece aqui"* ❌
3. **nunca chama o Mercado Pago** — não existe QR pra mostrar.

Só funciona "no manual" via botão *Confirmar pagamento manualmente (teste)*.

No caixa físico (`/vendas`) o Pix funciona porque ele já usa `createPixCharge` (que fala com o Mercado Pago de verdade).

## O que vou fazer

Reusar o mesmo motor de Pix que o caixa físico já usa, dentro da tela "Vender" da Lojinha. Sem mexer em backend novo, sem mexer em RPC, sem mexer em fluxo de cliente final.

### Mudanças (1 arquivo só)

**`src/lojinha/components/LojinhaPosView.tsx`**

1. Quando o garçom clicar em **Pix**:
   - Continua chamando `createPosOrder(...)` pra criar o pedido (`lojinha_orders` com `status = pending`).
   - **Imediatamente depois**, chama `createPixCharge` (servidor → Mercado Pago) com:
     - `amount`: total do pedido
     - `description`: "Lojinha — pedido #N"
     - `origin: "lojinha"`
     - `sector: "lojinha-pdv"`
     - `orderId`: o id do pedido recém-criado
   - Guarda o `qr_code` (copia/cola) e o `qr_code_base64` (imagem) que voltam.

2. Tela de espera (`step = "waiting"`):
   - Mostra a **imagem do QR Code** (do `qr_code_base64`) bem grande pra o cliente apontar a câmera.
   - Mostra o **código Pix copia-e-cola** com botão *Copiar*.
   - Mantém o polling atual em `lojinha_orders.status`. Quando o webhook do MP confirmar o pagamento, o pedido vai pra `paid` automaticamente (já implementado em `mp-webhook.ts`) e a tela troca pra "Entreguei o produto".
   - Mantém o botão *Confirmar pagamento manualmente (teste)* como fallback (útil enquanto testa).

3. Cartão (Point Smart) continua igual ao que já existe — sem mudança.

### Marco zero / como reverter

Antes de tocar no arquivo, esta mensagem fica registrada como ponto de restauração. Se algo der ruim, é só usar o botão de reverter em qualquer mensagem minha posterior — volta exatamente pro estado atual (placeholder do QR + botão manual).

### O que NÃO vai mudar

- Permissões, RLS, tabelas, RPCs — nada.
- Caixa físico (`/vendas`) — segue funcionando igual.
- Lojinha do cliente externo (link público) — segue igual.
- PDV de balcão (`/pdv`) — segue igual.

### Risco

Baixo. O `createPixCharge` já é usado em produção pelo caixa físico há semanas, e o webhook já sabe atualizar `lojinha_orders` quando o `pix_charge.order_id` aponta pra um pedido da Lojinha — esse caminho está pronto e só não estava sendo acionado.

### Pré-requisito

A secret `MP_ACCESS_TOKEN` (Mercado Pago) já precisa estar configurada — ela é a mesma usada hoje no caixa físico. Se o Pix do caixa físico está funcionando, esse aqui também vai funcionar.
