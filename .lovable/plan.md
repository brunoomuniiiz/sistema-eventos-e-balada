## O que encontrei

- A compra de R$ 0,05 criou uma cobrança PIX (`160597013162`) e o app ficou consultando apenas o banco. Como o webhook não atualizou, a tela nunca virou “pagamento confirmado”.
- O fallback que consulta o Mercado Pago direto foi adicionado só no PIX público da lojinha; o PIX autenticado do PDV/garçom ainda não faz essa conciliação automática.
- O pedido conciliado saiu de “Abandonados” porque o painel esconde conciliados por padrão, mas ele não entrou no histórico porque continuou com status `abandoned`. Hoje “Apenas marcar” só marca conferido, não transforma em pago.
- O botão flutuante “Ver como” usa `z-index` alto e fica por cima do carrinho do PDV/garçom.
- A lojinha online voltou a listar os produtos, mas o PIX pode não abrir por erro na criação da cobrança/reserva ou porque a UI só mostra um card genérico, sem detalhe persistente.

## Plano de correção

1. Corrigir confirmação automática do PIX no PDV e no balcão/garçom
   - Atualizar `getPixChargeStatus` para, quando a cobrança estiver `pending`, consultar o Mercado Pago pelo `mp_payment_id`.
   - Se o Mercado Pago retornar aprovado, aplicar a mesma rotina do webhook e devolver `approved` para a tela virar “Pagamento confirmado”.
   - Se retornar rejeitado/cancelado, refletir isso na tela em vez de ficar parado.

2. Ajustar pedidos conciliados para não “sumirem”
   - Separar claramente duas ações em “Abandonados”:
     - “Apenas marcar conferido”: mantém abandonado e só some quando “Ocultar conciliados” estiver ativo.
     - “Conciliar como pago”: só quando o Mercado Pago estiver aprovado, muda o pedido para `paid`, preenche `paid_at/mp_payment_id`, e ele aparece em “Pedidos” e depois no “Histórico”.
   - Corrigir o pedido de R$ 2 já aprovado no Mercado Pago que ficou `abandoned`, mudando para `paid` com o `mp_payment_id` correto para aparecer novamente.

3. Tornar o PIX da lojinha online mais resiliente e visível
   - Mostrar o erro real quando o PIX não abre, com botão “Tentar gerar PIX novamente”.
   - Evitar tela silenciosa caso a cobrança seja criada sem QR/copia-e-cola.
   - Manter a expiração de 24h para pedidos online.

4. Corrigir “Ver como” sobrepondo o carrinho
   - Reposicionar o botão “Ver como” quando houver carrinho aberto/ativo no mobile, ou reduzir sua prioridade visual para não cobrir o checkout.
   - Priorizar o carrinho e botões de cobrança acima do “Ver como”.

5. Verificação final
   - Conferir no banco os pedidos recentes e PIX recentes.
   - Validar que o polling do PIX autenticado agora reconcilia com Mercado Pago.
   - Validar que o pedido conciliado como pago aparece em “Pedidos/Histórico” e que o carrinho não fica atrás do “Ver como”.

## Observação importante

Também recomendo configurar/conferir o webhook do Mercado Pago apontando para `/api/public/mp-webhook`; mesmo com o fallback corrigido, o webhook é o caminho principal para atualizar pagamentos sem depender do usuário manter a tela aberta.