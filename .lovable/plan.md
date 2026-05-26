## Bloco 1 — Schema das sub-permissões + presets de cargo

### Situação atual (descoberta)

A tabela `user_roles` **já tem** quase tudo que precisamos:

- `permissions text[]` — gate de módulo grosso usado nas RLS (`has_permission(..., 'vendas')`, etc.). Mantém como está.
- `role_preset text` — coluna do preset (Garçom, Caixa/Garçom, etc.). Já existe.
- Vários booleanos de Vendas: `vendas_pdv_caixa`, `vendas_garcom`, `vendas_validar_qr`, `vendas_pedidos`, `vendas_historico`, `vendas_fechamento`, `vendas_ao_vivo`, `can_discount`, `can_authorize`, `aceita_dinheiro`, `aceita_pix`, `aceita_cartao`, `lojinha_can_sell`.
- Estoque/Financeiro/Eventos/Promoters: **só gate de módulo** via `permissions` (sem sub-toggles ainda).

### Mudanças no schema (migration única, aditiva)

Adicionar colunas booleanas faltantes, todas com default que preserva comportamento atual:

**Vendas (faltam):**
- `vendas_sangria boolean default false`
- `vendas_abrir_fechar_caixa boolean default false`
- `vendas_promoter_creditos_dinheiro boolean default false` ← novo (sua adição)

**Eventos:**
- `eventos_criar boolean default false`
- `eventos_editar boolean default false`
- `eventos_abrir_encerrar boolean default false`
- `eventos_ver_financeiro boolean default false`

**Produtos (renomeia módulo "estoque" no UI, mantém token `estoque` na RLS):**
- `produtos_conferir_estoque boolean default false`
- `produtos_adicionar_entrada boolean default false`
- `produtos_criar_editar boolean default false`
- `produtos_criar_combo boolean default false`
- `produtos_inventario boolean default false`

**Promoters:**
- `promoters_gerenciar boolean default false` (adicionar/excluir)
- `promoters_comissoes boolean default false`
- `promoters_ver_desempenho boolean default false`

**Financeiro:**
- `financeiro_lancar_despesas boolean default false`
- `financeiro_ver_numeros boolean default false`
- `financeiro_fechar_caixa boolean default false`

### Função de preset

Criar `public.apply_role_preset(p_user_role_id uuid, p_preset text)` que:
1. Valida `is_owner_of(auth.uid(), owner_id)` da linha.
2. Aplica o conjunto correspondente de `permissions[]` + booleanos. Mapa:

| Preset | permissions[] | booleanos chave |
|---|---|---|
| **garcom** | `{vendas, lojinha}` | `vendas_garcom=t`, `aceita_pix=t`; resto Vendas=f; promoter_creditos_dinheiro=f |
| **caixa_garcom** | `{vendas, lojinha}` | `vendas_pdv_caixa=t`, `vendas_garcom=t`, `aceita_pix=t`, `aceita_dinheiro=t` |
| **caixa_bar** | `{vendas, lojinha}` | `vendas_pdv_caixa=t`, `can_authorize=t`, `vendas_sangria=t`, `vendas_abrir_fechar_caixa=t`, `vendas_promoter_creditos_dinheiro=t`, todos os "aceita_*"=t |
| **caixa_portaria** | `{vendas, portaria}` | `vendas_pdv_caixa=t`, `vendas_validar_qr=t`, todos "aceita_*"=t |
| **gerente** | `{vendas, estoque, eventos, promoters, portaria, lojinha}` | tudo de Vendas=t (sem `vendas_promoter_creditos_dinheiro`?  sim, t), todos produtos_*=t, eventos_*=t, promoters_*=t. **Não inclui `financeiro`** (owner-only). |

3. Atualiza `role_preset = p_preset` na linha.

A função roda `SECURITY DEFINER` com `set search_path = public`.

### Backfill (uma vez)

Para linhas existentes onde `role_preset` está preenchido, rodar `apply_role_preset` para alinhar com os novos booleanos. Linhas sem preset ficam como estão (booleanos novos = `false`, comportamento idêntico ao de hoje).

### O que NÃO muda neste bloco

- Nenhuma RLS é tocada (continuam usando `has_permission` no módulo grosso).
- Nenhum componente React é editado.
- Nada relacionado a "remover aba Funcionários" ou "renomear Estoque → Produtos" (vai no Bloco 3 com UI).

### Validação após o migration

- `\d user_roles` mostra todas as colunas novas com default `false`/`true` corretos.
- `select apply_role_preset('<id>', 'garcom')` em uma linha de teste preenche os booleanos esperados e seta `role_preset='garcom'`.
- App existente continua rodando idêntico (nada lê os booleanos novos ainda).
