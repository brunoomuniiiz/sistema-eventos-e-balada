## Entendi as respostas

1. **Janela padrão:** se tem evento aberto → mostra o evento; senão → mostra o dia. ✅
2. **Sangrias:** no painel ao vivo mostra **valor BRUTO** que entrou em dinheiro (sem descontar sangria). A sangria aparece num **card separado** ("Sangrias da sessão: R$ X"). O desconto só acontece no **fechamento do caixa** (entrou 600, fundo 100, sangrias 400 → esperado em gaveta = 300). ✅
3. **Tudo dentro de Vendas**, sub-abas visíveis só pra **owner + permissão `financeiro`**. ✅

## Plano

### A) Mover "Caixas" pra dentro de Vendas
- Remove a rota standalone `/admin-caixas` do menu lateral.
- Em `/vendas`, adiciona 2 novas abas (só pra owner/gerente):
  - **"Painel ao vivo"** 📊 (nova — descrita abaixo)
  - **"Caixas"** 🔐 (move o conteúdo atual de `admin-caixas` pra cá: autorizar abertura, autorizar fechamento, ver valores declarados)
- Owner/gerente passa a operar tudo de longe (notebook): autorizar abertura do Bar/Portaria, fazer sangria à distância, conferir fechamento — sem precisar trocar de tela.

### B) Sangria remota
Hoje a sangria (`SessionWithdrawalsCard`) só aparece na aba **Fechamento**, que exige caixa aberto no próprio dispositivo. Vou:
- Mover o card de sangrias pra dentro da nova aba **"Caixas"** também, listando as sessões abertas (Bar e Portaria) com botão "Nova sangria" pra cada uma.
- A RPC `register_withdrawal` já aceita um `_grant_token` autorizado — o owner se autoriza sozinho via `AuthorizationDialog`, então funciona remoto perfeitamente.

### C) Aba "Painel ao vivo" (nova)

**Filtro de período no topo:**
- Default: evento aberto se existir; senão "Hoje (0h–agora)".
- Outras opções: Hoje · Evento atual · Ontem · 7 dias · 30 dias · Custom.

**Card 1 — Faturamento bruto**
- Total geral
- Por forma de pagamento: **Dinheiro · Pix · Débito · Crédito** (valor + % do total)
- Importante: o **Dinheiro aqui é bruto** (tudo que entrou no caixa, antes de sangria).

**Card 2 — Sangrias (separado, em vermelho)**
- Total sangrado no período
- Lista resumida (motivo + valor + quem fez)
- *Não desconta do faturamento — é só pra você saber.*

**Card 3 — Entrada por funcionário**
Tabela com cada vendedor ativo:
- Nome · Canal (Caixa / Garçom / Portaria / Lojinha)
- Dinheiro · Pix · Débito · Crédito · **Total** · Nº vendas
- Rodapé com soma geral

**Card 4 — Mix de canais**
Pizza: % de venda por PDV Caixa vs Garçom vs Lojinha vs Portaria.

**Card 5 — Ranking de vendedores**
Top 5 por faturamento (e alternativa por nº de vendas). 🥇🥈🥉

**Card 6 — Produtos mais vendidos**
Top 10 com quantidade, valor total, % do faturamento.

**Atualização:** auto-refresh 10s + realtime (já usamos no projeto).

### D) Como buscar os dados
Uma RPC nova `get_live_dashboard(_from, _to, _event_id)` que devolve tudo agregado num JSON (1 chamada só). Fontes:
- `sales` + `sale_payments` + `sale_items` (PDV/garçom — com `seller_user_id`/`employee_name`)
- `lojinha_orders` + `lojinha_order_items` (status `paid`/`delivered`)
- `event_entries` (portaria, com `payment_method`)
- `cash_withdrawals` (sangrias do período)

## Arquivos a editar

1. `src/routes/_app.vendas.tsx` — adicionar abas "Painel" e "Caixas" (owner/financeiro).
2. **Novo:** `src/components/vendas/LiveDashboardPanel.tsx`.
3. **Novo:** `src/components/vendas/CaixasAdminPanel.tsx` (extrai conteúdo de `_app.admin-caixas.tsx` + cards de sangria remota por setor).
4. `src/components/AppLayout.tsx` — remover item "Caixas" do menu (vira sub-aba de Vendas).
5. `src/routes/_app.admin-caixas.tsx` — deletar (ou deixar um redirect pra `/vendas?tab=caixas`).
6. **Migration:** RPC `get_live_dashboard(_from timestamptz, _to timestamptz, _event_id uuid default null)` retornando JSON com os 6 cards.

## Pergunta única antes de codar
Pra **sangria remota** funcionar com você no notebook, o caixa do setor precisa estar **aberto** (sessão ativa de algum funcionário no local) — porque a sangria é amarrada à `session_id`. Confirma que esse fluxo serve? (Owner não consegue "sangrar do nada" se nenhum caixa físico estiver aberto — o que faz sentido, dinheiro tem que estar na gaveta.)