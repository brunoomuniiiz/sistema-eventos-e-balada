## Bloco 4 — Aplicar sub-permissões nas telas reais

### Diagnóstico do bug do happybeer
Em `/produtos`, os botões "Novo produto" e "Registrar compra" só aparecem se `canAddProducts = isOwner || (pode_adicionar_bebidas && can("estoque"))`. O funcionário tinha o módulo `estoque`, mas a flag legada `pode_adicionar_bebidas` ficou `false` — por isso nada apareceu. Trocar essa checagem pelas novas flags `produtos_*` resolve.

### 4.1 — Expandir `usePermissions` (base de tudo)

Adicionar ao `select` e expor como booleans (cada um = `isOwner || flagOf(...)`, todos com `can("estoque")` / `can("eventos")` / `can("promoters")` / `can("financeiro")` como gate de módulo quando aplicável):

- Produtos: `canProdutosConferir`, `canProdutosAddEntrada`, `canProdutosCriarEditar`, `canProdutosCriarCombo`, `canProdutosInventario`
- Eventos: `canEventosCriar`, `canEventosEditar`, `canEventosAbrirEncerrar`, `canEventosVerFinanceiro`
- Promoters: `canPromotersGerenciar`, `canPromotersComissoes`, `canPromotersVerDesempenho`
- Vendas (faltam): `canSangria` (já existe via flag antiga `vendas_sangria`, **trocar fonte para `vendas_sangria`** mantido), `canAbrirFecharCaixa` (novo, sobrescreve os atuais `canAbrirCaixa` / `canFechamento`), `canPromoterCreditoDinheiro`
- Financeiro: `canFinLancarDespesas`, `canFinVerNumeros`, `canFinFecharCaixa`

Também propagar no `useViewAs` para o modo "view as" continuar funcionando.

### 4.2 — Produtos (`src/routes/_app.produtos.tsx`)
- `canAddProducts` deprecado. Trocar:
  - Botão **"Registrar compra"** → `canProdutosAddEntrada`
  - Botão **"Novo produto"** (aba simple) → `canProdutosCriarEditar`
  - Botão **"Novo combo"** (aba combo) → `canProdutosCriarCombo`
  - Ações de **editar / ativar / desativar** no card → `canProdutosCriarEditar`
- Em `_app.estoque.tsx`: aba **Inventário** + botões iniciar/fechar inventário → `canProdutosInventario`. Tela de conferência geral → `canProdutosConferir`.

### 4.3 — Eventos (`_app.eventos.index.tsx` + `_app.eventos.$eventId.tsx`)
- Botão **"Novo evento"** → `canEventosCriar`
- Botão **"Editar evento"** + abrir dialog em modo edição → `canEventosEditar`
- Botões **"Abrir evento" / "Encerrar evento"** → `canEventosAbrirEncerrar`
- Aba/seção **Financeiro do evento** (custos, receita, lucro) → `canEventosVerFinanceiro`

### 4.4 — Promoters (`PromotersPanel` + páginas relacionadas)
- Adicionar / excluir promoter → `canPromotersGerenciar`
- Aba/seção **Comissões** (regras de crédito, campanhas) → `canPromotersComissoes`
- Painel **Desempenho** (ranking, leads, conversões) → `canPromotersVerDesempenho`

### 4.5 — Vendas (sub-permissões que faltaram no Bloco 2)
- `PromoterCreditPicker`: método **dinheiro** só se `canPromoterCreditoDinheiro` (hoje qualquer um com `aceita_credito_promoter` consegue). PIX/cartão continuam abertos para quem tem `aceita_credito_promoter`.
- `WithdrawalDialog` / botão **Sangria**: confirmar que usa `canSangria` (já está).
- `OpenCashDialog` / `CashClosingDialog`: trocar para `canAbrirFecharCaixa` único (hoje são duas flags separadas, ambas mapeiam para a nova).

### 4.6 — Financeiro (`_app.financeiro.tsx`)
Hoje é owner-only via gate de módulo. Manter assim mas, **se** o módulo estiver em `permissions[]` de um staff:
- Botão **"Lançar despesa"** / dialogs de investimento → `canFinLancarDespesas`
- Cards de números (receita, lucro, etc.) → `canFinVerNumeros`
- Botão **"Fechar caixa global"** → `canFinFecharCaixa`

### Garantias / fora de escopo
- Nenhuma mudança de schema (já feito no Bloco 1).
- Nenhuma mudança de RLS (gate grosso continua nos `permissions[]`).
- Nenhum recálculo de presets — quem foi criado antes do Bloco 1 fica com as novas flags em `false`. Owner abre o card do funcionário, clica no preset desejado e salva (re-aplica o mapa). Documentar isso pro happybeer ao final.

### Ordem de entrega proposta
1. **4.1** (hook) — base obrigatória
2. **4.2** (Produtos) — desbloqueia o caso do happybeer
3. **4.3 + 4.4 + 4.5 + 4.6** — em sequência

Posso entregar tudo num único turno ou ir por etapas — me diz qual prefere.
