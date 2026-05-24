
Dividido em **3 partes** entregáveis separadamente. Cada uma é testável sozinha. Faça uma de cada vez pra não bagunçar.

---

## PARTE 1 — UX (cards, click-to-add, layout desktop, permissão Ao Vivo)

Mexe só em frontend e numa migration de coluna. Sem regra de negócio nova.

### 1.1 Card de produto **muito** mais compacto (PDV, Garçom, Lojinha Online)

Hoje o card tem foto 56px + nome + preço/botão em linhas separadas → ~72px de altura. Quero ~56px no mobile, mostrando 4 produtos sem rolar numa tela típica (≈540px de altura útil).

Novo layout do card (1 coluna no mobile):

```text
┌──────────────────────────────────────────────┐
│ [📷48] Heineken Long Neck      R$12,00  [+]  │
└──────────────────────────────────────────────┘
```

- Wrapper: `p-1.5 gap-2 items-center` (era `p-2 gap-2`)
- Foto: `h-12 w-12 rounded-md shrink-0`
- Bloco do meio: nome `text-sm font-medium truncate`
- Preço e ação **na mesma linha do nome**, à direita, com `ml-auto`
- Sem nome em duas linhas: força `truncate`

Vale para os 3: `_app.pdv.tsx`, `LojinhaPosView.tsx`, `loja.$slug.tsx`.

### 1.2 Clicar em qualquer parte do card adiciona ao carrinho

Hoje só o `+` adiciona. Mudança:

- O card inteiro vira `<button>` (ou `role="button"` num div com `onClick`).
- Clique no card chama `addToCart(produto)` — mesma função do `+`.
- Quando `inCart > 0`, o card vira o controle `[-] qtd [+]` na mesma linha — clique no número do meio **não** incrementa (só os botões), pra não passar do estoque sem querer.
- `e.stopPropagation()` nos botões `-` e `+` pra não disparar o clique do card.

Aplicado nos 3 arquivos acima.

### 1.3 Desktop: PDV ocupando a largura toda + sidebar recolhida com hover

**Problema 1**: PDV no desktop precisa rolar lateral. A causa é o `_app.tsx` deixando a sidebar fixa em ~256px sempre aberta, comendo largura.

**Problema 2**: sidebar do app permanece aberta no desktop.

Solução (no `AppLayout.tsx`):
- Sidebar passa a usar `collapsible="icon"` (shadcn já suporta) no breakpoint `lg+`.
- Estado padrão: **collapsed** no desktop.
- Hover na sidebar collapsed → expande temporariamente (`group-hover:w-64`) sem empurrar o conteúdo (overlay com `position: absolute`).
- Mobile continua igual (drawer).

### 1.4 PDV: carrinho cabendo na tela do notebook

No `_app.pdv.tsx`, o grid hoje é `grid-cols-1 lg:grid-cols-[1fr_400px]` ou parecido. Com a sidebar recolhida, sobra largura suficiente. Vou:
- Mudar pra `lg:grid-cols-[minmax(0,1fr)_360px]` (carrinho mais estreito).
- Lista de produtos com `grid-cols-2 xl:grid-cols-3` no desktop (cards compactos cabem 2 por linha mesmo em 1280px).
- Carrinho com `max-h-[calc(100vh-180px)] overflow-y-auto`.

### 1.5 Nova permissão "Ao Vivo"

Hoje a aba aparece pra todos os funcionários porque não tem gate.

**Migration** (`user_roles`):
- Adicionar coluna `vendas_ao_vivo boolean not null default false`.
- Backfill: `update user_roles set vendas_ao_vivo = true where role = 'owner'`.

**Frontend**:
- `usePermissions`: expor `canAoVivo = isOwner || flagOf("vendas_ao_vivo", false)`.
- `_app.tsx` (sidebar) e qualquer link pra `/ao-vivo`: esconder se `!canAoVivo`.
- `_app.ao-vivo.tsx`: `beforeLoad` redirect se `!canAoVivo`.
- `SellerPermissionDialog.tsx`: checkbox "Ver Ao Vivo".
- `useViewAs.tsx`: personas — `caixa` e `garcom` ficam **sem** ao vivo por padrão; só `dono` (e quem o dono explicitamente marcar).

---

## PARTE 2 — Área do Promoter (Configuração + Eventos + Extrato)

Independente da Parte 1. Mexe na navegação do app pra promoter.

### 2.1 Esconder o que promoter não deve ver

- Tab "Identidade" / "Funcionários" / "Maquininhas" do `_app.configuracao.tsx`: gate `isOwner`.
- Tab "Promoters" (lista de promoters do dono): gate `isOwner`. Promoter **não** adiciona outros promoters.
- Persona `promoter` em `useViewAs.tsx`: sem acesso a `/configuracao` admin nem `/funcionarios`.

### 2.2 Novo layout "Promoter Mode"

Quando `rolePreset === 'promoter'` (ou persona promoter), o app mostra **só 3 abas** na sidebar:

1. **Eventos** (`/_app/meus-eventos`)
2. **Extrato** (`/_app/meu-extrato`)
3. **Configuração** (`/_app/minha-conta`)

(Pode ser implementado filtrando os itens da sidebar no `AppLayout.tsx` baseado em `rolePreset`.)

### 2.3 Aba "Configuração" do promoter (`/minha-conta`)

Form simples editando o próprio `auth.users` + `profiles`/`user_roles`:
- Nome (display_name)
- Email (com confirmação por email do Supabase)
- Trocar senha
- Foto/avatar (upload pro Storage bucket `avatars`)

Estrutura extensível: componente `PromoterAccountPanel` com seções, fácil de adicionar campos depois (Pix, telefone, etc.).

### 2.4 Aba "Eventos" do promoter (`/meus-eventos`)

Lista os eventos onde ele está em `event_promoters`. Para cada evento:
- Nome, data, local, flyer.
- Botão "Entrar" → abre painel detalhado do evento (somente leitura na maior parte) **se** o evento estiver com `landing_published = true` ou um novo flag `promoter_panel_open = true` (campo a adicionar em `events`).
- Botão "Copiar link da minha lista" → `https://app/lista/{slug-do-promoter-no-evento}` (já existe `event_promoters.slug`).
- Contador: quantos nomes ele já lançou, quantos fizeram check-in.

Painel detalhado do evento (vista do promoter): nomes da SUA lista (CRUD), comissão estimada (calculada a partir de `event_promoter_commissions` + `event_entries`), saldo de crédito de campanha (depende da Parte 3).

### 2.5 Aba "Extrato" do promoter (`/meu-extrato`)

Lista cronológica de eventos passados/em andamento dele, com:
- Quanto ganhou (soma de `event_entries.amount_paid` × % comissão + valor fixo, baseado em `event_promoter_commissions`).
- Quanto gastou (consumo dele no bar — precisa ligar a `lojinha_orders` ou `sales` onde `customer_email/phone` bate com o promoter, OU melhor: criar tabela `promoter_consumptions` registrando explicitamente).
- Detalhamento por compra (data, produtos, valor pago, crédito usado).
- Total geral no topo: "Saldo: R$X (ganhou) − R$Y (gastou) = R$Z".

Pra essa aba ficar útil agora, na Parte 3 vou registrar todo uso de crédito numa tabela dedicada.

---

## PARTE 3 — Crédito de campanha por promoter/evento

Conceito (confirmado): **dois tipos de crédito separados**.

- **Tipo A — Comissão por nomes** (já existe): promoter põe 10 nomes × R$3 = R$30 livres, gasta no que quiser.
- **Tipo B — Crédito de campanha** (NOVO): dono dá R$50 pra promoter X naquela festa, **só vale em produtos específicos**, **não cobre a compra inteira** (promoter precisa pagar a maior parte com dinheiro próprio).

Esta parte só implementa o **Tipo B**. O Tipo A continua como está.

### 3.1 Migrations

```sql
-- Crédito atribuído por evento × promoter
create table promoter_event_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,           -- owner_id
  event_id uuid not null,
  promoter_id uuid not null,       -- referência ao user_id do promoter
  amount numeric not null,          -- R$50, R$30, etc
  min_purchase_multiplier numeric not null default 2,
  -- ex 2 = compra precisa ser >= 2× o crédito (50 → compra mín R$100)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, promoter_id)
);

-- Produtos/categorias EXCLUÍDOS desse crédito (blacklist por crédito)
create table promoter_event_credit_exclusions (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references promoter_event_credits(id) on delete cascade,
  product_id uuid,
  category_id uuid,
  -- exatamente um dos dois
  check ((product_id is not null) <> (category_id is not null))
);

-- Cada uso do crédito numa venda
create table promoter_credit_usages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  credit_id uuid not null references promoter_event_credits(id),
  promoter_id uuid not null,
  event_id uuid not null,
  sale_id uuid,                     -- venda no PDV
  order_id uuid,                    -- ou pedido lojinha
  amount_used numeric not null,
  amount_paid_by_promoter numeric not null,
  created_at timestamptz not null default now(),
  created_by uuid not null
);
```

RLS:
- `promoter_event_credits`: owner CRUD; promoter SELECT do seu próprio (`promoter_id = auth.uid()`).
- `promoter_event_credit_exclusions`: idem via credit_id.
- `promoter_credit_usages`: owner SELECT tudo; promoter SELECT seus; vendedor (PDV/garçom) INSERT.

### 3.2 Admin: gerenciar crédito (dono)

Dentro de `_app.eventos.$eventId.tsx`, nova seção **"Créditos de promoter"**:
- Lista de promoters do evento (de `event_promoters`).
- Para cada um: input "valor do crédito" + input "compra mínima multiplicador" + botão "Editar exclusões" (modal com checklist de produtos/categorias).
- Salvar = upsert em `promoter_event_credits` + reset de `promoter_event_credit_exclusions`.

### 3.3 Venda: aplicar crédito

No PDV e no Garçom, quando o cliente identificado é um promoter (precisa de UI pra "selecionar promoter da venda", ou ele se identifica via QR/login):

- Buscar crédito ativo desse promoter pro evento atual (`promoter_event_credits` filtrado por evento ativo + promoter).
- Calcular **subtotal elegível**: soma dos itens do carrinho que NÃO estão nas exclusões.
- Validar `subtotal >= credit.amount * min_purchase_multiplier`. Se não, mostrar "Compra precisa ser ≥ R$X pra usar crédito de R$Y".
- Aplicar: `amount_used = min(credit.amount, subtotal_eligible)`, resto vai pra pagamento normal.
- Pagamento restante: **só** dinheiro/pix/cartão (não pode combinar com comissão de nomes — checagem no SplitPaymentEditor).
- Ao finalizar venda: insert em `promoter_credit_usages` + reduzir saldo (se for uso único) ou registrar uso parcial.

**Decisão de uso único vs parcelado**: pela sua resposta entendi que o promoter "gasta tudo" — então é **uso único por evento**. Depois que usou, esgotou (mesmo que não tenha usado os R$50 inteiros). Se quiser permitir dividir em várias compras me avise antes de eu codar.

### 3.4 Extrato do promoter (Parte 2.5) consome esses dados

A aba Extrato passa a ler `promoter_credit_usages` pra mostrar gastos com crédito por evento.

---

## Ordem sugerida de execução

1. **Parte 1** primeiro (UX). Resolve a dor imediata e é a mais rápida. ~3 arquivos + 1 migration trivial.
2. **Parte 2** depois (área do promoter). Maior em arquivos novos mas sem regra complexa.
3. **Parte 3** por último (crédito). Tem 3 tabelas, regras de validação no carrinho, mexe em PDV/Garçom — é o mais arriscado.

Cada parte é uma aprovação separada. Não vou misturar.

## O que NÃO está nesse plano (confirmar se quer depois)

- Promoter usar crédito **na lojinha online** (só está no PDV/Garçom).
- Notificações pro promoter (WhatsApp quando crédito é concedido).
- Histórico de mudanças de crédito (auditoria).
- Limite de quantos itens de cada produto entram no crédito.

Manda qual parte começa.
