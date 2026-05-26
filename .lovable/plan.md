## Roadmap pra amanhã — 5 blocos pra fechar antes do lançamento

Ordem sugerida: **D → B → C → A → E** (do mais barato pro mais delicado, testando entre blocos).

---

### Bloco A — Pagamentos externos (maquininhas extras + PIX/cartão "manual")

**Objetivo:** PIX dinâmico continua MP; permitir registrar venda em PIX por chave avulsa ou cartão em maquininha de terceiros sem integração.

1. **Schema**
   - Tabela `payment_terminals` (id, user_id, label, kind: `cartao`|`pix_chave`, active).
   - Em `sales` e `pix_charges`: `external_terminal_id` (nullable) + `reconciled` boolean.
2. **UI Configuração** — aba "Pagamentos" (owner-only) com CRUD: nome, tipo, ativa.
3. **PDV / Garçom** — botões "PIX externo (chave)" e "Cartão externo → [maquininha]". Finaliza sem MP, marca `reconciled = false`.
4. **Permissão** — sub-flag `vendas_pagamento_externo` (default false). Toggle opcional "exigir PIN do dono em cada uso".
5. **Histórico / Caixas** — coluna "Conciliado" + filtro "não conciliados" + botão "marcar conciliado".

---

### Bloco B — Fluxo de acesso (tirar "criar conta" público)

**Objetivo:** ninguém se auto-cadastra como funcionário.

1. `/auth` vira só **Login** + **Esqueci a senha**.
2. **Owner inaugural** — definir caminho: landing externa, código de convite ou rota oculta `/signup-owner`.
3. **Convite de funcionário** (`invite-staff` já existe) — owner cria, gera senha temporária, mostra credencial pra copiar. Primeiro login força troca de senha.
4. **Reset de senha** — confirmar `/reset-password` funcional.

---

### Bloco C — Auto-abertura de evento + simplificar portaria/vendas

**Objetivo:** vendedores não escolhem evento. Sistema sabe qual está ativo.

1. **Schema `events`** — `auto_open_minutes_before` (int, default 60), `auto_close_hours_after` (int, default 8).
2. **Abertura automática** — começar pela opção simples (hook checa eventos do dia no load); migrar pra `pg_cron` chamando `/api/public/events-tick` se precisar.
3. **Helper `useActiveEvent()`** — retorna único evento `open` do owner; se houver 2+, retorna `multiple` e UI mostra seletor; senão, fixo.
4. **Portaria** — remover dropdown, mostrar "Entrada para: <nome do evento>" no topo. Bloqueia se nenhum aberto.
5. **Vendas / PDV / consumação** — vincula `event_id` automaticamente via `useActiveEvent()`.
6. **Fallback** — botão "Abrir agora" / "Encerrar agora" mantido atrás de `canEventosAbrirEncerrar`.

---

### Bloco D — Fechar Bloco 4 das permissões (resíduo)

1. **`PromoterCreditPicker`** — método "dinheiro" só se `canPromoterCreditoDinheiro`.
2. **Financeiro (`_app.financeiro.tsx`)** — gating fino:
   - "Lançar despesa" + dialogs → `canFinLancarDespesas`
   - Cards de números → `canFinVerNumeros`
   - "Fechar caixa global" → `canFinFecharCaixa`
3. Conferir que `OpenCashDialog` / `CashClosingDialog` já usam `canAbrirFecharCaixa`.

---

### Bloco E — Ficha de copa imprimível, personalizada por produto

**Objetivo:** quando vende, imprime ficha (QR + nome + qtd) **só dos produtos elegíveis**. Trident/Halls/pirulito não imprimem; cerveja sim. Vale pros 3 canais: caixa fixo, garçom mobile, e copa entregando pedido online.

**Estado atual:**
- `src/lib/order-print.ts` já tem `printReceipt`, `printPrepSlips`, `printUnitTickets` (1 ficha por unidade com QR).
- Garçom (`LojinhaPosView`) já chama `printUnitTickets` ao finalizar — hoje imprime de tudo.
- Copa (`LojinhaOrdersPanel`) já imprime cupom ao entregar.
- PDV caixa abre `/pdv-cupom/{saleId}` que auto-printa o cupom — **não imprime ficha de copa hoje**.
- Impressão é `window.print()` em popup com CSS 80mm — funciona na térmica embutida da maquininha (Cielo Lio, PagBank, Stone) se atendente escolher ela como impressora padrão no navegador.

**Mudanças:**

1. **E.1 Schema** — `ALTER TABLE products ADD COLUMN imprime_ficha_copa boolean NOT NULL DEFAULT true;`
2. **E.2 UI Produto** — checkbox no form ("Imprimir ficha na copa ao vender"). Ícone discreto na listagem quando desligado.
3. **E.3 Caixa fixo passa a imprimir ficha** — em `_app.pdv.tsx`, após finalizar venda: buscar `sale_items` + flag, gerar `unit_tickets` só dos elegíveis. Recomendação: **adaptar `pdv-cupom.$saleId.tsx`** pra renderizar **cupom + N fichas com `page-break`** numa única janela — um `window.print()` cospe tudo.
4. **E.4 Garçom mobile filtra** — `LojinhaPosView`: filtrar `tickets` por `imprime_ficha_copa`. Se 0, pular `printUnitTickets`.
5. **E.5 Copa filtra** — `LojinhaOrdersPanel`: ao "Entregar", trocar `printReceipt` por `printUnitTickets` só dos elegíveis. Se 0 elegíveis, marca entregue sem imprimir.
6. **E.6 Help Card** — em Configuração, instruções pro happybeer: "Como usar a maquininha como impressora — abra NightOps no navegador da maquininha, faça venda teste, escolha impressora interna e 'sempre usar'."

**Fora de escopo:** SDK nativo de maquininha (Cielo LIO, PagBank), reimpressão de ficha individual do histórico.

---

### Pontos a confirmar antes de codar

- **A.2** — maquininhas extras são só "etiqueta" mesmo, sem integração?
- **A.4** — exigir PIN do dono em cada venda externa ou só logar e conferir depois?
- **B.2** — como o primeiro owner se cria? Landing, convite ou rota oculta?
- **C.2** — começar pelo check no app ou já montar cron?
- **C.4** — se 2 eventos abertos ao mesmo tempo, portaria volta a ter dropdown — ok?
- **E.3** — cupom + fichas numa janela só (recomendação) ou separadas?

---

### Ordem proposta

1. **Bloco D** — rapidinho, fecha o que já começamos
2. **Bloco B** — auth, melhor mexer cedo
3. **Bloco C** — auto-evento, UX boa
4. **Bloco A** — pagamentos externos, maior
5. **Bloco E** — fichas de copa, depende de tudo acima estar estável

Testar cada bloco antes do próximo.
