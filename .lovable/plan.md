
# Plano: Unificar Lojinha dentro de Vendas

## Objetivo

Acabar com a divisão Vendas vs Lojinha no painel. Tudo de gestão (PDV, pedidos, abandonados, maquininhas, scanner, configuração da loja online) vira aba dentro de **Vendas**. A loja pública `/loja/:slug` continua intacta para o cliente final. Permissões deixam de ser "vendas" e "lojinha" como blocos e viram **flags granulares por funcionário**.

---

## 1. Permissões — modelo novo

Substituir a permissão `lojinha` por flags dentro de `vendas`. Nova tabela:

```text
sales_permissions
  user_id            uuid  (funcionário)
  owner_id           uuid
  can_sell           bool  default true
  can_deliver        bool  default true   (todo vendedor pode entregar)
  pay_cash           bool  default false
  pay_debit          bool  default true
  pay_credit         bool  default true
  pay_pix            bool  default true
  can_open_cash      bool  generated/derived from pay_cash
```

- Owner/gerente acessa tudo automaticamente (via `is_owner_of` / role gerente).
- Quem hoje tem `lojinha`: **mantém o flag legacy ativo até o owner reconfigurar manualmente** (você pediu "decido caso a caso depois"). Tela de Configuração mostra aviso "configurar".
- Hook `usePermissions` ganha: `canSell`, `canDeliver`, `payMethods: { cash, debit, credit, pix }`.

## 2. Estrutura nova de `/vendas` (abas)

```text
PDV  |  Pedidos  |  Histórico  |  Fechamento  |  [Abandonados]  |  [Maquininhas]  |  [Configuração]
```

Colchetes = só owner/gerente.

### PDV
- Catálogo unificado (produtos + combos), respeitando `visivel_pdv_caixa` / `visivel_mobile_garcom` conforme o dispositivo.
- Botões de pagamento filtrados por `payMethods` do vendedor.
- Se `can_sell=false`: PDV escondido, abre direto em **Pedidos** (modo escâner/entregador).

### Pedidos (fila unificada)
- Junta:
  - Pedidos online pagos (`lojinha_orders` status=paid)
  - Pedidos POS combo (que precisam de QR)
- Filtros por status (Aguardando, Entregue hoje).
- Botão "Entregue" (produto simples) ou "Escanear / Reimprimir cupom" (combo).
- Auto-print já existente continua.

### Histórico
- **Vendedor comum**: vê só vendas/pedidos onde `seller_user_id = auth.uid()` OU `delivered_by = auth.uid()`.
- **Owner/gerente**: vê tudo, filtro por funcionário, canal (presencial/online/pos), data, método.
- Fonte: view nova `unified_sales_history` que une `sales` + `lojinha_orders` paid, com colunas `id, channel, seller_name, customer, total, payment_method, created_at, delivered_at, delivered_by_name`.
- Atualização em tempo real via Supabase realtime (canal `lojinha_orders` + `sales`).

### Fechamento
- Igual hoje, mas só aparece se `pay_cash=true`.
- Sangrias só pra quem opera dinheiro.

### Abandonados (owner/gerente)
- Mesma tela `LojinhaAbandonedPanel` que já existe, movida pra cá.

### Maquininhas (owner/gerente)
- Mesma `LojinhaDevicesPanel` movida pra cá.

### Configuração (owner/gerente)
- **Funcionários**: lista cada funcionário com toggles (can_sell, can_deliver, métodos de pagamento).
- **Loja online**: slug, nome, cor, mensagem de retirada, local de estoque (extraído de `LojinhaSettingsPanel`).

## 3. Abertura de caixa — sempre autorizada

Hoje `OpenCashDialog` abre direto se `canSellCash`. Mudança:

- Toda abertura passa por `AuthorizationDialog` (email+senha do owner/gerente) — funciona tanto no dispositivo do vendedor quanto no do gerente.
- RPC `open_cash_session` passa a exigir `_grant_token` (igual `register_withdrawal`).
- Valor inicial e motivo continuam, mas a confirmação final é a autorização.

## 4. Menu lateral

- **Remover** item "Lojinha" do menu.
- "Vendas" passa a ser o hub único.
- Rota `/lojinha` redireciona pra `/vendas` (compatibilidade).
- `/loja/:slug` (pública) e `/loja/:slug/pedido/:id` (cliente) ficam intactas.

## 5. Migração de dados

- `sales_permissions` populada a partir de `user_roles` existente:
  - Quem tem `vendas` → linha com defaults (sem cash).
  - Quem tem `lojinha` mas não `vendas` → linha com `can_sell=true, pay_pix=true, pay_cash=false`.
- Permissão `lojinha` em `user_roles` fica como legacy (não removida agora, pra não quebrar policies). Numa segunda fase removemos depois que tudo migrou.

## 6. Arquivos afetados (resumo técnico)

### Backend (migração SQL)
- Criar `sales_permissions` + RLS + trigger updated_at.
- Atualizar `open_cash_session` pra exigir `_grant_token`.
- Criar view `unified_sales_history`.
- Função helper `get_sales_perms(user, owner)` SECURITY DEFINER.
- Atualizar policies das tabelas `lojinha_*` pra aceitar também `vendas` + flag relevante (transição).

### Frontend
- `src/hooks/usePermissions.tsx` — expor flags novas.
- `src/routes/_app.vendas.tsx` — adicionar abas Pedidos / Abandonados / Maquininhas / Configuração condicionalmente.
- Mover componentes:
  - `LojinhaOrdersPanel` → `src/components/vendas/OrdersPanel.tsx` (renomear + aceitar pedidos POS combo)
  - `LojinhaAbandonedPanel` → `src/components/vendas/AbandonedPanel.tsx`
  - `LojinhaDevicesPanel` → `src/components/vendas/DevicesPanel.tsx`
  - `LojinhaSettingsPanel` → `src/components/vendas/OnlineStoreSettingsPanel.tsx`
- Novo `src/components/vendas/SellerPermissionsPanel.tsx` (toggles por funcionário).
- Novo `src/components/vendas/SalesHistoryUnified.tsx` substitui `SalesHistory` atual.
- `src/components/vendas/OpenCashDialog.tsx` — adicionar passo de autorização obrigatório.
- `src/routes/_app.lojinha.tsx` — virar redirect pra `/vendas`.
- `src/components/AppLayout.tsx` — remover item "Lojinha" do menu.
- PDV: respeitar `payMethods` na hora de mostrar botões de pagamento.

## 7. Ordem de execução sugerida

1. Migração SQL (`sales_permissions` + view + autorização caixa + policies transitórias).
2. Atualizar `usePermissions` e popular `sales_permissions` pra usuários existentes.
3. Construir tela Configuração (toggles) — você consegue ajustar cada funcionário.
4. Mover painéis pra Vendas + remover menu Lojinha.
5. Substituir Histórico pelo unificado.
6. Endurecer abertura de caixa com autorização.
7. Limpar permissão `lojinha` numa fase posterior (depois de validar).

---

**Confirma esse plano?** Se sim, executo na ordem acima — começando pela migração SQL, e te peço aprovação dela antes de mexer no frontend.
