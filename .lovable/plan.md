## O que muda no checkout do PDV

### 1. Desconto: valor (R$) **ou** porcentagem (%)
Hoje o input só aceita %. Vou adicionar um **toggle de duas opções** (`%` | `R$`) ao lado do campo. O estado guarda `discountMode: "percent" | "value"` + `discountInput`.

- Em `%`: comportamento atual (limitado por `maxDiscountPercent`).
- Em `R$`: usa `CurrencyInput`, calcula `discountPercent = (valor / subtotal) * 100`, **clampado** ao `maxDiscountPercent` (com toast se o valor digitado exceder o máximo permitido para o usuário). `discount_value` salvo no banco bate exatamente com o digitado.

Cálculo final continua o mesmo: `discount_value` e `discount_percent` são gravados na venda.

### 2. Fluxo de pagamento mobile-first (wizard em 2 telas)
O `SplitPaymentEditor` atual mostra todos os botões e linhas ao mesmo tempo — confuso no celular. Vou trocar pela seguinte UX:

**Tela "resumo" (default, dentro do Sheet do carrinho):**
- Card grande com **Total** e, abaixo, **"Falta R$ X,XX"** (ou "Pago integralmente" / "Troco R$ Y").
- Lista compacta das parcelas já adicionadas (ícone + método + valor + lixeira).
- Um único botão grande: **"Adicionar pagamento"** (só aparece se ainda falta valor).
- Botão final **"Finalizar R$ X"** habilita só quando `isSplitValid`.

**Tela "wizard" (overlay full-screen dentro do Sheet, ocupa toda a área quando aberta):**
- **Passo 1 — Valor:** título "Quanto vai pagar?", `CurrencyInput` enorme (texto 3xl, auto-focus, teclado numérico), pré-preenchido com o `Falta`. Botões "Cancelar" e "Avançar". "Avançar" desabilita se valor ≤ 0.
- **Passo 2 — Forma de pagamento:** título "Como vai pagar R$ X?", **4 botões grandes** (Dinheiro, Débito, Crédito, Pix — Dinheiro escondido se `!canSellCash`), cada um ocupando metade da largura, com ícone grande + label. Tocar no botão **adiciona a linha** e fecha o wizard, voltando à tela resumo.
- Botão "Voltar" no passo 2 retorna ao passo 1 sem perder o valor digitado.

Permite repetir o ciclo até zerar. Toda a interação é vertical, com targets ≥56px de altura — adequado pra polegar.

### Arquivos a editar
- `src/components/vendas/SplitPaymentEditor.tsx` — reescrever para o modelo resumo + wizard interno (estado `wizardStep: null | "amount" | "method"` e `wizardAmount`).
- `src/routes/_app.pdv.tsx` — adicionar toggle `%`/`R$` no bloco de Desconto (linhas 505–529); ajustar `discountPercent`/`discountValue` `useMemo` para suportar os dois modos.

### Fora de escopo
- Mexer no `discount_by`, RLS de desconto, ou regra de `maxDiscountPercent` (continua igual).
- Mudar o fluxo de finalização da venda em si.
- Refatorar a aba de Fechamento ou o `WithdrawalDialog`.

Posso seguir?
