
## Diagnóstico

Olhando o banco, todos os funcionários convidados como `caixa_bar` têm **duas linhas** em `user_roles`:

```text
user_id  | role  | role_preset | owner_id
---------+-------+-------------+----------
<vendor> | owner |             | <vendor>    ← criada pelo trigger handle_new_user
<vendor> | staff | caixa_bar   | <dono>      ← criada pelo invite-staff
```

O que acontece no login:
1. `usePermissions` faz `.eq("user_id", user.id).maybeSingle()`.
2. Com 2 linhas, `maybeSingle()` retorna erro → `data` = null.
3. `rolePreset`=null, `isOwner`=false, `can("vendas")`=false.
4. O `src/routes/index.tsx` cai no fallback final → `/dashboard`.

Ou seja: o redirect está certo, mas a permissão chega vazia porque há linhas duplicadas e a query rejeita.

Causa raiz: o trigger `handle_new_user` cria automaticamente uma linha `owner` para QUALQUER usuário novo no `auth.users`, inclusive os criados pela função `invite-staff`.

## O que vou corrigir

### 1. Trigger `handle_new_user` — não criar owner para convidados
Atualizar o trigger para olhar `raw_user_meta_data->>'invited_by'` (ou flag equivalente que o `invite-staff` setar) e, se for um convite, pular a criação do owner row e dos seeds de categorias padrão.

### 2. `invite-staff` edge function — marcar o convite
Passar `user_metadata: { invited_by: <ownerId> }` no `admin.auth.admin.inviteUserByEmail` / `createUser` para que o trigger reconheça.

### 3. Limpeza dos dados existentes
Migração que apaga a linha `owner` redundante de cada `user_id` que também é `staff` de outro `owner_id`:

```sql
DELETE FROM public.user_roles a
WHERE a.role = 'owner'
  AND EXISTS (
    SELECT 1 FROM public.user_roles b
    WHERE b.user_id = a.user_id
      AND b.role = 'staff'
      AND b.owner_id <> a.user_id
  );
```

### 4. `usePermissions` — robustez contra múltiplas linhas
Trocar `.maybeSingle()` por `.limit(2)` e escolher: se houver linha `staff`, ela ganha; caso contrário usar a linha `owner`. Assim, mesmo se sobrar algum duplicado no futuro o app continua funcionando.

## Resultado esperado

- Caixa fixo (`caixa_bar`) logando → `/pdv`.
- Caixa portaria → `/portaria`.
- Garçom → `/lojinha`.
- Owner / gerente → `/dashboard`.
- Convites novos não criam mais bar paralelo para o funcionário.

## Arquivos afetados

- `supabase/migrations/<nova>.sql` (atualiza `handle_new_user`, limpa duplicados).
- `supabase/functions/invite-staff/index.ts` (passa `invited_by` no metadata).
- `src/hooks/usePermissions.tsx` (preferir staff quando houver múltiplas linhas).

Fora do escopo: mudar RLS, criar tela de troca de tenant, mexer em outras telas.
