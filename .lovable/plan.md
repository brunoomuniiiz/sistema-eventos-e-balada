## Resumo do que vamos fazer

Tudo na aba **Financeiro** + um ajuste pequeno no **Custos rápidos do evento (Ao Vivo)** pra resolver o caso do "som".

---

## 1. Forma de pagamento ganha "A pagar"

No form de nova despesa (`ExpenseFormDialog`), a opção **"A pagar"** entra como forma de pagamento. Quando escolhida:
- a conta nasce com `paid = false`
- aparece com o círculo vermelho na lista, pronto pra abrir o dialog de "Registrar pagamento"
- os campos "data de pagamento" e "valor pago" somem do form (irrelevantes)

## 2. CurrencyInput com select-all

Hoje, clicar em cima de "R$ 370" coloca o cursor no meio e bagunça. Vou ajustar o `CurrencyInput` pra **selecionar tudo no focus** (`onFocus={e => e.target.select()}`). Aplica em todos os lugares do app (despesa, pagamento, retirada, etc) — você digita "400" e substitui direto.

## 3. Categoria padrão "Bazar e limpeza"

Adicionar como categoria fixa padrão (papelaria, copos, bobinas, produtos de limpeza). Mesmo com valor variando, fica em **Custos fixos** porque é recorrente todo mês.

## 4. Parcelado (12x do som, do bar, etc)

Nova aba no form: **Uma vez · Mensal fixo · Parcelado**.

Em **Parcelado** você informa:
- Total de parcelas (ex: 12)
- Valor da parcela (ex: R$ 3.000)
- Mês da 1ª parcela (compet.)
- Dia do vencimento
- Categoria + descrição ("Som JBL")
- Checkbox **"Isso é investimento (não afeta lucro do mês)"**

Ao salvar, **cria as 12 contas de uma vez** com status "a pagar", cada uma com sua competência (jan, fev… dez) e descrição "Som JBL · 1/12, 2/12, …". Você pode editar/excluir parcela individual depois.

Na lista, parcelas aparecem com badge `3/12` e link "ver todas as parcelas deste compromisso".

## 5. Investimento (vira lucro quando acabar)

Despesas marcadas como **investimento**:
- não entram no cálculo de "Lucro líquido do mês"
- aparecem num card separado **"Investimentos pagos (mês)"** no topo do Financeiro
- quando as 12 parcelas acabam, simplesmente param de aparecer → seu lucro mensal sobe naturalmente sem precisar mexer em nada

Tecnicamente: nova coluna `is_investment boolean` em `bar_expenses`.

## 6. Abate do consumo do "cara do som"

O fluxo que você descreveu é o mais limpo. Vou implementar assim:

**Na aba Ao Vivo → card "Custo rápido do evento":**

Hoje já tem o `QuickEventCostCard`. Vou adicionar um botão extra ao lado: **"+ Consumo de fornecedor / cortesia"**. Ele abre um sheet com:

1. **Para quem?** (campo livre: "Cara do som JBL" — ou linkar com uma parcela existente em aberto)
2. **Buscar produtos** (lupa igual PDV) → adiciona itens com qtd
3. Calcula automático **valor de venda total** (ex: R$ 800)
4. Botão **"Lançar"** faz 3 coisas em uma transação:
   - **Baixa estoque** dos produtos no local do evento
   - **Cria uma venda** (`sales`) marcada como `category = 'cortesia_fornecedor'`, paga, vinculada ao evento → entra no faturamento normalmente, gera CMV correto, margem correta
   - **Cria um `event_cost`** no evento com descrição "Consumo cara do som — abate parcela" no valor de R$ 800 (sinal positivo, é custo do evento)

**Resultado no relatório da festa:**
- Faturamento bar: + R$ 800 (preço de venda)
- CMV: + custo dos produtos
- Custo do evento: + R$ 800 (o abate)
- Lucro líquido da festa: ganha só a **margem** dos 800 (que é exatamente o "lucro" real da operação, como você falou)

**Resultado na parcela do som:**
A parcela continua com valor original R$ 3.000. Quando você for **pagar** essa parcela, o dialog "Registrar pagamento" mostra:
> *"Esta parcela tem R$ 800 em consumo de fornecedor abatido este mês. Pagar R$ 2.200?"*

Você confirma e ele registra `paid_amount = 2.200`, mostrando na lista "Original R$ 3.000 · abatido R$ 800 · pago R$ 2.200".

Para isso preciso de uma forma de **linkar o consumo à parcela**: no sheet de "Consumo de fornecedor", se já existe parcela em aberto pro mesmo "fornecedor", aparece um seletor "abater de qual parcela?". A linkagem fica numa nova tabela `expense_offsets` (despesa_id, event_cost_id, valor).

---

## Detalhes técnicos

**Migrations:**
- `bar_expenses`: + `is_investment bool default false`, + `installment_total int`, + `installment_index int`, + `installment_group_id uuid` (agrupa as 12)
- nova tabela `expense_offsets` (id, expense_id, source_type 'sale'|'event_cost', source_id, amount, created_at) — pra rastrear abatimentos
- seed da categoria "Bazar e limpeza" (kind=fixed) no `bar_expense_categories` default
- novo tipo de venda: `sales.category = 'cortesia_fornecedor'` (texto, não precisa enum)

**Arquivos a editar/criar:**
- `src/components/ui/currency-input.tsx` — select-all no focus
- `src/components/financeiro/ExpenseFormDialog.tsx` — opção "A pagar", aba Parcelado, checkbox investimento
- `src/components/financeiro/ExpensesTab.tsx` — badge "3/12", agrupamento por grupo de parcela
- `src/components/financeiro/PayExpenseDialog.tsx` — mostrar abatimentos + sugerir valor a pagar
- `src/components/vendas/SupplierConsumptionSheet.tsx` — **novo**, lupa + carrinho + lançar
- `src/components/vendas/QuickEventCostCard.tsx` — botão "+ Consumo de fornecedor"
- `src/routes/_app.financeiro.tsx` — novo card "Investimentos pagos (mês)" e excluí-los do lucro líquido
- `supabase/migrations/...` — colunas + tabela offsets + seed categoria

**Permissões:** Consumo de fornecedor exige permissão `financeiro` (mexe em parcela) E `vendas` (baixa estoque). Se só tem `vendas`, o botão fica desabilitado.

---

## Fora de escopo desta etapa

- Juros automáticos por dia de atraso (já decidimos não fazer)
- Antecipar parcelas (pagar 2 de uma vez com desconto)
- Renegociação de parcelado (recalcular as restantes)
- Anexar boleto/PDF

Posso seguir com isso?