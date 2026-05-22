
## Contexto

Hoje em `Vendas > Configuração > Permissões` existe uma tabela com switches direto na linha (Vender PDV, Vender online, Dinheiro, Pix, Cartão). Você quer:

1. Que **cada funcionário** tenha um botão "Editar permissões" que abre uma página/diálogo dedicado com TODAS as opções dele.
2. Dentro desse diálogo configurar acessos por aba do módulo Vendas + métodos de pagamento.
3. Garantir que quem tem permissão veja todas as abas de Vendas (PDV Caixa, Vender garçom, Validar QR, Pedidos, Histórico, Fechamento).

Verifiquei o seu usuário `happybeer.adm@gmail.com`: ele é `staff` com `permissions = {vendas, lojinha}` e `lojinha_can_sell = true`. Pela lógica atual ele já deveria ver PDV, Vender (garçom), Validar QR, Pedidos e Histórico. Se está vendo só "venda rápida", é porque a aba `Fechamento` está condicionada a `canSellCash` e algumas abas (Abandonados, Maquininhas, Configuração) só aparecem para `isOwner`. Vamos abrir essas para staff com permissão também (controlado pelas novas flags abaixo).

## O que será feito

### 1. Banco — novos campos por funcionário em `user_roles`

Migração adicionando flags granulares (todas `boolean default true` para não quebrar quem já existe):

- `vendas_pdv_caixa` — pode usar a aba PDV Caixa
- `vendas_garcom` — pode usar a aba Vender (garçom) — substitui o uso atual de `lojinha_can_sell`
- `vendas_validar_qr` — pode usar o scanner de QR
- `vendas_pedidos` — pode ver/gerir a lista de Pedidos online
- `vendas_historico` — pode ver Histórico de vendas
- `vendas_fechamento` — pode fazer Fechamento de caixa
- `vendas_abre_caixa` — pode abrir caixa (valor inicial)
- `vendas_sangria` — pode solicitar sangria

Os campos existentes continuam sendo a fonte da verdade para método de pagamento: `aceita_dinheiro`, `aceita_pix`, `aceita_cartao`.

Regras:
- Owner ignora todas as flags (acesso total, como hoje).
- Staff sem a permissão base (`vendas` ou `lojinha` em `permissions`) continua bloqueado — as novas flags são sub-permissões dentro do módulo Vendas.

### 2. Hook `usePermissions` — expor as novas flags

Adicionar derivados:
```
canPdvCaixa, canVenderGarcom, canValidarQr, canVerPedidos,
canVerHistorico, canFechamento, canAbrirCaixa, canSangria
```
Cada um = `isOwner || (tem permissão base && flag === true)`.

### 3. `_app.vendas.tsx` — exibir abas pela flag fina

Trocar as condições atuais:
- `showPdvCaixa` → `canPdvCaixa`
- `showPdvGarcom` → `canVenderGarcom`
- aba Validar QR → `canValidarQr`
- aba Pedidos → `canVerPedidos`
- aba Histórico → `canVerHistorico`
- aba Fechamento → `canFechamento && canSellCash`
- Abandonados / Maquininhas / Configuração → permanecem `isOwner`

### 4. Novo componente: `SellerPermissionDialog`

Substitui a tabela larga atual. A lista de funcionários vira cards/linhas enxutos:

```
[Avatar]  Nome do funcionário              [ Editar permissões ]
          email · cargo
          chips resumo: PDV · Garçom · QR · Pix · Dinheiro
```

Ao clicar em **Editar permissões** abre Dialog responsivo (full-screen no mobile) com seções:

**Acesso às abas de Vendas**
- [x] PDV Caixa
- [x] Vender (garçom / online)
- [x] Validar QR (entregar pedido)
- [x] Pedidos online
- [x] Histórico
- [x] Fechamento de caixa

**Trabalho com dinheiro** (mostrado só se PDV Caixa OU Vender garçom)
- [x] Pode abrir caixa (com autorização do dono/gerente)
- [x] Pode solicitar sangria

**Formas de pagamento que pode receber**
- [x] Dinheiro
- [x] Pix
- [x] Cartão (débito/crédito)

**Desconto** (já existe no banco — apenas trazer para o mesmo diálogo)
- [x] Pode dar desconto · até [__]%

Footer com `Salvar` + `Cancelar`. Owner aparece na lista, mas com diálogo bloqueado mostrando "Acesso total — não pode ser editado".

### 5. `SellerPermissionsPanel.tsx` — refatorar

- Remove a tabela horizontal.
- Mostra grid/lista de funcionários (mobile-first, já que sua viewport é estreita).
- Controla abertura do `SellerPermissionDialog`.
- Mantém o atalho "Funcionários (avançado)" para Configuração.

### 6. Atualizar `OpenCashDialog` / `WithdrawalDialog`

- Abertura de caixa: respeitar `canAbrirCaixa` (se desligado para o staff, esconde o botão "Abrir caixa" — mas a autorização do owner por email+senha continua funcionando como hoje).
- Sangria: respeitar `canSangria` no botão.

### 7. Migração de dados

Como todas as flags têm `DEFAULT true`, funcionários existentes mantêm o comportamento atual. Nada mais a migrar.

## Arquivos afetados

- `supabase/migrations/<new>.sql` — adiciona 8 colunas em `user_roles`
- `src/hooks/usePermissions.tsx` — expor novos derivados
- `src/routes/_app.vendas.tsx` — condicionar abas pelas novas flags
- `src/components/vendas/SellerPermissionsPanel.tsx` — refatorar para lista + botão
- `src/components/vendas/SellerPermissionDialog.tsx` — **novo**
- `src/components/vendas/OpenCashDialog.tsx` — esconder botão se `!canAbrirCaixa`
- `src/components/vendas/SessionWithdrawalsCard.tsx` (ou onde está o botão de sangria) — idem

## Fora de escopo

- Não muda o fluxo de autorização por email+senha (continua igual).
- Não mexe na lojinha pública nem no checkout do cliente.
- Não remove a tela "Funcionários (avançado)" em Configuração — segue para gerenciar criação/exclusão.

Se aprovar, eu implemento exatamente isso. Quer que eu adicione também algo como "duplicar permissões de outro funcionário" para configurar rápido vários iguais, ou deixamos manual nesta primeira versão?
