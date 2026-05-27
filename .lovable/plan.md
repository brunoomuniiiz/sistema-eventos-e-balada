## Problema
Funcionária Marília tem permissão **Eventos**, mas não enxerga nada na página de eventos.

Causa: as policies RLS de `events` (e tabelas relacionadas) só liberam para o dono (`auth.uid() = user_id`) ou para promoters linkados. Não existe regra que considere staff com permissão `eventos`, então a query volta vazia.

## Regra de permissão (confirmada com você)
- Quem tem permissão **Eventos** → **vê** tudo do módulo (lista, detalhes, custos, financeiro, promoters, lista de convidados).
- Para **editar/criar/encerrar/lançar custos** continua valendo as sub-flags já existentes em `user_roles` (`eventos_criar`, `eventos_editar`, `eventos_abrir_encerrar`, `eventos_ver_financeiro`) — sem elas, a tela mostra os dados mas os botões/ações ficam bloqueados (o frontend já checa isso via `usePermissions`).

## Correção (1 migration de RLS, sem mudar frontend)

### `events`
- **SELECT**: dono OU staff com permissão `eventos` no owner. *(libera Marília a enxergar a página)*
- **INSERT**: dono OU staff com `eventos_criar`.
- **UPDATE**: dono OU staff com `eventos_editar` ou `eventos_abrir_encerrar`.
- **DELETE**: só dono.

### `event_costs`
- **SELECT**: dono OU staff com `eventos` (qualquer um do módulo já vê os custos listados).
- **INSERT/UPDATE/DELETE**: dono OU staff com `eventos_editar`.

### `event_financials`
- **SELECT**: dono OU staff com `eventos_ver_financeiro` (financeiro do evento é dado sensível).
- **INSERT/UPDATE/DELETE**: dono OU staff com `eventos_ver_financeiro` + `eventos_editar`.

### `event_promoters` e `event_promoter_commissions`
- Adicionar **SELECT** para staff com `eventos` (mantendo as policies de promoter já existentes).
- **INSERT/UPDATE/DELETE**: dono OU staff com `eventos_editar`.

### `guest_list_entries`
- Adicionar **SELECT** para staff com `eventos` (mantendo as policies de promoter e portaria já existentes).
- Sem INSERT/UPDATE extra — checkin continua sendo da portaria, criação continua sendo do promoter/dono.

## Onde fica o PIN de operação (pergunta lateral)
O PIN de operação se cadastra em **Minha Conta** (toque no avatar no topo da tela → "Minha conta" → seção **PIN de operação**), não na tela de Configurações. Quem precisa do PIN é o dono — funcionários não usam.

## Fora de escopo
Nenhuma mudança em código frontend. Marília só precisa recarregar a página depois da migration.
