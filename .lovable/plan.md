## Plano de correções

### 1. Combos aparecendo desabilitados mesmo com estoque
**Diagnóstico:** Em `_app.pdv.tsx`, a query `pdv-combo-items` só retorna linhas quando o usuário tem permissão `estoque` (RLS da tabela `combo_items` exige `has_permission(..., 'estoque')`). Vendedores não têm essa permissão, então `comboItems = []`, `comboStockMap[id] = 0` e todo combo vira "sem estoque".

**Correção:**
- Criar função RPC `get_combo_items_for_sales()` `SECURITY DEFINER` que retorna `combo_product_id, component_product_id, quantity` para o owner atual, exigindo apenas permissão `vendas`.
- Substituir a query direta em `combo_items` por essa RPC no PDV.
- Manter a regra atual: combo disponível ⇔ `min(stock_componente_i / qty_i) ≥ 1` para todos os componentes.

### 2. Checkout "misturado" com a grade de produtos
**Diagnóstico:** Hoje o carrinho é um `<details open>` fixo no rodapé com `max-h-[60vh] overflow-y-auto`, sem backdrop. Em telas pequenas ele cobre parcialmente os produtos e parece "vazado".

**Correção:** Trocar o bloco sticky por um **Drawer/Sheet lateral**:
- Botão flutuante fixo no canto inferior direito mostrando contagem de itens + total → abre o drawer.
- Em desktop (`md+`): `Sheet` lado direito, largura `sm:max-w-md`, com backdrop escuro nativo do shadcn.
- Em mobile: `Drawer` (vaul) de baixo para cima, ocupando até `90vh`, com handle e backdrop.
- Conteúdo dentro do drawer: lista de itens (com +/-), desconto, `SplitPaymentEditor`, botão "Finalizar".
- Adicionar produtos com o drawer aberto continua funcionando (estado do cart persiste).

### 3. Responsividade geral
- **Grade de produtos:** já é `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`. Ajustar para `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` e aumentar área de toque dos cards (`min-h-[112px]`, `p-3 sm:p-4`).
- **Chips de categoria + busca:** garantir `overflow-x-auto` com `snap-x` e `Input` `h-11` em mobile.
- **Header `PageHeader`:** revisar para empilhar título/subtítulo em < 640px.
- **Sidebar/menu:** já usa shadcn sidebar; revisar `AppLayout` para colapsar em mobile via `SidebarTrigger` no header (botão sempre visível).
- **Bar de sessão de caixa:** já é `flex-wrap`; ok. Reforçar `gap-2 text-xs sm:text-sm`.
- **Diálogos (`OpenCashDialog`, `WithdrawalDialog`, `CashClosingDialog`):** garantir `max-h-[90vh] overflow-y-auto` e botões `w-full sm:w-auto`.

### 4. Redirect pós-login por role
**Diagnóstico:** `src/routes/auth.tsx` redireciona sempre para `/dashboard` (ou rota fixa).

**Correção:**
- Após login bem-sucedido, aguardar `usePermissions` carregar e decidir:
  - `role = 'owner'` ou `can('financeiro')`/manager → `/dashboard`.
  - caso contrário, se `can('vendas')` → `/pdv`.
  - fallback → primeira rota permitida.
- Aplicar a mesma lógica no `_app/index` quando usuário acessa "/".
- Proteger `/dashboard` com check de permissão (já existe `can()`, só exibir "sem permissão" se não tiver).

### 5. Pagamento em dinheiro condicional
**Diagnóstico:** `SplitPaymentEditor` já recebe `canSellCash`, mas o botão "Dinheiro" provavelmente continua visível. Confirmar e:
- Esconder completamente o botão "Dinheiro" quando `canSellCash === false`.
- Bloquear adição programática de linha `method='dinheiro'` (defensivo).
- `finalize` em `_app.pdv.tsx` já valida e rejeita — manter.

---

### Arquivos a editar
- `src/routes/_app.pdv.tsx` — trocar carrinho sticky por drawer, RPC de combo items, grid responsivo.
- `src/components/vendas/SplitPaymentEditor.tsx` — ocultar dinheiro sem permissão.
- `src/routes/auth.tsx` — redirect por role.
- `src/components/AppLayout.tsx` — garantir trigger de sidebar visível em mobile.
- Diálogos de caixa — ajustes de responsividade.
- **Migration:** criar `get_combo_items_for_sales()` SECURITY DEFINER.

### Fora de escopo
- Refatorar telas de Estoque/Produtos/Financeiro (só ajustes pontuais se quebrarem em mobile).
- Mudanças em RLS das tabelas existentes.

Posso seguir?