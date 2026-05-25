## Diagnóstico

"Ver como" troca o `persona` no `ViewAsProvider` (sessionStorage), e `usePermissions` aplica a máscara — isso funciona. O problema é que **nada visível muda na tela em que você está**:

- Você está em `/dashboard`. Essa rota não checa permissão por dentro, então mostra o mesmo conteúdo qualquer que seja a persona.
- Só o sidebar/bottom-nav filtra por `can(...)`. No mobile, com sidebar escondida, isso passa despercebido.
- Em "Garçom", até quando você navega para `/vendas`, a aba "Vender (garçom)" carrega vazia: o mask da persona **garcom** não liga `lojinha_can_sell`, então `canVenderGarcom` cai pra false e a query do cardápio não roda.
- A barra amarela "Visualizando como…" no topo só aparece em mask ativa, mas no celular em `/dashboard` ela é fácil de não notar (some atrás do header).

## Plano

1. **Auto-navegar ao trocar persona** — em `ViewAsBar.select(p)`, depois de `setPersona(p)`, chamar `navigate({ to: "/" })`. A rota `/` (`src/routes/index.tsx`) já tem a lógica de mandar cada perfil pra landing certa (owner→dashboard, caixa→pdv, garçom→lojinha, portaria→portaria). Assim cada persona realmente troca de tela.

2. **Corrigir mask do Garçom** em `src/hooks/useViewAs.tsx`: adicionar `lojinha_can_sell: true` aos flags da persona `garcom`. Sem isso, `canVenderGarcom` dá false e o cardápio fica vazio (mesmo bug que já tínhamos identificado para a aba "Vender (garçom)" — a persona precisa do mesmo flag que um garçom real tem).

3. **Tornar a barra "Visualizando como…" mais visível no mobile** — atualmente é uma faixa fina amarela fixa no topo (`top-0`). Mantém o lugar, mas aumenta padding vertical pra 8px, deixa em `sticky/z-[70]` por cima de qualquer header, e o link "sair" também volta o usuário pra `/` (mesma auto-navegação do passo 1) pra você ver imediatamente a visão de dono restaurada.

4. **Fora de escopo** — não mexo nas outras personas (caixa, portaria, promoter, lojinha) que já funcionam; não toco em RLS nem em queries de produto além de habilitar o flag do garçom.

Confirma que posso aplicar esses 3 ajustes?