## Diagnóstico

Confirmei via banco que o fluxo do cliente NÃO está quebrado no servidor:
- `lojinha_create_order` executa com sucesso (várias ordens `channel=online` criadas hoje às 22:25–22:27).
- Permissões e `gen_random_bytes` já estão OK.
- A função retorna `{order_id, total}` normalmente.

O sintoma "clico em Pagar, nada acontece, não muda de tela" tem causa no **TanStack Router**, não no backend.

### Causa raiz

Arquivos de rota atuais:
- `src/routes/loja.$slug.tsx` → página da vitrine (`StorefrontPage`)
- `src/routes/loja.$slug.pedido.$orderId.tsx` → página do pedido/PIX (`OrderPage`)

No file-based routing do TanStack, pontos criam **aninhamento**. Como `loja.$slug.pedido.$orderId.tsx` começa com o mesmo segmento `loja.$slug`, ele é tratado como rota-filha de `loja.$slug.tsx`. Mas a `StorefrontPage` **não renderiza `<Outlet />`** (é uma página completa, não um layout). Resultado: ao navegar para `/loja/{slug}/pedido/{orderId}`, a rota casa, mas a filha não tem onde montar — a vitrine continua na tela, o cliente vê o carrinho do mesmo jeito e parece que "nada aconteceu". É também por isso que existem várias ordens duplicadas (cliente clica Pagar de novo achando que falhou).

### Correção

Convenção TanStack para opt-out de nesting: sufixo `_` no segmento pai.

- Renomear `src/routes/loja.$slug.pedido.$orderId.tsx` → `src/routes/loja.$slug_.pedido.$orderId.tsx`
- Atualizar dentro do arquivo: `createFileRoute("/loja/$slug/pedido/$orderId")` → `createFileRoute("/loja/$slug_/pedido/$orderId")`
- Atualizar a chamada de `navigate` em `src/routes/loja.$slug.tsx` (linha 123):
  ```ts
  navigate({ to: "/loja/$slug_/pedido/$orderId", params: { slug, orderId: res.order_id } })
  ```
- Atualizar o `<Link to="/loja/$slug" …>` dentro de `loja.$slug_.pedido.$orderId.tsx` (header "Voltar à loja") — esse continua apontando para a vitrine `/loja/$slug`, sem mudança.

O TanStack regenera `routeTree.gen.ts` automaticamente.

### Validação

1. Recriar fluxo como cliente: abrir `/loja/{slug}`, adicionar item, clicar **Pagar** → deve navegar para `/loja/{slug}/pedido/{orderId}` e exibir o QR PIX gerado por `createPublicPixCharge`.
2. Clicar em **Voltar à loja** no cabeçalho do pedido — deve voltar para a vitrine.
3. Conferir no banco que não há nova enxurrada de ordens duplicadas.

### Fora de escopo

- Não mexer em nenhuma função SQL, RLS ou server function — backend está saudável.
- Não alterar a lógica de carrinho, Mercado Pago, ou trigger de daily_number.
- Limpeza opcional das ordens `pending` duplicadas de hoje pode ser feita depois, caso o usuário queira.
