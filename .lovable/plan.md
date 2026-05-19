## O que já confirmei

Pelo banco + logs de rede da sua sessão atual:

- A política RLS de `products` já permite quem tem `vendas` **ou** `lojinha` ver os produtos do dono — então Marilia e bruno-happybeer (ambos `caixa_bar`, owner = `d51c…`) **deveriam** ver os 6 produtos cadastrados.
- A query do PDV (`src/routes/_app.pdv.tsx` linhas 127-138) é só `select` em `products`, sem filtro de `user_id` — confia no RLS.
- A requisição que está aparecendo no Network agora é da conta **owner** (`brunoeduardosantos3@gmail.com`, sub `d51c…`) e ela retorna os 6 produtos corretamente (HTTP 200). Ou seja, com o owner está tudo OK.

Logo, o "0 produtos" só acontece quando você loga como **staff** (happybeer.adm ou Marilia). E como o RLS, o `get_owner_id` e o `has_permission` estão corretos para esses usuários no banco, sobrou uma das seguintes causas:

1. O navegador ainda está com cache do react-query / sessão antiga onde a RLS antiga (que exigia `estoque`) negava — o hard refresh com staff pode não ter limpado o cache do Supabase Auth.
2. Algum gating do `usePermissions` ou da `PdvView` está rodando antes do `ownerId`/`can("vendas")` resolverem.
3. Alguma outra query (categorias, estoque, combo_items) está dando erro e mascarando a lista (improvável, mas vale instrumentar).

## Plano de diagnóstico (sem mexer em RLS — ela está correta)

### Passo 1 — Logar de fato como o staff e capturar o erro real

Quero ver o JWT do staff e a resposta de `GET /rest/v1/products` para esse usuário. Você precisa:

1. **Logout total** do bruno-owner.
2. **Login como `happybeer.adm@gmail.com`** (o "bruno caixa fixo").
3. Abrir `/vendas` e me dizer "ok, abri".

Eu então leio Network/Console e confirmo: o JWT está com `sub = 6ae3002e…`? A resposta de `products` veio `[]` ou 4xx? Se vier `[]` mesmo com JWT correto, é bug de RLS que não pegamos. Se vier 4xx (`401/403`), é outra coisa (token, cliente).

### Passo 2 — Instrumentar o PDV temporariamente

Se o Passo 1 não esclarecer, adiciono logs temporários em `src/routes/_app.pdv.tsx` para imprimir:

- `user?.id`, `ownerId`, `can("vendas")`, `loading` do `usePermissions`
- O `error` retornado pela query `pdv-products` (hoje o código faz `throw error` mas se acontecer silenciosamente o array volta vazio)
- O `data.length` recebido

Esses logs são removidos depois do diagnóstico.

### Passo 3 — Corrigir a causa raiz

A correção depende do que o Passo 1/2 mostrar. Cenários prováveis e ações:

- **JWT do staff vem certo e produtos vêm `[]`** → criar uma migration extra que também garante `SELECT` em `product_stock` e `product_categories` para `lojinha` (hoje `product_stock` só libera para `estoque` ou `vendas`; se a staff fosse só `lojinha`, faltaria). Não é o caso aqui (ambas as contas têm `vendas`), mas conferimos.
- **`ownerId` ou `can("vendas")` ficam `false` no front** → ajustar `usePermissions` para não retornar `null` em caso de múltiplas linhas e para garantir que o `loading` esteja respeitado antes do `enabled` da query.
- **Erro silencioso na query** → tratar e mostrar no toast/UI em vez de cair no "Nenhum produto cadastrado".

## Arquivos potencialmente afetados (só se necessário, após Passo 1)

- `src/routes/_app.pdv.tsx` — logs temporários e/ou mostrar erro real.
- `src/hooks/usePermissions.tsx` — apenas se o `ownerId` vier errado.
- `supabase/migrations/<nova>.sql` — apenas se descobrirmos um RLS faltando em `product_stock` / `product_categories` para o caso `lojinha`-only.

## Próximo passo concreto

Faz o **Passo 1**: deslogar do bruno-owner, logar como `happybeer.adm@gmail.com`, abrir `/vendas` e me avisar — sem essa amostra de rede com o staff logado, qualquer "correção" agora seria chute.
