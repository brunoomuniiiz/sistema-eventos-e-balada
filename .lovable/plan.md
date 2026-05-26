# Plano — Fechar Blocos A (Pagamentos) e E (Impressão)

A base já está pronta (tabelas, painéis de Maquininhas/Impressoras, PIN simplificado, flag `canPixChave`). Falta plugar a lógica nas telas de venda e nas permissões dos funcionários.

## 1. Permissões do funcionário (`SellerPermissionDialog`)
- Adicionar toggle **"Pode lançar PIX por chave"** (grava `pode_pix_chave` em `user_roles`).
- Criar 2 sub-abas:
  - **Imprimir ao vender**: lista de categorias → marcar quais saem na impressora desse funcionário.
  - **Imprimir ao escanear**: idem, para o fluxo da portaria/scanner.
- Grava em `print_rules` (`user_role_id`, `category_id`, `print_on_sale`, `print_on_scan`).
- Default ao criar funcionário: todas categorias marcadas nas duas abas.

## 2. PIX por chave (`PixQrDialog`)
- Adicionar aba **"Chave PIX"** ao lado de "QR Code".
- Aba só aparece se `canPixChave === true` no funcionário logado.
- Ao confirmar: abre `AuthorizationDialog` exigindo **PIN do dono** (já sem email).
- Venda salva com `payment_method = 'pix_chave'` e observação em `notes`.

## 3. Split por terminal (`SplitPaymentEditor`)
- Cada linha de cartão (crédito/débito) ganha um seletor de **Maquininha** (lista de `payment_terminals` ativas que aceitam aquela bandeira).
- Permite 2+ linhas de cartão apontando para terminais diferentes (ex: R$100 MP Point + R$100 Itaú manual).
- Grava `terminal_id` em `sale_payments`.

## 4. Filtro de impressão por categoria
- `src/lib/print-rules.ts` (novo): helper `getAllowedCategories(userRoleId, trigger)` que lê `print_rules`.
- `src/lib/order-print.ts`: `printUnitTickets()` e `printPrepSlips()` aceitam parâmetro `allowedCategoryIds` e filtram os itens antes de imprimir.
- Chamadas existentes (PDV, Garçom, Scanner da portaria) passam o filtro do role atual.

## 5. Relatórios por terminal
- **Financeiro** (`ExpensesTab`/visão de receitas) e **Caixas** (`CaixasAdminPanel`): agrupar entradas de cartão/PIX por `terminal_id` com nome do terminal.

## Arquivos
- Editar: `SellerPermissionDialog.tsx`, `PixQrDialog.tsx`, `SplitPaymentEditor.tsx`, `order-print.ts`, `ExpensesTab.tsx`, `CaixasAdminPanel.tsx`, chamadas de impressão no PDV/Garçom/Scanner.
- Criar: `src/lib/print-rules.ts`.
- Sem nova migração (schema já existe).

## Ordem de execução
1. `SellerPermissionDialog` (permissão + sub-abas) — desbloqueia tudo o resto
2. `print-rules.ts` + filtro em `order-print.ts` + chamadas
3. `SplitPaymentEditor` com terminal
4. `PixQrDialog` aba Chave + PIN
5. Relatórios por terminal

Confirmar para implementar.

