## Objetivo

Gerar um único arquivo `.sql` contendo **toda a estrutura + todos os dados** do banco atual, pronto pra ser restaurado no seu novo projeto Supabase com um único comando.

## O que vou fazer (build mode)

1. **Buscar credenciais de conexão direta** do banco atual (host, porta, db, user, senha) via variáveis de ambiente do sandbox / `project_info`.
2. **Rodar `pg_dump`** com as flags corretas para um dump portável entre projetos Supabase:
   - `--schema=public` (só seu schema — não exporta `auth`, `storage`, `realtime` que o novo projeto já tem)
   - `--no-owner --no-privileges` (evita conflito de roles entre projetos)
   - `--quote-all-identifiers`
   - Inclui: tabelas, colunas, defaults, PKs, FKs, índices, RLS policies, funções (`has_role`, `get_owner_id`, `has_permission`, etc.), triggers, enums, sequences, **e todos os dados** (INSERTs).
3. **Salvar em** `/mnt/documents/nightops_dump_completo.sql`.
4. **Verificar o arquivo**: contagem de linhas, tamanho, e checar se contém as 58 tabelas + as funções críticas (`has_role`, `get_owner_id`).
5. **Entregar via `<presentation-artifact>`** para você baixar direto do chat.
6. **Anexar instruções de restauração** no novo projeto Supabase:
   ```bash
   psql "postgresql://postgres:[SENHA]@db.[NOVO-REF].supabase.co:5432/postgres" \
        -f nightops_dump_completo.sql
   ```

## Avisos importantes

- **Tamanho**: com dados de vendas/pedidos/estoque, o arquivo pode ficar entre 5–50 MB. Sem problema pra download.
- **Não inclui**: usuários do `auth.users` (são gerenciados pelo Supabase Auth e têm IDs que só existem no projeto atual) nem arquivos do Storage. Se você tem usuários cadastrados, eles precisarão **se cadastrar de novo** no novo projeto, OU usar o Auth Admin API para migrar (posso te ajudar depois, mas é passo separado).
- **IDs preservados**: como uso `INSERT` com os UUIDs originais, todas as FKs continuam válidas. Mas como `auth.users` não vai junto, qualquer coluna `user_id` ficará "órfã" até os usuários se recadastrarem com o mesmo UUID — o que **não é trivial**. Recomendação: migrar primeiro o owner via Auth Admin com o mesmo UUID, depois restaurar o dump.
- **Não vou apagar nada** no projeto atual. É 100% read-only.

## Risco e fallback

Se `pg_dump` não estiver disponível no sandbox ou as credenciais diretas não vierem, faço fallback: gero o schema via queries `pg_dump`-equivalentes em SQL + `COPY ... TO STDOUT` por tabela, e monto o `.sql` manualmente. Resultado equivalente, só mais lento.

Pode aprovar que eu gero o arquivo.