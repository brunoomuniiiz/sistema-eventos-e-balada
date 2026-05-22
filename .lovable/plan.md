## Objetivo
Permitir que você (owner) entre em um modo de pré-visualização e veja o sistema exatamente como cada papel envolvido: promoter, garçom, caixa, portaria, lojinha (vendedor online) e também as páginas públicas do cliente (lojinha, evento, lista).

Tudo client-side, sem mudar banco nem permissões reais. É só uma "máscara" que sobrescreve o que `usePermissions` retorna enquanto você está logado como dono.

## O que será criado

### 1. Hook de impersonação
`src/hooks/useViewAs.tsx` — contexto global que guarda o persona ativo em `sessionStorage` (`null` = sem máscara). Personas:

- `promoter` — só vê Promoters + Lista de check-in do seu evento
- `garcom` — Ao Vivo + Pedidos + estoque visual (sem financeiro, sem caixa)
- `caixa` — PDV + Fechamento + Sangria + Abertura (sem financeiro mensal)
- `portaria` — Portaria + Validar QR
- `lojinha` — vendedor da lojinha online (aceita pedidos, vê pedidos liberar)
- `dono` (default) — visão completa

Cada persona é um mapa de flags equivalente ao schema de `user_roles` (permissions array + vendas_*, aceita_*, can_*, etc.).

### 2. Patch no `usePermissions`
Quando `viewAs` estiver ativo **e** o usuário for owner real, o hook devolve as flags da persona em vez das reais. `isOwner` vira `false` para a máscara funcionar (exceto persona "dono"). Um campo extra `realIsOwner` é exposto para o seletor poder aparecer só pra você.

### 3. Barra flutuante "Ver como"
`src/components/ViewAsBar.tsx` montada no `AppLayout`:

- Aparece só se `realIsOwner === true`
- Botão fixo no canto inferior direito com o persona atual
- Ao abrir: lista de personas + atalhos para páginas públicas do cliente:
  - Abrir Lojinha (`/loja/{slug}` em nova aba)
  - Abrir página do evento (`/e/{slug}`)
  - Abrir lista do promoter (`/lista/{slug}`)
  - Slugs vêm de uma query rápida (lojinha ativa + último evento)
- Banner no topo enquanto persona ≠ dono: "Visualizando como GARÇOM — sair"

### 4. Sidebar/menu responde à máscara
`AppLayout` já usa `usePermissions` para filtrar itens — então com o patch acima a navegação se ajusta automaticamente. Verifico só se há checagens diretas de `isOwner` em telas críticas e troco por `can(...)` quando fizer sentido para o teste ser realista.

## O que NÃO muda
- Banco, RLS, papéis reais dos funcionários
- Nenhuma escrita acontece em nome de outro usuário
- Ao recarregar, persona persiste por aba (sessionStorage) — fácil de sair

## Arquivos
- Criar: `src/hooks/useViewAs.tsx`, `src/components/ViewAsBar.tsx`
- Editar: `src/hooks/usePermissions.tsx` (aplicar máscara + expor `realIsOwner`), `src/components/AppLayout.tsx` (montar ViewAsBar + Provider), `src/routes/__root.tsx` se precisar do Provider mais alto

## Ordem
1. `useViewAs` + Provider
2. Patch `usePermissions`
3. `ViewAsBar` com seletor + atalhos públicos
4. Testar cada persona navegando pelo menu
