Vou tratar isso como bug de aplicação da mudança, não como ajuste visual pequeno.

## O que encontrei

1. A barra de categorias foi criada, mas ainda pode não aparecer “diferente” porque ficou visualmente parecida com antes e sem uma indicação clara de que dá para arrastar.
2. O container do PDV principal (`/pdv`) ainda não tem `w-full max-w-full overflow-x-hidden` no wrapper principal, então algum filho ainda pode puxar a tela lateralmente.
3. O botão flutuante `Ver como` continua mostrando a sigla da persona ativa. Se você estava em `lojinha` salvo na sessão antes da remoção, ele pode continuar mascarado como `lojinha`, mesmo ela não aparecendo mais no menu.
4. A rota antiga `/lojinha` ainda redireciona para `/vendas`, então a área “lojinha” continua existindo como configuração/página do cliente, mas não deveria aparecer como persona de vendedor.

## Plano de correção

### 1. Forçar o modo antigo `lojinha` a sair da sessão
- Se a sessão tiver `viewAsPersona = lojinha`, trocar automaticamente para `garcom`.
- Manter a definição `lojinha` em stand-by no código, mas impedir que fique ativa por sessionStorage antigo.

### 2. Blindar o layout mobile contra overflow lateral
- Adicionar `w-full max-w-full overflow-x-hidden` no wrapper principal do PDV (`/pdv`).
- Garantir que a tela de venda do garçom já continue com esse bloqueio.
- Se necessário, aplicar `min-w-0` nos containers ao redor das listas.

### 3. Deixar categorias claramente iguais à lojinha do cliente
- Ajustar `CategoryChipBar` para uma única linha com rolagem horizontal real.
- Deixar os botões mais “de telefone”: altura confortável, fonte legível, sem quebrar texto.
- Adicionar um pequeno fade na lateral direita para sinalizar que tem mais categorias para arrastar, sem botão “Mais”.
- Preservar o comportamento de arrastar para o lado.

### 4. Remover qualquer sensação de “vendedor online” no painel interno
- Manter o menu `Ver como` exibindo só: Dono, Caixa (PDV), Garçom, Portaria, Promoter.
- Garantir que, ao entrar como Garçom, a tela vá direto para `/vendas?tab=vender`.
- Não mexer nas permissões reais dos funcionários.

## Arquivos a alterar

- `src/hooks/useViewAs.tsx`
- `src/components/sales/CategoryChipBar.tsx`
- `src/routes/_app.pdv.tsx`
- possivelmente `src/lojinha/components/LojinhaPosView.tsx` apenas se precisar reforçar o container

## Resultado esperado

- Mesmo se seu navegador ficou com a persona antiga salva, ela sai de `lojinha` e vira `garcom`.
- No celular, categorias não puxam mais a tela para o lado.
- Categorias ficam numa linha só, arrastáveis, com indicação visual de continuidade.
- O “Ver como” não volta a mostrar “Lojinha (vendedor online)”.