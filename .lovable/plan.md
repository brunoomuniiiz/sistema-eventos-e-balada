## Roadmap — status: D ✅ | B ✅ | C 🔄 | A 📋 | E 📋

Ordem: **D → B → C → A → E**

---

### Bloco D ✅ — Fechar permissões (resíduo)

- Financeiro: `canFinLancarDespesas`, `canFinVerNumeros`, `canFinFecharCaixa` aplicados em `ExpensesTab`, `InvestmentTab`, `_app.financeiro.tsx`.
- Caixas: aba "Caixas" em vendas e `CaixasAdminPanel` agora usam `canFinFecharCaixa`.

---

### Bloco B ✅ — Fluxo de acesso (sem auto-cadastro)

- `/auth` virou só **Login + Recuperar senha** (sem "Criar conta").
- Nova rota oculta `/signup-owner` para o primeiro dono se cadastrar.
- Reset-password e `invite-staff` mantidos.

---

### Bloco C 🔄 — Auto-abertura de evento + simplificar portaria/vendas

- ✅ Migration: `events.auto_open_minutes_before` (default 60) e `auto_close_hours_after` (default 8).
- ✅ Hook `useActiveEvent()` criado — checa eventos do dia, auto-abre se dentro do threshold.
- ✅ Portaria: dropdown de evento removido, mostra "Entrada para: <evento>" fixo. Bloqueia se nenhum aberto.
- 📋 Falta: adaptar PDV (`_app.pdv.tsx`) para usar `useActiveEvent()` ao invés de dropdown.

---

### Bloco A 📋 — Pagamentos externos

Aguardando confirmação dos pontos pendentes.

---

### Bloco E 📋 — Ficha de copa personalizada

Aguardando confirmação do ponto E.3 (cupom + fichas numa janela só).

---

### Pontos a confirmar antes de codar A e E

- **A.2** — maquininhas extras são só "etiqueta", sem integração?
- **A.4** — exigir PIN do dono em cada venda externa?
- **E.3** — cupom + fichas numa janela só, ou separadas?
