
## 1. Botão de simulação de aprovação (sandbox)

Adicionar um botão temporário **`[TESTE] Simular Pagamento Aprovado`** logo abaixo do QR code, em dois lugares:

- `src/components/vendas/PixQrDialog.tsx` (PDV / portaria — fluxo interno)
- `src/routes/loja.$slug.pedido.$orderId.tsx` (lojinha — fluxo cliente final)

Como funciona:
- O botão chama uma nova server function `simulateApproval(chargeId)` em `src/lib/pix.functions.ts`.
- A função roda exatamente a mesma lógica do webhook real:
  - Marca `pix_charges.status = 'approved'`, preenche `paid_at`.
  - Se a cobrança tem `order_id` e `origin = 'lojinha'`, marca `lojinha_orders.status = 'paid'` + `paid_at` (dispara a baixa de estoque/QRs igual ao webhook).
  - Se for venda PDV (`origin = 'pdv'`/`bar`), grava a venda no caixa usando o `salePayload` já armazenado, igual ao webhook faz hoje.
- Frontend: o polling existente detecta `approved` em <3s e fecha o modal / muda a tela para "Pago" automaticamente — nenhuma lógica de UI nova.

Segurança/visibilidade:
- Botão renderizado só quando `import.meta.env.DEV === true` **e** quando o token MP é de teste (prefixo `TEST-`). Em produção some.
- Visual: variante `outline` + `border-dashed` + texto "[TESTE]" para deixar claro que é debug.

## 2. PIX da lojinha não está sendo gerado

Diagnóstico do banco: há 5 pedidos `pending` recentes na `lojinha_orders`, mas **0 registros** em `pix_charges` com `origin='lojinha'`. Ou seja, o cliente até chega na tela do pedido, mas `createPublicPixCharge` falha silenciosamente antes de gravar a cobrança. O usuário vê apenas o toast vermelho "Falha ao gerar PIX" e interpreta como "não consigo entrar no PIX".

Causas mais prováveis (a confirmar invocando a server fn com um `orderId` real durante a implementação):
1. `MP_ACCESS_TOKEN` não está disponível em runtime no Worker (não foi anexado como secret, só como env do front).
2. `createMpPixPayment` recebe `payerEmail = undefined` quando o cliente não preenche e-mail e a API do MP exige e-mail para PIX → 400.
3. O token é `TEST-...` mas a conta MP da loja não está configurada para PIX em sandbox.

Ações:
- Adicionar `console.error` detalhado em `createPublicPixCharge` (mensagem real do MP) para o usuário ver no toast.
- Garantir fallback de `payerEmail` para `test_user_xxx@testuser.com` quando o cliente não informar.
- Verificar o secret `MP_ACCESS_TOKEN` via `secrets--fetch_secrets`; se faltar no runtime, pedir reenvio.

## Fora de escopo
- Implementar refund / cancelamento via botão.
- Mexer no fluxo de assinatura HMAC do webhook real.

## Detalhes técnicos
- Nenhuma migração de banco.
- Tipos: `simulateApproval` valida `{ chargeId: z.string().uuid() }`.
- Mantém compatibilidade com webhook real (mesma função utilitária `applyApproval(charge)` consumida pelo webhook e pelo simulador, para evitar drift).
