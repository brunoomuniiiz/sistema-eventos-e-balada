## Objetivo

Adicionar **lançamentos de custos do bar** (não vinculados a evento) na aba Financeiro:

1. **Custos fixos** — recorrentes mensais (aluguel, água, luz, internet, +personalizáveis).
2. **Custos variáveis** — compras/pagamentos avulsos (bebidas com fornecedor + forma de pagamento, +personalizáveis).

---

## 1. Banco

**Nova tabela `bar_expense_categories`** (categorias gerenciáveis pelo dono)
- `name`, `kind` (`fixed` | `variable`), `is_default bool`, `sort_order`, `icon`
- Seed por dono (no `handle_new_user` + backfill):
  - **Fixos**: Aluguel, Água, Luz, Internet
  - **Variáveis**: Bebidas, Insumos, Manutenção
- RLS: dono e quem tem permissão `financeiro` lê/edita.

**Nova tabela `bar_expenses`** (lançamentos)
- `category_id`, `category_name` (snapshot), `kind` (`fixed`|`variable`)
- `amount numeric`, `description text`, `expense_date date`
- `payment_method text` (`dinheiro|debito|credito|pix|boleto|transferencia`)
- `supplier_id uuid` (nullable, opcional)
- `due_date date` (nullable, p/ fixos com vencimento)
- `paid bool default true`, `paid_at timestamptz`
- `recurrence text` (`once|monthly`) — para fixos marcados como recorrentes
- `notes text`
- RLS: dono + permissão `financeiro` (CRUD).

**Nova tabela `suppliers`** (fornecedores)
- `name`, `phone`, `notes`
- Cadastro rápido inline ao lançar custo variável.
- RLS: dono + permissão `financeiro` ou `estoque`.

---

## 2. UI — aba Financeiro

Adicionar **2 novas tabs** no `_app.financeiro.tsx` (já tem Tabs):

### Tab "Custos fixos"
- Cards mostrando total do mês corrente por categoria (Aluguel, Água, Luz, Internet…).
- Botão "+ Lançamento" → modal:
  - categoria (select com "+ Nova categoria" inline → cria em `bar_expense_categories`)
  - valor, data de competência, vencimento, forma de pagamento
  - toggle "Recorrente mensal" → ao ligar, gera próximos lançamentos automaticamente no mês seguinte (job simples no client ou função SQL `generate_next_month_fixed`)
  - status: pago / a pagar
- Lista do mês com filtros: pago/pendente, categoria.
- Total fixo do mês destacado.

### Tab "Custos variáveis"
- Botão "+ Lançamento" → modal:
  - categoria (Bebidas, Insumos, Manutenção, +nova)
  - valor, data, forma de pagamento
  - **fornecedor** (select com busca + "+ Novo fornecedor" inline)
  - descrição
- Lista agrupada por mês, com totais por categoria e por fornecedor.
- Filtros: período (mês), categoria, fornecedor, forma de pagamento.

### Aba "Categorias" (sub-aba dentro de Custos fixos/variáveis ou um botão "Gerenciar categorias")
- CRUD simples de `bar_expense_categories` separado por tipo.
- Não permite excluir categoria em uso; oferece reatribuir.

---

## 3. Integração com indicadores existentes

- O **Resumo financeiro** (cards do topo da `_app.financeiro.tsx`) ganha:
  - "Custos fixos do mês" e "Custos variáveis do mês"
  - "Lucro líquido real" = (lucro de eventos no mês) − fixos − variáveis do mês
- A view **Mensal** (`_app.mensal.tsx`) também passa a deduzir esses custos do líquido mensal.

---

## 4. Arquivos afetados

- Nova migration:
  - tabelas `bar_expense_categories`, `bar_expenses`, `suppliers`
  - RLS para todas
  - seed em `handle_new_user` + backfill para donos existentes
  - função `generate_next_month_fixed(_user_id uuid)` (opcional, p/ recorrência)
- `src/routes/_app.financeiro.tsx` — adiciona 2 tabs + cálculos no resumo
- `src/routes/_app.mensal.tsx` — desconta custos no líquido
- Novos componentes:
  - `src/components/financeiro/FixedExpensesTab.tsx`
  - `src/components/financeiro/VariableExpensesTab.tsx`
  - `src/components/financeiro/ExpenseCategoriesManager.tsx`
  - `src/components/financeiro/ExpenseFormDialog.tsx`
  - `src/components/financeiro/SupplierPicker.tsx`

---

## Fora de escopo

- Sem fluxo de aprovação / contas a pagar avançado.
- Sem anexos de comprovantes (pode vir depois).
- Sem integração bancária.

Posso seguir?
