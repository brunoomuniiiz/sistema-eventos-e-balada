
# Reorganização da navegação e fluxo de caixa

Vou reestruturar o app conforme pedido, consolidando rotas e endurecendo as regras de senha para ações sensíveis.

## 1. Consolidação de rotas (sidebar fica mais enxuto)

**Antes:** Vendas, PDV, Fechamento, Produtos, Estoque, Eventos, Promoters, Portaria, Financeiro, Mensal, Funcionários, Bar.

**Depois:**
- **Vendas** (com abas): `PDV` | `Histórico/Resumo` | `Fechamento`
- **Produtos** (com abas): `Catálogo` | `Estoque (locais + transferências + inventário)`
- **Eventos**
- **Promoters**
- **Portaria**
- **Financeiro** (com abas): `Por evento` | `Bar avulso` | `Mensal`
- **Funcionários** (passa a ser somente lista + edição de permissões existentes)
- **Configuração** (renomeia "Bar"): logo, nome, Instagram, cor — **e** seção "Convites" (promoter e funcionário), com escolha de permissões na hora do convite

Rotas removidas do menu: `/pdv`, `/estoque`, `/fechamento`, `/mensal`, `/bar-settings`. Os arquivos viram componentes internos das abas (sem perder código já feito).

## 2. Caixa por turno (substitui a página "Fechamento" isolada)

Hoje o "Fechamento" é uma página avulsa e o caixa nunca é "aberto" — qualquer staff de vendas pode fechar.

Novo fluxo:
- Quando um staff com permissão `vendas` abre o PDV e **não há caixa aberto dele**, aparece um modal **"Abrir caixa"** pedindo:
  - Valor inicial (troco)
  - Observação opcional
- Durante o turno, dentro de Vendas existe botão **"Sangria"** que pede:
  - Valor + observação
  - **Senha do owner ou de alguém autorizado** (ver §3)
- O total esperado em dinheiro passa a considerar: `inicial + vendas dinheiro − sangrias`.
- O **fechamento cego** (já existente) só finaliza o caixa **mediante senha** (§3) e amarra: vendas do turno, sangrias e valor inicial àquele `cash_session`.

Mudanças de schema (migration):
- Nova tabela `cash_sessions` (id, owner user_id, opened_by, opened_by_name, opening_amount, opened_at, closed_at, status, notes).
- Nova tabela `cash_withdrawals` (sangrias): id, session_id, amount, reason, created_by, authorized_by, created_at.
- `sales.session_id` (uuid) — venda fica ligada à sessão aberta do operador.
- `cash_closings.session_id` + `expected_dinheiro` passa a descontar sangrias e somar inicial.
- RPCs: `open_cash_session(_opening, _notes)`, `register_withdrawal(_amount, _reason, _auth_password)`, `close_cash_blind(...)` ajustada para a sessão e exigir senha.

## 3. Senha para ações sensíveis (sangria, desconto, fechamento)

Hoje `user_roles` já tem `can_discount` e `max_discount_percent`. Vou adicionar:
- `can_authorize` (bool) em `user_roles` — quem pode autorizar sangria/desconto/fechamento de outros (além do owner, que sempre pode).
- Nova RPC `verify_authorizer_password(_email, _password)` (security definer) que confere via `auth` se aquele e-mail/senha pertence a um usuário do mesmo owner com `can_authorize = true` ou é o próprio owner. Retorna o `user_id` do autorizador.
  - Implementação: como a `auth` schema não permite checagem direta de senha por SQL, a verificação é feita por **server function** TanStack que faz `signInWithPassword` com client admin, valida que o user é owner ou tem `can_authorize`, e devolve um token curto (jti) registrado em tabela `auth_grants` (10 min de validade) que as RPCs de sangria/desconto/fechamento aceitam.
- UI: quando staff tenta sangria, desconto acima do permitido, ou fechar caixa, abre modal "Autorização do responsável" → e-mail + senha. Owner pode marcar a si próprio como autorizador padrão. Nada disso é validado via localStorage.

## 4. Configuração (ex-"Bar")

Página única `/configuracao` com 3 cartões:
1. **Identidade do bar** — nome, logo, Instagram, cor (já existe).
2. **Convidar funcionário** — formulário com e-mail, nome, permissões (checkboxes incluindo `vendas/estoque/eventos/promoters/portaria/financeiro/funcionarios`), `can_discount` + `max_discount_percent`, `can_sell_cash`, `can_authorize`. Usa a edge function `invite-staff` já existente (estendida com `can_authorize`).
3. **Convidar promoter** — gera link do promoter para evento (mantém o que existe em `EventPromotersManager`, replicado aqui como atalho geral).

Funcionários continuam editáveis em `/funcionarios` (lista + dialog de edição já existente). O **convite inicial** sai dali e vai para Configuração — quem já está cadastrado é editado em Funcionários, conforme pedido ("posso editar as permissões depois").

## 5. Financeiro com aba Mensal

`/financeiro` ganha `Tabs`: `Por evento`, `Bar avulso`, `Mensal` (conteúdo de `_app.mensal.tsx` movido para componente `MensalTab`). `/mensal` é removido do sidebar (rota fica como redirect para `/financeiro?tab=mensal` para não quebrar links).

## Resumo técnico

- **Migrations:** `cash_sessions`, `cash_withdrawals`, `auth_grants`; coluna `session_id` em `sales` e `cash_closings`; coluna `can_authorize` em `user_roles`; RPCs `open_cash_session`, `register_withdrawal`, ajustes em `close_cash_blind`.
- **Server function** `verify-authorizer` (TanStack `createServerFn`) que valida e-mail+senha via `supabaseAdmin.auth.signInWithPassword`, confere papel/can_authorize, grava `auth_grants` e devolve `grant_token`.
- **Edge function `invite-staff`** estendida com `can_authorize`.
- **UI:**
  - `_app.vendas.tsx` vira shell com `Tabs` (PDV / Histórico / Fechamento). Conteúdo atual de `_app.pdv.tsx`, `_app.fechamento.tsx` e `_app.vendas.tsx` viram componentes em `src/components/vendas/`.
  - `_app.produtos.tsx` ganha `Tabs` (Catálogo / Estoque). Conteúdo de `_app.estoque.tsx` vira `EstoqueTab`.
  - `_app.financeiro.tsx` ganha `Tabs` (Por evento / Bar avulso / Mensal).
  - `_app.bar-settings.tsx` renomeia para `_app.configuracao.tsx` com seções de identidade + convites.
  - `AppLayout.tsx` sidebar reduzido para 7 itens.
  - Modais novos: `OpenCashDialog`, `WithdrawalDialog`, `AuthorizationDialog` (e-mail + senha do autorizador).

## Confirmações antes de eu começar

1. Em **Vendas**, faz sentido a aba "Histórico/Resumo" (vendas do dia + do turno aberto) ou prefere só **PDV + Fechamento**?
2. Para a senha de autorização: ok validar via **e-mail + senha** do autorizador (owner ou funcionário com `can_authorize`)? Alternativa seria um **PIN numérico** definido pelo owner (mais rápido em mobile, menos seguro).
3. O **valor inicial** do caixa é por sessão de cada operador (cada vendedor abre o seu) ou um único caixa do bar para todos os vendedores no mesmo turno?
