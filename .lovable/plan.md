
# Fechamento de Evento — funcionário por funcionário (relatório da maquininha é a verdade)

## Lógica central
- Você fecha **um funcionário por vez** (vendedor, porteiro, garçom — qualquer um que operou).
- Para cada um:
  - **Dinheiro** (só se aceita receber dinheiro): você digita o contado real. Diferença vs esperado vira **ajuste no faturamento** dele.
  - **Maquininhas atribuídas**: o "vendido no sistema" aparece travado (read-only). Você digita o **valor do relatório da maquininha** — esse é o que **sobrescreve** o faturamento.
  - **PIX QR (MP)**: não aparece pra digitar. Puxa direto do webhook do MP e já entra como faturamento dele.
  - **PIX chave manual**: lista transação por transação com ✓ Recebi / ✗ Não recebi. "Não recebi" **subtrai do faturamento** (raro).
- No fim, o consolidado vira o faturamento real do evento e sobe pro Financeiro.

## 1. PIN de operação (já tem RPC, falta UI)
- Card em **Configuração → Segurança**: definir / trocar / remover PIN do owner (4–8 dígitos), usando `set_owner_pin` / `has_owner_pin`.
- Adicionar aba **PIN** no `AuthorizationDialog` (hoje só email+senha). Quando o owner tem PIN, vira o padrão. Liga em `grant_via_pin`.
- Com isso você fecha caixa no celular do funcionário sem ter que deslogar/logar.

## 2. Funcionário "aceita dinheiro"
- Em `user_roles` (ou tabela `employees`), adicionar `accepts_cash boolean default false`.
- TeamPanel: toggle "Pode receber dinheiro" por funcionário.
- Quem não aceita dinheiro pula o passo de dinheiro no fechamento dele.

## 3. Aba "Fechamento" dentro do Evento (só owner)
Local: `src/routes/_app.eventos.$eventId.tsx` — nova tab `Fechamento`.

Layout:
```
EVENTO: Sexta 30/05 — Happy Beer
─────────────────────────────────
Faturamento bruto: R$ X (sistema) → R$ Y (relatório)  Δ +Z
─────────────────────────────────
FUNCIONÁRIOS A FECHAR
[ ] Bruno (vendedor)            Pendente   →
[✓] Léo (porteiro)              Fechado    Δ 0
[ ] Ana (vendedora)             Pendente   →
[ ] Caixa solto (PIX chave)     Pendente   →
```

Clicando num funcionário abre o fechamento dele.

## 4. Tela "Fechar funcionário"

Passo único, scroll vertical (mobile-first, dá pra fazer no celular do funcionário também):

```
BRUNO — vendedor

💵 DINHEIRO (aceita)
  Esperado:   R$ 1.350,34
  [ Contado: R$ ________ ]   ← você digita
  Diferença: +169,66 (vai pro faturamento)

🟦 MAQUININHA 1 (Cielo parceiro)
  Sistema:    R$ 2.388,66  🔒
  [ Relatório: R$ ________ ]  ← verdade
  Diferença vira ajuste no faturamento

🟦 MAQUININHA 2 (MP integrada)
  Sistema:    R$ 1.200,00  🔒
  [ Relatório: R$ ________ ]  ← verdade

🟩 PIX QR (Mercado Pago)        R$ 800,00  🔒 (automático)

🟪 PIX CHAVE — conferir 1 a 1
  22:14 — R$ 50    [✓ Recebi] [✗ Não]
  22:31 — R$ 120   [✓ Recebi] [✗ Não]
  ...

[ Confirmar fechamento — PIN _ _ _ _ ]
```

Regras:
- Tudo que está com 🔒 é só leitura.
- O valor de cada maquininha digitado **sobrescreve** o faturamento do sistema daquele terminal pra esse funcionário no evento.
- PIX chave "Não recebi" estorna a venda (status `refunded_pix_chave`) e tira do faturamento.

## 5. Consolidação no Financeiro
- Quando todos os funcionários do evento estão "Fechado", o evento ganha status `closing_done`.
- Atalho **"Ver fechamento"** aparece no card do evento dentro de `_app.financeiro.tsx` (eventos).
- Faturamento do evento no Financeiro usa o **valor reconciliado** (relatório > sistema), não o cru.

## 6. Banco

Migration:
- `user_roles.accepts_cash boolean default false` (ou em `employees`)
- Nova tabela `event_closings`:
  - `event_id`, `user_id` (owner), `staff_user_id` (quem foi fechado), `cash_counted numeric`, `cash_diff numeric`, `pix_chave_refunded jsonb` (sale_ids), `closed_at`, `closed_by`, `pin_used boolean`
- Nova tabela `event_closing_terminals`:
  - `closing_id`, `terminal_id`, `system_total numeric`, `reported_total numeric`, `diff numeric`
- RPC `get_event_staff_to_close(event_id)` → lista funcionários que operaram no evento + status (pendente/fechado)
- RPC `get_staff_closing_breakdown(event_id, staff_id)` → totais por terminal, PIX QR, PIX chave do funcionário no evento
- RPC `submit_staff_closing(event_id, staff_id, cash_counted, terminals jsonb, pix_chave_confirmed uuid[], _grant_token)` → grava e marca PIX chave não-recebido como estornado
- Trigger: quando todos os staff do evento têm closing, evento vira `closing_done` e financials são recalculados com valores reportados.

## 7. Arquivos

**Criar:**
- `src/components/config/OperatorPinPanel.tsx` (UI do PIN)
- `src/components/eventos/EventClosingTab.tsx` (lista de funcionários)
- `src/components/eventos/StaffClosingSheet.tsx` (tela do fechamento individual)
- Migration com tabelas + RPCs

**Editar:**
- `src/components/AuthorizationDialog.tsx` (aba PIN)
- `src/components/config/TeamPanel.tsx` (toggle "aceita dinheiro")
- `src/routes/_app.eventos.$eventId.tsx` (nova tab Fechamento)
- `src/routes/_app.financeiro.tsx` (atalho "Ver fechamento" no card do evento)

## Ordem
1. Migration (accepts_cash + event_closings + RPCs)
2. PIN UI + aba PIN no AuthorizationDialog
3. Tab "Fechamento" no evento + lista de funcionários
4. Sheet de fechamento individual (dinheiro + maquininhas + PIX chave)
5. Atalho no Financeiro + recálculo do faturamento do evento

## Confirmar antes
1. **Onde mora `accepts_cash`** — em `user_roles` (por bar) ou em `employees`? Sugiro `user_roles` porque é onde já estão as permissões.
2. **PIX chave "Não recebi"** estorna a venda **automaticamente** ou só marca como pendente pra você decidir depois?
3. **Reabrir fechamento de um funcionário** — só owner, com PIN, sem limite? Ou trava depois de X horas?
