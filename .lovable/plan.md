## O que vou fazer

### 1) Pendentes que ficam para sempre na fila
**Causa:** os pedidos antigos foram criados antes da migration que adicionou `expires_at`, então estão com esse campo `NULL` e o cron não pega.

**Fix:**
- Backfill: para `lojinha_orders` com `status='pending' AND expires_at IS NULL`, definir `expires_at = created_at + 10 min`. O cron (que já roda a cada minuto) vai marcar todos como `abandoned` no próximo ciclo.
- Mudar o prazo padrão de **5 min → 10 min** em todas as funções de criação (PDV garçom, lojinha online, balcão).

### 2) Botão "Marcar como abandonado" no PDV/Garçom
Quando funcionário vê que o cliente desistiu, ele aperta um botão e o pedido vai pra **abandonados** na hora (sem esperar os 10 min).

- Aba **Pendentes** do `LojinhaOrdersPanel`: botão "Cliente abandonou" em cada card.
- Server function `abandonOrder({ orderId })` que: muda status pra `abandoned`, libera reservas de estoque, registra `cancelled_at` e quem cancelou.
- Visível pra qualquer um com permissão `vendas` (garçom, caixa, owner).
- Pedido aparece em **Abandonados** (visível só pro owner/gerente), e é deletado automaticamente após 7 dias (já existe esse cron).

### 3) Histórico vazio
**Causa:** as vendas no `sales` estão sendo gravadas com `employee_id = NULL` (só `employee_name` preenchido). A view `unified_sales_history` usa `employee_id` como `seller_user_id`, então o filtro "só minhas vendas" nunca dá match. Para owner deveria mostrar tudo (não filtra por seller), então:
- Vou verificar a chamada da RPC no front e revalidar `is_owner_of` — se você estiver realmente logado como `happybeer.adm` deveria ver tudo. Vou adicionar logs e um botão "recarregar" pra confirmar.
- Backfill: gravar `employee_id` corretamente nas vendas novas (passar o `auth.uid()` quando o funcionário está logado, ou o id do funcionário selecionado).
- Excluir vendas `cancelled`/`refunded` da view.

### 4) Estorno via Mercado Pago
**Sim, dá** — MP tem API oficial `POST /v1/payments/{id}/refunds` (total ou parcial, até 180 dias após o pagamento).

- Nova server function `refundMpPayment({ orderId | chargeId, amount? })` em `src/lib/pix.functions.ts`:
  - Valida owner + permissão `vendas` (e flag tipo `can_refund` — só owner/gerente).
  - Chama MP com `MP_ACCESS_TOKEN`.
  - Atualiza `lojinha_orders.status = 'refunded'`, salva `refunded_at`, `refund_amount`, `refunded_by`, `refunded_reason`.
- UI no **Histórico**: botão "Estornar" em cada venda paga via PIX/MP. Diálogo de confirmação com motivo e opção de valor parcial.
- Badge "Estornado" no histórico (sai do total de receita).
- Para vendas em **dinheiro/cartão físico não-MP**: botão "Cancelar venda" — não chama MP (não tem o que estornar), só marca como `cancelled`, devolve estoque e registra quem cancelou.

### ❌ O que não dá
- Estornar maquininha física que não é MP (Cielo/Stone): tem que ser pelo app da operadora.
- Estornar PIX recebido fora do MP: sem `payment_id`, não dá pra chamar a API.
- Reembolso depois de 180 dias.

---

## Arquivos / migrations

1. **Migration** (`expires_at` backfill + colunas refund + novas RPCs):
   - `UPDATE lojinha_orders SET expires_at = created_at + interval '10 min' WHERE status='pending' AND expires_at IS NULL`
   - `ALTER TABLE lojinha_orders ADD COLUMN refunded_at, refund_amount, refunded_by, refunded_reason`
   - Idem em `sales` para cancelamento/estorno
   - Trocar `5 min` por `10 min` nas funções `lojinha_create_*_order`
   - RPC `abandon_lojinha_order(_order_id)` com check de permissão
   - Atualizar `unified_sales_history` pra ignorar `refunded`/`cancelled`

2. **Server functions** (`src/lib/pix.functions.ts`, novo `src/lib/orders.functions.ts`):
   - `abandonOrder({ orderId })`
   - `refundMpPayment({ orderId, amount?, reason })`
   - `cancelLocalSale({ saleId, reason })`

3. **UI**:
   - `LojinhaOrdersPanel.tsx`: botão "Cliente abandonou" na aba Pendentes
   - `SalesHistory.tsx`: botões "Estornar" (PIX/MP) e "Cancelar" (dinheiro), badges de status
   - Toast + invalidate cache

---

## Confirmações pra começar

1. **Prazo de 10 min** se aplica a tudo (lojinha online, PDV garçom, balcão) — ok?
2. **Estorno parcial** (input de valor) ou só total por enquanto?
3. Quem pode estornar: **só owner**, ou owner + funcionário com a flag `vendas_fechamento`?