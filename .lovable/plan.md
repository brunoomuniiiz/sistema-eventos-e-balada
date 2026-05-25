## O que entendi dos 4 pontos

1. **Deslogar o PIN.** Hoje o PIN destrava só a aba Histórico/Relatório da Portaria e fica vivo só naquela tela. Quando você navega para outro setor (Vendas), continua "destravado" porque o PIN é guardado em estado React local. Você quer poder **sair do modo PIN** sem fechar o app, para que o porteiro/garçom não veja o histórico depois de você sair.
2. **PDV / Caixa.** No "Histórico" da aba Vendas só aparece **Estornar** para pedidos do Mercado Pago e **Cancelar** (total, sem dinheiro) para vendas presenciais. Você quer o mesmo motor da Portaria: ver detalhes da venda, estornar **total** ou **parcial por valor**, com o PIN.
3. **Produtos no garçom (Vender) vs. Lojinha online.** Hoje cada canal usa uma flag diferente do produto: `visivel_pdv_caixa` (PDV), `visivel_mobile_garcom` (garçom), `sell_online` (loja online). Resultado: o garçom não enxerga produtos que vão para a loja online, e vice-versa — o cardápio fica "rachado".
4. **Layout mobile.** Os cards de produto no PDV/Garçom estouram a tela em 360–414px (foto + nome + preço + botão tudo na mesma linha) e ocupam muito espaço vertical.

## O que vou construir

### 1. Sessão PIN global + botão "Sair do PIN"

- Criar um contexto único `OperationPinContext` (provider em `_app.tsx`).
  - Estado: `unlockedUntil` (timestamp) + `token`, persistido em `sessionStorage` para sobreviver à navegação entre Portaria/Vendas/etc., mas **não** entre abas/recargas longas.
  - Expira sozinho em **15 minutos de inatividade** (timer resetado a cada uso).
  - API: `isUnlocked()`, `requestUnlock(scope)`, `lock()`.
- Botão **"Sair do modo PIN"** (ícone de cadeado) no `AppLayout` (header/menu), só aparece quando destravado. Confirma com um toast simples.
- Portaria/PDV/Garçom passam a usar esse contexto único — não recriam estado local.

### 2. Histórico unificado com estorno parcial (PDV + Garçom + Lojinha)

- Refatoro o `SalesHistory.tsx` para usar o mesmo padrão da Portaria:
  - Linha clicável abre um `SaleDetailSheet` (reaproveitando o componente da Portaria, generalizado para `sales`/`lojinha_orders`).
  - Dentro do sheet: botões **Estornar tudo** e **Estornar parcial (valor livre)**, ambos exigindo PIN.
- Backend:
  - Nova função RPC `refund_pdv_sale(_sale_id, _amount, _reason)` espelhando a `refund_event_sale` (zera ou gera venda negativa, registra `cash_withdrawals` tipo `refund`, devolve estoque proporcionalmente).
  - Para pedidos Mercado Pago (online/garçom Pix), continua usando `refund_lojinha_order` (que já faz estorno parcial no MP), só passa a exigir PIN no front.
- Tudo gated pelo `OperationPinContext` — o `SalesHistory` mostra a aba "trancada" igual a Portaria quando não há PIN.

### 3. Unificar produtos vendáveis (PDV ↔ Garçom ↔ Lojinha)

Hoje o vendedor/garçom vê um cardápio diferente do PDV. Proposta:

- **Reduzir as 3 flags a 2:** `ativo_geral` (existir) + `disponivel_venda` (vende em qualquer canal interno: PDV, garçom, lojinha online).
- A flag `sell_online` continua existindo, mas vira apenas "mostrar na loja online pública" (catálogo do cliente final). Garçom/PDV passam a usar `disponivel_venda`.
- Migração: copia `visivel_pdv_caixa OR visivel_mobile_garcom` para `disponivel_venda` em todos os produtos, mantendo `sell_online` como está.
- Tela de Produtos: dois toggles claros — "Vender no balcão/garçom" e "Mostrar na loja online".
- Garçom passa a oferecer Pix exatamente como combinado (já tem `lojinha_payment_methods` com `pix`).

### 4. Layout mobile dos cards de produto

- Card mais compacto: foto pequena à esquerda, nome em 2 linhas (truncado), preço embaixo do nome, botão +/- na direita — tudo dentro de 56–64 px de altura.
- Grid passa a `grid-cols-2` no mobile (em vez de cards "wide" que estouram), `grid-cols-3` no tablet, `grid-cols-4` no desktop.
- Aplicado tanto no `PdvView` quanto no `LojinhaPosView` (mesmo componente `ProductTile`).

## Detalhes técnicos

- **PIN session:** `sessionStorage` + `BroadcastChannel` opcional para sincronizar entre abas; auto-lock por `setTimeout` resetado a cada `useUnlocked()`.
- **`refund_pdv_sale`** roda como SECURITY DEFINER, valida ownership, e em estorno parcial:
  - cria `sales` nova com `total = -amount`, `category = 'estorno'`, `parent_sale_id` apontando pra original;
  - **não** mexe em estoque (parcial é só dinheiro);
  - estorno total = devolve estoque + marca original como `cancelled`.
- **Migração de produtos** é one-shot, idempotente; mantém compatibilidade lendo a nova coluna no PDV/Garçom.
- **SaleDetailSheet** generalizado: aceita `source: 'portaria' | 'pdv' | 'lojinha'` e injeta a RPC certa.
- Nenhuma mudança em RLS/permissões — o PIN só destrava UI; o backend continua confiando em `auth_grants` + ownership.

## Fora de escopo (deixo para depois)

- Listar produtos por categoria/ordem custom no garçom (só ordeno por `name`).
- Mexer no fluxo PIX da loja online pública (continua igual).
- Mudar nada em Eventos/Promoters.

Quer que eu prossiga com tudo, ou prefere fatiar (ex: começar só pelo "deslogar PIN" + "estorno no PDV" e deixar a unificação de produtos para um segundo passo)?
