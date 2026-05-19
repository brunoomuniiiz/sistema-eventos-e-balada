## Sistema de Caixas Independentes com Autorização Remota

Sistema de controle de turnos (caixas) separados por setor (Bar / Portaria), com fluxo de autorização em tempo real pelo administrador.

---

### 1. Modelo de dados

Nova tabela `cash_register_requests` (controle de turnos / solicitações):

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | uuid | PK |
| `user_id` (owner) | uuid | dono do bar |
| `sector` | text | `'bar'` ou `'portaria'` |
| `status` | text | `closed`, `awaiting_open`, `open`, `awaiting_close` |
| `requested_by` | uuid | funcionário que pediu |
| `requested_by_name` | text | |
| `authorized_by` | uuid | admin |
| `opening_amount` | numeric | definido pelo admin na autorização |
| `session_id` | uuid | FK → `cash_sessions` (criado ao autorizar abertura) |
| `requested_at`, `authorized_at`, `closed_at` | timestamptz | |
| `close_declared_*` | numeric | valores declarados pelo funcionário ao solicitar fechamento (dinheiro/débito/crédito/pix) |

Regra: no máximo **um** registro por `(owner, sector)` em status ≠ `closed`. Constraint via índice único parcial.

**Ajustes em `cash_sessions`:** adicionar coluna `sector` (`bar`/`portaria`) para isolar caixas — vendas do bar e entradas da portaria passam a buscar a sessão correta pelo setor, não mais pelo `opened_by`.

**Ajuste em `sales` / `event_entries`:** continuam usando `session_id`, mas a lookup passa por `sector`.

---

### 2. Funções RPC (security definer)

- `request_cash_open(_sector text)` — funcionário cria request em `awaiting_open`.
- `authorize_cash_open(_request_id uuid, _opening_amount numeric, _notes text)` — admin (owner ou permissão `financeiro`) cria `cash_sessions` com `sector` e marca request como `open`.
- `request_cash_close(_sector text, _declared_din/_deb/_cre/_pix numeric)` — funcionário marca request como `awaiting_close` e grava valores declarados.
- `confirm_cash_close(_request_id uuid)` — admin chama o fluxo existente `close_cash_blind` adaptado e marca request como `closed`.
- `admin_force_open(_sector, _opening_amount)` / `admin_force_close(_sector)` — admin abre/fecha direto sem solicitação prévia.
- `get_sector_cash_status(_sector)` — retorna estado atual para gating de UI.

Todas as RPCs validam `has_permission` (`vendas` para funcionário; `financeiro` ou owner para admin).

---

### 3. Bloqueio de vendas

Adicionar guard nas RPCs/inserts:
- `sales` insert (bar) → exige request `open` em `sector='bar'`.
- `register_event_entry` (portaria) → exige request `open` em `sector='portaria'`.
- Trigger `BEFORE INSERT` em `sales` que rejeita se não houver sessão aberta no setor correspondente (sector inferido por `category`: `bar`/`online` → bar; `entrada` → portaria).

---

### 4. UI — Funcionário (mobile)

**`/vendas` (Bar) e `/portaria`:**
- Hook `useSectorCashStatus(sector)` com `useQuery` + Supabase Realtime em `cash_register_requests`.
- Estados:
  - `closed` → tela cheia "Caixa fechado" + botão **Solicitar abertura**.
  - `awaiting_open` → tela bloqueada "⏳ Aguardando autorização do gerente" (spinner, polling realtime).
  - `open` → libera PDV normalmente; mostra botão **Solicitar fechamento** (abre modal com contagem declarada).
  - `awaiting_close` → tela bloqueada "Aguardando gerente confirmar fechamento".

---

### 5. UI — Administrador (desktop)

Nova rota **`/admin/caixas`** (apenas owner / `financeiro`):
- Painel com 2 cards: **Caixa do Bar** e **Caixa da Portaria**, status atual de cada um.
- Lista de solicitações pendentes em tempo real (Realtime subscription).
- Notificação visual + sonora ao chegar `awaiting_open` ou `awaiting_close`.
- Para `awaiting_open`: input de fundo de caixa + botão **Autorizar abertura**.
- Para `awaiting_close`: mostra declarado vs esperado (usa `get_session_expected_totals` adaptado por setor) + botão **Confirmar e fechar**.
- Botões sempre disponíveis: **Abrir caixa agora** / **Fechar caixa agora** (force open/close) por setor.
- Sino de notificações no header do `/admin` global apontando pra esta página.

---

### 6. Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_register_requests;
ALTER TABLE public.cash_register_requests REPLICA IDENTITY FULL;
```

Funcionário escuta seu setor; admin escuta tudo do `owner_id`.

---

### 7. Migração de dados existentes

- Sessões `cash_sessions` abertas hoje → atribuir `sector='bar'` por padrão (única em uso).
- Criar request `open` correspondente para cada sessão aberta para não quebrar caixas em uso.

---

### 8. Arquivos afetados

**Backend (migration):**
- `supabase/migrations/<novo>.sql` — tabela, RLS, RPCs, trigger de bloqueio, realtime, coluna `sector` em `cash_sessions`.

**Frontend:**
- `src/hooks/useSectorCashStatus.tsx` (novo)
- `src/components/caixa/CashGate.tsx` (novo — tela bloqueada reutilizável)
- `src/components/caixa/RequestCloseDialog.tsx` (novo)
- `src/routes/_app.vendas.tsx` / `_app.pdv.tsx` — envolver com `<CashGate sector="bar">`
- `src/routes/_app.portaria*.tsx` — envolver com `<CashGate sector="portaria">`
- `src/routes/_app.admin.caixas.tsx` (novo painel)
- `src/components/layout/AdminHeader.tsx` — sino de notificações

**Ajustes em fluxos atuais:**
- `open_cash_session` / `close_cash_blind` recebem `_sector`.
- `register_event_entry` busca sessão por `sector='portaria'`.
- PDV (bar) busca sessão por `sector='bar'`.

---

### Pergunta de escopo antes de implementar

1. Hoje só existe um caixa por funcionário (`opened_by`). Confirma que quero migrar para **um caixa por setor por bar** (ou seja, vários vendedores do bar compartilham a mesma sessão do bar)? Ou cada vendedor mantém sua própria sessão e o "setor" só serve pra gating?
2. A autorização de abertura/fechamento exige permissão `financeiro`, ou apenas o **owner** pode autorizar?
