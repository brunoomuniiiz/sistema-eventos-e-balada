## Reorganização da navegação — Vendas, Painel ao vivo e Maquininhas

### 1. Novo item de menu: "Ao vivo"

Adicionar entre **Eventos** e **Vendas** no `AppLayout.tsx`:

- Rota nova: `src/routes/_app.ao-vivo.tsx`
- Ícone: `Activity` (lucide)
- Permissão: visível para owner ou quem tem `vendas`/`financeiro` (mesma regra que hoje filtra o `LiveDashboardPanel`)
- Componente reaproveita o `LiveDashboardPanel` existente — só envolvido em `PageHeader` ("Painel ao vivo", "Acompanhamento em tempo real do evento")

Remover a aba `painel` de `/vendas` (tab `painel` deixa de ser renderizada e some do `TabsList`).

### 2. Remover aba "Fechamento" de Vendas

Justificativa: o fechamento cego já é iniciado no dispositivo do operador via `RequestCloseDialog` dentro do `CashGate`, e a confirmação/autorização do dono acontece em **Caixas** (`CaixasAdminPanel`) — que já cobre abertura, sangria remota e confirmação de fechamento.

Mudanças em `src/routes/_app.vendas.tsx`:
- Remover `TabsTrigger value="fechamento"` e seu `TabsContent`
- Remover imports não usados: `LockKeyhole` (se sobrar só nesse uso), `CashClosingDialog`, `SessionWithdrawalsCard`, estado `closing`
- Ajustar o `defaultTab` (tirar `canFechamento` da equação)

`SessionWithdrawalsCard` segue existindo e continua acessível dentro do fluxo do operador (dispositivo). Nada é removido do banco/permissões.

Observação: a permissão `canFechamento` no `usePermissions` segue válida porque é checada também dentro do `RequestCloseDialog`. Não mexer nela.

### 3. Mover "Maquininhas" para Configuração

`/vendas` hoje tem aba `devices` (`LojinhaDevicesPanel`) só para owner.

- Remover `TabsTrigger value="devices"` e `TabsContent` de `_app.vendas.tsx`
- Adicionar em `src/routes/_app.configuracao.tsx` uma nova aba/seção "Maquininhas" que renderiza `LojinhaDevicesPanel` (visível só para owner)

### 4. Limpeza adicional sugerida

- A aba "Abandonados" (`LojinhaAbandonedPanel`) também é owner-only e pouco operacional — mantenho onde está por enquanto, mas vale considerar mover para Configuração junto com Maquininhas em uma próxima iteração. **Confirme se quer mover já.**

### Arquivos tocados

- `src/components/AppLayout.tsx` — adicionar item "Ao vivo"
- `src/routes/_app.ao-vivo.tsx` — nova rota (envolve `LiveDashboardPanel`)
- `src/routes/_app.vendas.tsx` — remove abas `painel`, `fechamento`, `devices`; ajusta `defaultTab` e imports
- `src/routes/_app.configuracao.tsx` — adiciona aba "Maquininhas" (owner)

Nenhuma migration, nenhuma mudança de permissão, nenhum componente deletado — só realocação.