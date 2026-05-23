## Objetivo
Trazer o lançamento de **consumação interna** (banda, DJ, segurança, funcionário, sorteio) direto para o painel `/vendas` (ao lado do "Custo rápido") e amarrar a consumação do **Gledson (som)** como abatimento automático da parcela do investimento do som — usando o **preço de venda** (balcão) como valor abatido.

Regras gerais:
- custo interno da consumação = `cost_price` do produto no momento (snapshot);
- baixa de estoque automática (via `sale_items`);
- valor de venda = R$ 0 no faturamento;
- abatimento na parcela do som = soma do **preço balcão** (`unit_price × qty`) dos itens cujo destino é "segurança" **com recipient = Gledson** (ou marcador equivalente — ver §5).

## 1. Banco

Migration:
- `ALTER TABLE sales ADD COLUMN consumacao_recipient_name text NULL;`
- Atualizar `get_event_consumacao(_event_id)` para incluir `recipient_name` em `items[]` e adicionar `by_recipient` (target + recipient).
- Nova RPC `get_supplier_consumacao_history(_expense_id uuid, _from date, _to date)` que retorna, por dia, os itens de consumação cujo destino aponta para o fornecedor/investimento alvo (ver §5), com `qty`, `cost_total`, `retail_total`. Usada na aba "Histórico" da parcela.

Sem mudança de RLS.

## 2. Card "Consumação interna" no painel /vendas

Novo `src/components/vendas/QuickConsumacaoCard.tsx`, renderizado em `LiveDashboardPanel.tsx` logo após `QuickEventCostCard`, quando há evento aberto e o usuário tem `pode_lancar_consumacao` (ou é dono).

- Chips de destino: Banda · DJ · Segurança · Funcionário · Sorteio.
- Campo "Nome de quem pegou" (texto livre, opcional), placeholder por destino (ex.: segurança → "ex.: Gledson (som)").
- Mini-buscador de produto + qtd (lista local, sem split de pagamento).
- Resumo: total de itens, custo estimado e valor balcão.
- Botão "Lançar consumação" → cria `sales` (`category='consumacao'`, `consumacao_target`, `consumacao_recipient_name`, `total=0`, `event_id`, `location_id` da sessão aberta ou estoque padrão do bar) + `sale_items` com `cost_price_snapshot` atual. Invalida `event-consumacao` e estoque.

## 3. PDV — mesmo campo de nome

- `ConsumacaoTargetDialog`: após escolher destino, passo extra com input "Nome de quem pegou" (opcional). `onPick` passa `{ target, recipientName }`.
- `_app.pdv.tsx > saveConsumacao` grava `consumacao_recipient_name`.

## 4. Painel ao vivo

- `ConsumacaoLivePanel`: coluna "Para quem" no detalhamento (ex.: "Segurança · Gledson"). Agrupamento por destino mantém-se; aparece chip com o nome quando preenchido.

## 5. Abatimento automático na parcela do som

Hoje já existe `SupplierConsumptionSheet` (botão "Abater consumo na parcela do investimento") que cria `expense_offsets`. Vamos automatizar para a consumação interna:

- Em `bar_expenses` (parcelas/investimentos), adicionar campo opcional **`auto_consumacao_recipient text`** — ex.: "Gledson". Permite ao dono marcar uma parcela como "abater automaticamente toda consumação cujo destino é segurança e recipient = X".
- Trigger ou job na inserção de `sale_items` de uma `sales` com `category='consumacao'` + `consumacao_target='seguranca'` + `consumacao_recipient_name='<X>'`: criar `expense_offsets` para cada parcela em aberto que tenha `auto_consumacao_recipient = '<X>'`, com `amount = quantity × unit_price` (preço de balcão), `source_type='consumacao'`, `source_id=sale_id`.
- Saldo da parcela = `amount + interest - paid_amount - SUM(expense_offsets.amount)` (já é assim no código atual de saldo).

UI:
- Em `InvestmentFormDialog` / `PayExpenseDialog` (parcela): novo campo "Abater consumação automática de" com input texto (placeholder "ex.: Gledson") + select de destino (default "Segurança").
- Em `ExpensesTab` (ou na sheet de detalhes da parcela): nova **aba "Histórico de consumação"** com filtro de período (de/até) listando dia a dia os itens consumidos pelo recipient configurado, mostrando `qty`, `valor balcão` (abatido) e `custo`. Usa `get_supplier_consumacao_history`.

## 6. Arquivos afetados
- `supabase/migrations/...` — coluna `consumacao_recipient_name`, coluna `auto_consumacao_recipient` em `bar_expenses`, atualização de `get_event_consumacao`, nova RPC `get_supplier_consumacao_history`, trigger de auto-offset.
- `src/components/vendas/QuickConsumacaoCard.tsx` (novo).
- `src/components/vendas/LiveDashboardPanel.tsx` — render do novo card.
- `src/components/vendas/ConsumacaoTargetDialog.tsx` — passo do nome.
- `src/components/vendas/ConsumacaoLivePanel.tsx` — exibir recipient.
- `src/routes/_app.pdv.tsx` — propagar recipientName.
- `src/components/financeiro/InvestmentFormDialog.tsx` e/ou `PayExpenseDialog.tsx` — configurar recipient automático.
- `src/components/financeiro/ExpensesTab.tsx` (ou nova sheet) — aba "Histórico de consumação" com filtro de datas.

## 7. Validação
- Lanço consumação "Segurança · Gledson" com 5 latas (custo R$ 30, balcão R$ 75) → estoque cai, faturamento intocado, painel mostra "Segurança · Gledson · custo R$ 30 · balcão R$ 75".
- A parcela do som (marcada com `auto_consumacao_recipient='Gledson'`) recebe um `expense_offset` automático de R$ 75 e o saldo a pagar cai R$ 75.
- Aba "Histórico de consumação" da parcela lista o dia/hora, produtos, qtd, balcão e custo, com filtro de período.
