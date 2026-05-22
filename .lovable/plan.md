# Plano: Investimentos (CAPEX) + renomear Consumo

## O que muda

### 1. Nova sub-aba "Investimento" dentro do Financeiro (do mês)

No `/financeiro`, dentro da view do mês corrente, adicionar uma sub-aba **Investimento** (ao lado das atuais Despesas/Receitas).

A sub-aba mostra:
- **Card de resumo**: Total investido (geral), Total pago, Saldo a pagar.
- **Lista de "bens investidos"** agrupada por `installment_group_id` (ou avulsos sem grupo). Cada item mostra:
  - Nome ("Som JBL", "Microfone Shure", "Aumento de camarotes")
  - Categoria personalizada criada por ti
  - Valor total · Pago · Saldo · Barra de progresso `5/12`
  - Botão "Ver parcelas" → expande e mostra cada parcela com status (paga/aberta/abate)
  - Botão "Pagar parcela do mês" → abre `PayExpenseDialog` já existente (com abate)
- **Botão "+ Novo investimento"** no topo abre um formulário próprio:
  - Nome do bem (livre)
  - Categoria (select de categorias kind=`investment` com botão "+ criar categoria" inline)
  - Vendedor (livre, opcional)
  - Valor total
  - Modo: **Parcelado** (N parcelas) ou **Pagamento único**
  - Se parcelado: nº parcelas, primeira parcela, dia de vencimento
  - Quanto já paguei (opcional) → marca as primeiras X parcelas como pagas automaticamente
  - Observação

### 2. Categorias de investimento personalizáveis

- `bar_expense_categories` ganha entradas com `kind = 'investment'`.
- Categorias-semente criadas no onboarding: **Equipamento de som**, **Equipamento de bar/cozinha**, **Móveis e decoração**, **Obras e reforma**, **Tecnologia**, **Melhoria do espaço**.
- Botão "+ criar categoria" dentro do form de investimento (cria na hora sem sair da tela).
- Gerenciamento completo via `/financeiro` → aba existente de categorias (filtro por tipo).

### 3. Lucro do mês = Operacional puro

- O cálculo de "Lucro líquido do mês" no card principal **ignora** despesas com `is_investment = true` (já é assim hoje, vou só validar e deixar explícito o rótulo).
- Card "Investimentos pagos no mês" continua existindo, mas com link "Ver tudo →" que leva pra sub-aba Investimento.
- Remover o subtotal de investimento do agregado de "Despesas do mês".

### 4. Renomear "Consumo de fornecedor" → "Abater consumo na parcela"

- Botão no `QuickEventCostCard` (Ao Vivo): novo texto **"Abater consumo na parcela"** + ícone de carrinho.
- Título do sheet: **"Abater consumo na parcela do investimento"**.
- Label da seleção: "Qual parcela abater?" (em vez de "Abater de qual conta").
- Filtra parcelas em aberto com prioridade para `is_investment = true`.
- Toast e descrição usam linguagem "abate" em vez de "fornecedor".
- Lógica de gravação **não muda**: continua criando `sales` + `sale_items` + `expense_offsets`.

### 5. Tirar "Som" do Custo Rápido

- Remover `"Som"` do array `QUICK_CATS` no `QuickEventCostCard`. Som agora é investimento, não custo de noite.

---

## Detalhes técnicos

**Migrações:**
- `bar_expenses`: adicionar `total_amount` (numeric, opcional) pra guardar valor total do bem quando é uma parcela única que representa investimento parcelado externamente (caso "já paguei X de Y").
- `bar_expenses`: adicionar `investment_name` (text, opcional) pra rotular o bem ("Som JBL") separado do `category_name`.
- Seed: inserir categorias padrão com `kind = 'investment'` para owners novos (via migration que faz `INSERT … ON CONFLICT DO NOTHING` baseado no `user_id` dos owners existentes).

**Componentes:**
- Novo: `src/components/financeiro/InvestmentTab.tsx` — sub-aba com lista de bens agrupados.
- Novo: `src/components/financeiro/InvestmentFormDialog.tsx` — form dedicado de criar bem + parcelas.
- Novo: `src/components/financeiro/InvestmentCategoryQuickCreate.tsx` — inline category creator.
- Editado: `src/routes/_app.financeiro.tsx` — adicionar sub-aba "Investimento".
- Editado: `src/components/vendas/QuickEventCostCard.tsx` — renomear botão, remover "Som" de `QUICK_CATS`.
- Editado: `src/components/financeiro/SupplierConsumptionSheet.tsx` — renomear textos, filtrar/ordenar parcelas de investimento primeiro.
- Editado: cálculo do "Lucro do mês" em `_app.financeiro.tsx` — confirmar exclusão de `is_investment`.

**Não muda:**
- Schema de `expense_offsets`.
- Lógica de `PayExpenseDialog` (já lida com abate automaticamente).
- `bar_expenses.is_investment` (já existe).
- `installment_group_id` (já existe).

---

## Resultado prático

- Tu cria **"Som JBL — R$ 36.000 em 12x"** uma vez. Diz "já paguei 4". Sistema marca 4 como pagas e mostra `4/12 · saldo R$ 24.000`.
- No mês corrente vê só a parcela do mês na sub-aba. Lucro do mês não é afetado.
- Quando o vendedor pega R$ 800 em bebida na festa: aperta "Abater consumo na parcela" no Ao Vivo, escolhe a parcela do mês, lança produtos, salva. Parcela vira "R$ 3.000 original − R$ 800 abatido = R$ 2.200 a pagar".
- Cria "Microfone Shure — R$ 800 à vista" como investimento avulso. Aparece na lista, sem parcela.
- Cria "Aumento de camarotes — R$ 15.000 em 6x" como obra. Mesma cara, categoria "Obras e reforma".

---

## Fora de escopo (próximas conversas)

- Depreciação/amortização contábil.
- Anexar nota fiscal/contrato ao investimento.
- Relatório de ROI por investimento.
- Pré-pagar várias parcelas de uma vez com desconto.
- Modo demo "visualizar como [garçom/portaria/promoter]" e checklist de publicação (próxima rodada).
