# Cargos, permissões modulares e abertura/fechamento de caixa por cargo

## 1. Cargos (presets) finais
No painel **Configuração → Funcionários**:

- **`garcom`** — só `lojinha` (validar QR + ver pedidos).
- **`garcom_caixa`** — `lojinha` + `vendas`. Vende no PDV e valida QR.
- **`caixa_bar`** (= "caixa fixo") — `vendas` + `lojinha`. Vende no PDV e pode validar QR se precisar.
- **`caixa_portaria`** — `portaria` + `vendas` (para abrir caixa, vender entrada e fazer sangria/fechamento com autorização, igual ao bar).
- **`gerente`** — todas as permissões + `can_authorize=true` + desconto até 100%.
- **`custom`** — marca tudo manualmente.

> Métodos de pagamento aceitos (dinheiro / pix / cartão) **não** entram no preset — ficam como toggles individuais por funcionário, configuráveis pelo dono em qualquer momento.

## 2. Permissões modulares por usuário (checkbox)
Já existem no array `permissions`:
- `pode_gerenciar_estoque` → `estoque`
- `pode_criar_eventos` → `eventos`
- `pode_vender_portaria` → `portaria`
- `pode_validar_qr` → `lojinha`

Adicionar como colunas novas em `public.user_roles`:

| Coluna | Default | Significado |
|---|---|---|
| `pode_adicionar_bebidas` | false | Criar produtos novos (edição continua liberada por `estoque`). |
| `aceita_dinheiro` | true | Aceita dinheiro no PDV. |
| `aceita_pix` | true | Aceita Pix no PDV. |
| `aceita_cartao` | true | Aceita débito/crédito no PDV. |

**Fechamento de caixa:** removido como flag editável — passa a ser regra fixa:
> Qualquer fechamento de caixa (bar ou portaria) **exige autorização** (e-mail + senha) de alguém com `can_authorize=true` (dono ou gerente). Já é assim hoje no `close_cash_blind`; só vou garantir que nenhuma UI permita pular esse passo.

## 3. Caixa da portaria com mesmo conceito do bar
Hoje a portaria vende entradas direto (`event_entries`), sem sessão de caixa formal. Vou unificar:

- **Abertura**: ao entrar em `/portaria`, se o usuário tem `vendas` + `portaria` e não tem caixa aberto, abre `OpenCashDialog` (já existe) **exigindo autorização** + valor inicial. Usa `open_cash_session` que já está implementado e já valida `vendas`.
- **Venda de entrada**: o `INSERT` em `event_entries` passa a também gravar `session_id` (nova coluna) e cria um registro espelho em `sales` com `category='entrada'` para entrar no fechamento. Mais simples: gravar direto em `sales` (category `entrada`) e manter `event_entries` como um detalhe ligado ao `sale_id` (FK opcional).
- **Sangria**: botão de sangria na tela de portaria reusando `WithdrawalDialog` (já abre `AuthorizationDialog`).
- **Fechamento**: aba "Fechamento" também na portaria, mesmo `CashClosingDialog` (já pede autorização).

> Decisão de schema: adicionar `event_entries.session_id uuid NULL` e gravar uma `sales` row por entrada. Isso mantém histórico de entradas e faz o dinheiro/cartão/pix da portaria aparecer no fechamento cego automaticamente, sem duplicar lógica.

## 4. Redirect pós-login (`src/routes/index.tsx`)
1. `isOwner` ou preset `gerente` → `/dashboard`
2. preset `caixa_portaria` → `/portaria`
3. preset `caixa_bar` / `garcom_caixa` ou `can('vendas')` → `/pdv`
4. preset `garcom` ou `can('lojinha')` sem vendas → `/lojinha`
5. Cascata atual para `estoque`, `eventos`, `financeiro`, `funcionarios`, `promoters`
6. Fallback `/dashboard`

(Sem rota `/validar` — o scanner fica em `/lojinha` aba "Validar QR".)

## 5. Aplicação dos toggles de pagamento
- **PDV (`_app.pdv.tsx` + `SplitPaymentEditor.tsx`)**: filtra opções por `aceita_dinheiro/pix/cartao`. Se sobrar só 1, pré-seleciona.
- **Portaria**: mesma filtragem no diálogo de cobrança de entrada.

## 6. Migração SQL (resumo)
```sql
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS pode_adicionar_bebidas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aceita_dinheiro        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_pix             boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_cartao          boolean NOT NULL DEFAULT true;

UPDATE public.user_roles SET aceita_dinheiro = can_sell_cash;

ALTER TABLE public.event_entries
  ADD COLUMN IF NOT EXISTS session_id uuid NULL,
  ADD COLUMN IF NOT EXISTS sale_id    uuid NULL;
```
+ ajuste em `add_event_entry` (ou novo RPC) para também criar `sales` com a forma de pagamento escolhida e amarrar `session_id`.

## 7. Arquivos a tocar
- Nova migração SQL (passo 6)
- `src/hooks/usePermissions.tsx` (expor `acceptedMethods`, `canAddProducts`)
- `src/components/config/TeamPanel.tsx` (presets novos + checkboxes modulares + novos campos)
- `supabase/functions/invite-staff/index.ts` (persistir colunas novas)
- `src/routes/index.tsx` (redirect)
- `src/routes/_app.pdv.tsx` + `src/components/vendas/SplitPaymentEditor.tsx` (filtra métodos)
- `src/routes/_app.portaria.tsx` (abertura/sangria/fechamento de caixa + métodos filtrados)
- `src/routes/_app.produtos.tsx` (oculta "novo produto" se `!canAddProducts`)
- `src/routes/_app.vendas.tsx` (fechamento continua exigindo autorização — sem mudança de regra)

## Fora do escopo
- Renomear permissões internas (continuam em inglês no BD).
- Mudar RLS (controle continua nas funções + UI).
- Multi-estoque (já consolidado em um local único).

Confirma?