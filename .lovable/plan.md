## Diagnóstico

### 1. Produtos não aparecem para o vendedor

Olhando as políticas RLS da tabela `products`:

```sql
USING ((user_id = get_owner_id(auth.uid())) AND has_permission(auth.uid(), user_id, 'estoque'))
```

O `SELECT` exige permissão `estoque`. A Marilia (`caixa_bar`) só tem `[vendas, lojinha]` → a query retorna 0 linhas mesmo com o estoque global do dono `d51c4fd1` tendo 4 produtos / 159 unidades.

`product_stock` e `product_categories` já liberam `vendas` no SELECT. Só `products` (e por tabela, `combo_items`, mas esse já é lido via RPC `get_combo_items_for_sales`) está bloqueando.

Os queries do PDV/Lojinha **não** filtram por `user_id` no client — quem filtra é a RLS via `get_owner_id`. Ou seja, todos os funcionários do mesmo dono já compartilham a mesma lista global de produtos e o mesmo `product_stock`. Não precisa "remover filtros de user_id" do código — precisa **liberar SELECT em `products` para quem tem `vendas` ou `lojinha`**.

### 2. Histórico de vendas mostrando valores para o vendedor

`SalesHistory.tsx` mostra `total`, soma R$ e desconto para qualquer um com permissão de `vendas`. Não há diferenciação por papel.

## O que vou corrigir

### A. Migration — liberar leitura global de produtos para vendedores

Trocar a policy `View products`:

```sql
DROP POLICY "View products" ON public.products;
CREATE POLICY "View products" ON public.products FOR SELECT
USING (
  user_id = public.get_owner_id(auth.uid())
  AND (
    public.has_permission(auth.uid(), user_id, 'estoque')
    OR public.has_permission(auth.uid(), user_id, 'vendas')
    OR public.has_permission(auth.uid(), user_id, 'lojinha')
  )
);
```

Mesma coisa para `combo_items` (caso o vendedor precise ler direto), por segurança: liberar SELECT para `vendas` também.

### B. `SalesHistory.tsx` — linha do tempo operacional para vendedor

Reformular a tela usando `usePermissions`:

- **Se `isOwner || can('financeiro')`** → mantém a tela atual: total, soma do período, forma de pagamento, desconto.
- **Caso contrário** (vendedor/caixa_bar/garcom) → vira **Linha do Tempo Operacional**:
  - Busca `sale_items` com `created_at`, `product_name`, `quantity` (com join leve em `sales` apenas para pegar `created_at` e `employee_name`).
  - Renderiza lista cronológica: "1x Combo Orloff — 23:15 — Marilia".
  - Sem totais, sem somatório de R$, sem coluna de pagamento, sem desconto.

A policy SELECT atual de `sale_items` já permite quem tem `vendas` — não precisa mudar RLS aqui.

Pequeno detalhe: a tela `vendas` (que renderiza `SalesHistory` na aba "Histórico") fica acessível só para quem tem `vendas`; o split por `financeiro` é puramente visual dentro do componente.

## Arquivos afetados

- `supabase/migrations/<nova>.sql` — relaxa SELECT em `products` (e `combo_items`).
- `src/components/vendas/SalesHistory.tsx` — divide em dois modos (financeiro vs. operacional) usando `usePermissions`.

## Fora do escopo

- Não vou remover `user_id` das tabelas (a multi-tenancy continua sã — o "global" é dentro do mesmo dono, como o sistema já é desenhado).
- Não vou mexer em policies de outras tabelas além de `products`/`combo_items`.
- Não vou criar tela nova nem alterar rotas/permissões existentes.
