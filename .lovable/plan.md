# O que está acontecendo

## 1) PIX da lojinha online não abre — causa raiz encontrada

Erro: `function gen_random_bytes(integer) does not exist`.

A extensão `pgcrypto` está instalada no schema **`extensions`** (padrão novo do Supabase), mas 7 funções do banco chamam `gen_random_bytes(...)` sem prefixo. Como o `search_path` dessas funções não inclui `extensions`, o Postgres não encontra a função e a criação do pedido falha — por isso você não passa nem do botão "Pagar com PIX" no carrinho.

Funções afetadas (todas em `public`):
- `lojinha_create_order` ← usada pela lojinha online (cliente final)
- `lojinha_create_pending_order`
- `lojinha_create_pos_order` (duas versões)
- `lojinha_confirm_payment`
- `lojinha_confirm_delivery_pos`
- `assign_daily_number_and_token`

Isso também explica por que ontem falhou tudo do zero: nada conseguia gerar o `pickup_token` aleatório.

## 2) Não consigo excluir pedidos da lojinha

Verificado no código: **não existe** nenhum botão de "excluir pedido" nem em `LojinhaOrdersPanel` nem em `LojinhaAbandonedPanel`. Só existe "marcar conferido" e "conciliar pelo MP", que apenas mudam status — não removem.

---

# Plano

## Passo 1 — Migration: qualificar `extensions.gen_random_bytes`

Recriar as 7 funções usando `extensions.gen_random_bytes(...)` no lugar de `gen_random_bytes(...)`, mantendo o resto do corpo idêntico. Mesma migration adiciona `SET search_path = public, extensions` em cada uma como defesa em profundidade.

Sem mexer em `pgcrypto` em si (mover extensão entre schemas é arriscado e quebraria outras coisas).

## Passo 2 — Excluir pedidos (admin)

**Server function** `deleteLojinhaOrder(orderId)` em `src/lib/pix.functions.ts` (auth + verifica que é owner/admin):
- Se `status='pending'`: chama `lojinha_release_order_reservation` antes
- Apaga `pix_charges` do pedido, `lojinha_order_items`, `lojinha_order_units`, e por fim `lojinha_orders`
- Bloqueia exclusão de pedidos `paid`/`delivered` por padrão (exige um flag `force:true` que vem do diálogo "tem certeza?" com aviso forte)

**Server function** `deleteAllLojinhaOrders({ scope })` com escopos:
- `'abandoned'` — só os abandonados
- `'pending'` — pendentes (libera reservas)
- `'all_test'` — todos (só com confirmação dupla)

**UI:**
- `LojinhaOrdersPanel`: ícone de lixeira em cada card → `AlertDialog` confirmando + nota "isso é permanente"
- `LojinhaAbandonedPanel`: lixeira por item + botão "Limpar todos abandonados" no topo
- Toast de sucesso/erro e refetch

## Passo 3 — Validar

- Reproduzir: ir como cliente na lojinha online, montar carrinho, clicar "Pagar com PIX" → deve criar pedido e abrir QR
- Testar exclusão individual e em massa
- Confirmar que histórico/financeiro não quebra (pedidos pagos ficam protegidos por padrão)

---

## Detalhes técnicos

```sql
-- exemplo de uma das 7 funções
CREATE OR REPLACE FUNCTION public.lojinha_create_order(...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  ...
  -- antes:  encode(gen_random_bytes(16), 'hex')
  -- depois: encode(extensions.gen_random_bytes(16), 'hex')
  ...
$$;
```

Arquivos novos/alterados:
- `supabase/migrations/<ts>_fix_gen_random_bytes.sql` (novo)
- `src/lib/pix.functions.ts` (+ deleteLojinhaOrder, + deleteAllLojinhaOrders)
- `src/lojinha/components/LojinhaOrdersPanel.tsx` (+ botão excluir)
- `src/lojinha/components/LojinhaAbandonedPanel.tsx` (+ excluir individual e em massa)
