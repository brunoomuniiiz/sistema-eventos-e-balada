## O que vou mudar

### 1. Categorias horizontais legíveis no celular (igual lojinha do cliente)
- Padronizar o chip de categoria em **todos os fluxos internos** (PDV, Vendas/garçom, Lojinha admin) para usar o mesmo componente `CategoryChip` da `loja/$slug.tsx`: fonte legível, padding confortável para dedo, rolagem horizontal com `snap` e sem barra visível.
- Tamanho mínimo do botão: altura ~36px, padding lateral generoso, fonte 14px medium — confortável pra tocar no telefone.
- Comportamento idêntico à lojinha do cliente: arrasta pro lado pra ver mais. Sem botão "Mais", sem quebrar em múltiplas linhas.
- Garantir `overflow-x-auto` no container das categorias e `overflow-x-hidden` no pai pra não puxar a tela inteira pro lado.

### 2. Remover persona "Lojinha (vendedor online)" do "Ver como" (mantendo em stand-by)
- Tirar a opção `lojinha` do menu visível em `ViewAsBar.tsx`.
- **Manter** a definição `lojinha` em `PERSONAS` e `PERSONA_DESTINATIONS` no `useViewAs.tsx` (comentada como "stand-by — reativar se precisar").
- Personas visíveis no menu ficam: Dono, Caixa (PDV), Garçom, Portaria, Promoter.
- Permissões reais por funcionário continuam sendo configuradas individualmente em `user_roles` (não muda nada lá).

## Arquivos previstos
- `src/components/sales/ProductCard.tsx` ou novo `src/components/sales/CategoryChipBar.tsx` — componente compartilhado de barra de categorias
- `src/routes/_app.pdv.tsx` — usar barra compartilhada
- `src/routes/_app.vendas.tsx` — usar barra compartilhada
- `src/lojinha/components/LojinhaPosView.tsx` — usar barra compartilhada
- `src/routes/loja.$slug.tsx` — usar barra compartilhada (já é a referência visual)
- `src/components/ViewAsBar.tsx` — esconder opção "Lojinha"
- `src/hooks/useViewAs.tsx` — comentar `lojinha` da lista visível, manter definição

## Critério de pronto
- Em qualquer tela de venda interna, no celular, as categorias aparecem em **uma linha só**, com swipe horizontal suave, sem empurrar o resto da tela pro lado.
- O menu "Ver como" não mostra mais "Lojinha (vendedor online)" — só Dono, Caixa, Garçom, Portaria, Promoter.
- Nenhum funcionário existente perde acesso (permissões individuais intactas).
