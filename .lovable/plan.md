# Correções: PIX (lojinha) + lixeiras no painel de Pedidos

## 1. Erro "MP error 403: Payer email forbidden"

**Causa:** o Mercado Pago bloqueia cobrança quando o e-mail do pagador é igual (ou pertence) à conta MP do recebedor. Hoje `src/lib/mp.server.ts` usa o e-mail digitado pelo cliente (ou `comprador@nightops.app` como fallback). Quando o dono testa a lojinha logado com o próprio e-mail MP, o PIX dá 403.

**Correção (em `src/lib/mp.server.ts`):**
- Ignorar o e-mail vindo do cliente para a chamada do MP — usar sempre um e-mail "pseudo-anônimo" gerado por pedido: `pix-<orderIdCurto>@nightops.app`.
- Continuar guardando o e-mail real do cliente no `lojinha_orders` (já é separado), só não enviar pro MP.
- Sanitizar: se por algum motivo o e-mail caísse pra um domínio reservado do MP (`@mercadopago`, `@mercadolivre`), também forçar o fallback.

Isso elimina o 403 sem mudar nada no fluxo de checkout do cliente.

## 2. Lixeiras "sumindo" no painel de Pedidos

Hoje em `src/lojinha/components/LojinhaOrdersPanel.tsx`:
- O botão **bulk** ("Limpar TODOS / Excluir todos pendentes") só aparece nos filtros `pending` e `all`. Nas abas "Para entregar" e "Entregues" não existe nenhum botão de limpeza em massa.
- O botão **individual** ("Excluir pedido") existe em cada card, mas fica no rodapé do card — em viewport pequeno (673px) pode estar abaixo da dobra.

**Correção:**
- Mostrar o botão "Limpar TODOS (testes)" em **todas** as abas (não só `all`), mantendo o `AlertDialog` de confirmação dura.
- Manter "Excluir todos pendentes" só na aba Pendentes (faz sentido semântico).
- Subir o botão "Excluir pedido" do card para o **header do card** (ao lado do número do pedido), como ícone-lixeira pequeno, para ficar sempre visível sem precisar rolar.
- Mesma elevação visual no `LojinhaAbandonedPanel` (lixeira no header de cada item) — o bulk "Limpar todos" lá já existe.

## 3. Validação
- Abrir a lojinha como cliente, gerar PIX de teste → confirmar que abre o QR sem 403.
- No painel Vendas → Pedidos, em cada aba (Para entregar / Pendentes / Entregues / Todos) confirmar:
  - lixeira pequena visível no canto superior direito de cada card,
  - botão "Limpar TODOS (testes)" sempre disponível,
  - "Excluir todos pendentes" aparece só em Pendentes.

## Arquivos afetados
- `src/lib/mp.server.ts` — gerar payerEmail anônimo.
- `src/lojinha/components/LojinhaOrdersPanel.tsx` — mover lixeira pro header + bulk em todas as abas.
- `src/lojinha/components/LojinhaAbandonedPanel.tsx` — lixeira no header de cada item.

Sem mudanças de schema/migrations.
