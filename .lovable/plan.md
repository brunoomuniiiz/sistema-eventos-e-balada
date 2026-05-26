## Objetivo

Garantir, de forma **global**, que em qualquer página/dispositivo nunca apareça scroll horizontal — só vertical. Componentes que precisam rolar de lado internamente (como a roleta de categorias) continuam funcionando porque têm seu próprio container com `overflow-x-auto`.

## O que já está no projeto

- `src/styles.css` já tem `body { overflow-x: hidden }` e `html, body, #root { max-width: 100vw }`.
- `src/components/AppLayout.tsx` (corrigido agora há pouco) tem `min-w-0 overflow-x-hidden` no `<main>` e `min-w-0` no wrapper interno.

Mesmo assim o scroll lateral aparecia porque `overflow-x: hidden` ainda cria um *scroll container*: filhos com `min-w-max` (chips, tabelas largas, etc.) podem ser puxados de lado via toque/wheel. A solução robusta é usar `overflow-x: clip`, que **só recorta** sem permitir scroll.

## Mudança proposta — somente CSS global

`src/styles.css` (bloco `@layer base`):

1. Trocar `body { overflow-x: hidden }` por `overflow-x: clip` e replicar em `html` e `#root` para que nenhum nível raiz vire scroll container.
2. Manter `max-width: 100vw` em `html, body, #root` (já existe).
3. Adicionar fallback para navegadores sem suporte a `clip`:
   ```css
   @supports not (overflow: clip) {
     html, body, #root { overflow-x: hidden; }
   }
   ```

Resultado:

```css
html { color-scheme: dark; overflow-x: clip; }
body { ...; overflow-x: clip; }
html, body, #root { max-width: 100vw; overflow-x: clip; }
```

Nenhuma media query é necessária — `overflow-x: clip` é seguro em desktop também (não atrapalha o scroll vertical da página).

## O que NÃO muda

- `CategoryChipBar` e qualquer outro container com `overflow-x-auto` continua arrastando lateralmente normalmente, porque `clip` no ancestral só impede que o overflow vaze para fora, não impede scroll **dentro** do filho.
- Nenhum componente, hook ou lógica de negócio é tocado.

## Validação

- Aba **Vender (garçom)** no mobile (≤768px): arrastar nos chips só move a tira; arrastar fora dos chips não move nada lateralmente.
- Tablet (≈820px) e desktop: mesmo comportamento, sem regressão.
- Páginas com tabelas largas (Histórico de Vendas, Caixas): conferir se a tabela ainda rola dentro do próprio container — se não rolar, é porque a tabela não tinha um wrapper com `overflow-x-auto` próprio (problema separado, fora do escopo desta correção).
