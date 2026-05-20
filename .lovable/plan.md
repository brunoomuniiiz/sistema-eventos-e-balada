# Lojinha do garçom sem produtos — diagnóstico e correção

## Causa raiz

A query do `LojinhaPosView` (aba **Lojinha → Vender**) faz:

```ts
.from("products")
.select("id, name, ..., category:product_categories(name)")
```

O PostgREST responde com erro:

```
PGRST200: Could not find a relationship between 'products' and 'product_categories'
```

porque a tabela `products` **não tem foreign key** declarada para `product_categories(id)`. Sem FK, o PostgREST não resolve o embed e devolve 400. O `useQuery` cai no `throw error`, a UI fica com a lista vazia e exibe "Nenhum produto disponível para venda online". As 6 bebidas já estão com `ativo_geral=true` e `visivel_mobile_garcom=true`, então o problema é puramente no embed.

## Correção (1 migration + nada de código)

Migration SQL:

```sql
-- Limpa órfãos antes de criar FK (defensivo)
UPDATE public.products p
   SET category_id = NULL
 WHERE category_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.product_categories c WHERE c.id = p.category_id);

ALTER TABLE public.products
  ADD CONSTRAINT products_category_id_fkey
  FOREIGN KEY (category_id)
  REFERENCES public.product_categories(id)
  ON DELETE SET NULL;
```

Isso é tudo — assim que a FK existir, o PostgREST recarrega o cache e o embed `category:product_categories(name)` passa a funcionar na lojinha do garçom, no admin e em qualquer outra query que precisar.

## Validação

1. `curl` direto no REST com o embed deve retornar 200 com `category: { name }` ao invés de PGRST200.
2. Abrir **Lojinha → Vender** como funcionário garçom → os 6 produtos aparecem com chips de categoria.
3. Conferir que o PDV (`_app.pdv.tsx`) e a Lojinha pública (`loja.$slug.tsx`) continuam funcionando — eles não usam esse embed, então só ganham o benefício colateral.

## O que NÃO vou mexer

- Nenhum arquivo `.tsx` — o bug é só no schema.
- Nenhuma RLS (já está correta: `vendas` + `lojinha` liberam SELECT em `products`).
- Nenhuma flag de visibilidade dos produtos.
