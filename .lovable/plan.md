## Ajustes — PDV, Produtos, Combos e Pagamento Dividido

### 1. Inputs de valor "picados" (decimais)
- Novo `CurrencyInput` (R$): mostra `R$ 0,00`, ao focar com `0` limpa, dígitos viram centavos (25 → R$ 0,25; 2550 → R$ 25,50). Devolve `number`.
- Usar em: cadastro/edição de produto (`price`, `cost_price`), `OpenCashDialog`, `WithdrawalDialog`, `CashClosingDialog`, `ExpenseFormDialog`.

### 2. Combos não têm estoque próprio
Combo é virtual: estoque dele = `min(estoque_componente_i / qty_i)` (já é assim no PDV).

- Forçar `track_stock = false` em todo produto `product_type = 'combo'` (migração + lógica do form esconde a opção).
- `decrement_product_stock`: hoje, se o combo tiver `track_stock=true`, ainda subtrai do `product_stock` do combo. Ajustar para nunca tocar no estoque da linha do próprio combo — só dos componentes. (A função já abate componentes; basta remover o bloco que abate o combo em si.)
- No PDV o badge "Últimas X" / disponibilidade do combo continua vindo de `comboStockMap`.

### 3. Produto desabilitado "por hoje" (mesmo com estoque)
- Adicionar `products.is_available boolean default true` (migração).
- No `/produtos` (catálogo) e no `/estoque`: switch "Disponível para venda" por produto.
- PDV: produto com `is_available=false` desaparece do grid (ou aparece opaco com selo "Indisponível", configurável).
- Se o produto desativado for **componente de algum combo**, ao desativar abre um `AlertDialog`:
  - "Esse item entra em N combos (lista). Desabilitar esses combos também? **Sim / Não**".
  - Sim → marca `is_available=false` nos combos listados; Não → mantém os combos ativos (mas eles vão ficar `min=0` naturalmente quando os componentes zerarem, o que já está correto).

### 4. Produtos "sem poder clicar" hoje
Causa: produto novo com `track_stock=true` sem nenhuma linha em `product_stock` fica como `stockTotal=0` → desabilitado.

- Mudar a regra: produto só fica indisponível quando **existe pelo menos uma linha em `product_stock` para ele** E a soma é `0`. Sem nenhuma linha = tratar como disponível (ainda não foi para nenhum local). Combinada com `is_available`.

### 5. Busca por produto no PDV
- `Input` com lupa acima do grid, filtra por nome (case-insensitive) junto com os chips de categoria.

### 6. Pagamento dividido (entre formas, sem parcelamento de cartão)
Fluxo descrito pelo usuário:

```text
Total: R$ 100,00     [campo focável]
[+ Dinheiro] [+ Débito] [+ Crédito] [+ Pix]

Linhas (lista):
  Dinheiro  R$ 20,00   [x]
  Débito    R$ 40,00   [x]
  Pix       R$ 40,00   [x]

Falta R$ 0,00 → Finalizar
```

- Total começa preenchido com o total do carrinho. Ao clicar em "+ Dinheiro/Débito/Crédito/Pix", a próxima linha já vem com o valor "Falta" preenchido (usuário pode editar em cima — `CurrencyInput` apaga ao focar).
- Indicador dinâmico: "Falta R$ X,XX" ou "Troco R$ X,XX" (quando dinheiro excede e demais já estão exatos).
- Botão "Finalizar" só habilita quando `soma_pagamentos == total` (ou `dinheiro > falta` para troco).
- Esconder "Dinheiro" para vendedor sem `can_sell_cash`.

**Banco**:
- Nova tabela `sale_payments(id, sale_id, user_id, method, amount, created_at)` + RLS espelhando `sales`.
- `sales.payment_method` continua existindo: gravamos a **forma dominante** (maior valor) para não quebrar relatórios atuais e o fechamento por método.
- `close_cash_blind` precisa ler `sale_payments` em vez de só `payment_method` para somar esperado por método. Ajustar a função.
- `SalesHistory` mostra a venda + chips com cada forma e valor.

### 7. Fechamento — bloco de sangrias
- Card "Sangrias da sessão atual" listando cada sangria: valor, **quem fez** (`created_by_name`), **autorizado por** (`authorized_by_name`), data/hora, motivo. Total no rodapé.
- Aparece em `/vendas → Fechamento` e dentro do `CashClosingDialog`.
- Regra "só com senha de autorizado" já está garantida por `register_withdrawal` + `AuthorizationDialog`.

---

### Arquivos
- **Novo**: `src/components/ui/currency-input.tsx`, `src/components/vendas/SessionWithdrawalsCard.tsx`, `src/components/vendas/SplitPaymentEditor.tsx`.
- **Editar**: `src/routes/_app.pdv.tsx`, `src/routes/_app.produtos.tsx`, `src/routes/_app.estoque.tsx`, `src/routes/_app.vendas.tsx`, `OpenCashDialog.tsx`, `WithdrawalDialog.tsx`, `CashClosingDialog.tsx`, `ExpenseFormDialog.tsx`, `SalesHistory.tsx`.
- **Migração**:
  - `products.is_available bool default true`
  - tabela `sale_payments` + RLS
  - `UPDATE products SET track_stock=false WHERE product_type='combo'`
  - reescrita de `close_cash_blind` lendo `sale_payments`
  - ajuste de `decrement_product_stock` (não abater estoque do combo em si)

### Fora de escopo
Portaria, promoters, eventos, financeiro (despesas), autenticação.

**Posso seguir?**