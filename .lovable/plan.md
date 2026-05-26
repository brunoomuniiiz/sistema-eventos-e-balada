## Plano final v2 — Bloco A (Pagamentos) + Bloco E (Impressoras)

Sequência: **D ✅ → B ✅ → C 🔄 → A → E**.

---

### Bloco A — Pagamentos externos e PIX chave

**A.1 — Cadastro de máquinas de cartão**

Nova tabela `payment_terminals`:
- `label` ("MP Point Bar", "Itaú Caixa", "Cielo do sócio")
- `provider` (`mercado_pago` | `manual`)
- `mp_device_id` (só se for MP Point com API)
- `owner_label` opcional ("CNPJ Bar" / "CNPJ Sócio") — pro relatório separar
- `accepts_credito`, `accepts_debito`, `is_active`

Tela: **Configuração → Maquininhas** (CRUD simples).

> ⚠️ **Verdade dura**: só **Mercado Pago Point** abre API pra "acordar" maquininha. Itaú/Cielo/Rede/Getnet não têm integração disponível pra pequeno comércio. Entram como `provider = 'manual'` → sistema mostra "Use a Cielo", operador digita o valor na máquina física.

**A.2 — Split em 2+ máquinas**

Estender `SplitPaymentEditor`: quando linha for "Débito" ou "Crédito", aparece dropdown da máquina. Operador pode adicionar várias linhas de cartão apontando pra máquinas diferentes (ex: R$ 100 MP + R$ 100 Itaú).

Cada linha já vira um `sale_payment` separado — só adicionar `terminal_id` na coluna.

**A.3 — PIX chave manual (com PIN)**

No diálogo PIX, adicionar 2ª aba **"Chave PIX"** que aparece só pra funcionários com flag `pode_pix_chave`.

Fluxo:
1. Escolhe "Chave PIX"
2. Preenche observação ("Nubank", "Sicredi", "Itaú Pessoa Física")
3. **Pede PIN do dono** (reusa `useOperationPin` + `grantViaPin`)
4. Salva como `payment_method = 'pix_chave'`, observação no `notes`

Nova flag em `user_roles`: `pode_pix_chave`. Adicionar no `SellerPermissionDialog`.

**A.4 — PIN simplificado (sem email)**

Ajustar `AuthorizationDialog`: remover campo de email, deixar só o input do PIN. O `grantViaPin` no servidor já trabalha só com PIN — é só simplificar UI.

**A.5 — Relatórios**

Financeiro e aba Caixas agrupam por terminal:
- "MP Point: R$ 1.230"
- "Itaú: R$ 540"
- "Chave PIX: R$ 230"

Só uma coluna extra nas queries existentes.

---

### Bloco E — Impressoras + Fichas personalizadas

**Premissa física**: cada aparelho (tablet do caixa, celular do garçom) tem sua impressora padrão configurada no SO. Várias impressoras podem ser a MESMA física — ex: copa tem 1 térmica Bluetooth e todos os celulares dos garçons + o tablet do caixa estão pareados nela. Sistema só dispara `window.print()`, navegador/SO decide pra onde manda.

**E.1 — Aba Configuração → Impressoras**

Lista simples só pra documentação interna (não controla nada via software):
- `name` ("Térmica Copa", "Térmica Bar", "Térmica Caixa Fixo")
- `location` (texto livre)
- `notes`

> Maquininhas de cartão **não entram aqui** — só imprimem comprovante delas.

**E.2 — Regras de impressão por funcionário × categoria**

Nova tabela `print_rules`:
- `user_role_id` (funcionário)
- `category_id` (categoria)
- `print_on_sale` (imprime ficha quando ele VENDE produto dessa categoria)
- `print_on_scan` (imprime ficha quando ele ESCANEIA QR de cliente trazendo produto dessa categoria)
- `unique(user_role_id, category_id)`

UI: dentro do `SellerPermissionDialog`, adicionar 2 sub-abas:
- **Imprimir ao vender** → lista todas categorias com toggle
- **Imprimir ao escanear** → mesma coisa

Default ao criar funcionário: tudo ligado (vai imprimindo tudo até o dono refinar).

**E.3 — Mecânica da impressão**

Já temos `printUnitTickets()` e `printPrepSlips()` em `src/lib/order-print.ts`.

Vamos:
1. Após cada venda fechada (PDV caixa ou garçom), checar regras do funcionário logado e gerar tickets só das categorias com `print_on_sale = true`
2. No `LojinhaScanner`, quando confirma entrega, mesma checagem usando `print_on_scan`

**Caso "halls/pirulito/trident"**: dono cria categoria "Doces e balas", desmarca `print_on_sale` pra caixa fixo e garçom. Pronto.

**Combos/baldes**: explosão em componentes já existe. Continua igual — cada componente vira ticket e respeita a regra da categoria do componente.

**E.4 — Cupom + fichas (PDV caixa)**

Mantém comportamento atual: ao fechar, abre 1 janela com cupom do cliente (com QR de retirada) + janela das fichas de copa filtradas. Operador imprime nas duas.

---

### Migrations

```sql
-- A.1
create table payment_terminals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  label text not null,
  provider text not null check (provider in ('mercado_pago','manual')),
  mp_device_id text,
  owner_label text,
  accepts_credito boolean default true,
  accepts_debito boolean default true,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- A.3
alter table user_roles add column pode_pix_chave boolean default false;
alter table sales add column terminal_id uuid references payment_terminals(id);
alter table sale_payments add column terminal_id uuid references payment_terminals(id);

-- E.1
create table printers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  location text,
  notes text,
  created_at timestamptz default now()
);

-- E.2
create table print_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_role_id uuid not null references user_roles(id) on delete cascade,
  category_id uuid not null references product_categories(id) on delete cascade,
  print_on_sale boolean default true,
  print_on_scan boolean default true,
  unique (user_role_id, category_id),
  created_at timestamptz default now()
);
```

Todas com RLS + GRANTs apropriados pra `authenticated` e `service_role`.

### Arquivos novos/alterados

- `src/components/config/PaymentTerminalsPanel.tsx` (novo)
- `src/components/config/PrintersPanel.tsx` (novo)
- `src/components/AuthorizationDialog.tsx` (remover campo email)
- `src/components/vendas/SellerPermissionDialog.tsx` (add `pode_pix_chave` + 2 sub-abas de impressão)
- `src/components/vendas/SplitPaymentEditor.tsx` (cartão com seletor de terminal)
- `src/components/vendas/PixQrDialog.tsx` (nova aba "Chave")
- `src/lib/print-rules.ts` (helper que decide quais tickets imprimir)
- `src/lib/order-print.ts` (aceitar filtro por categorias)
- `src/routes/_app.configuracao.tsx` (novas abas Maquininhas + Impressoras)

### Ordem de execução amanhã

1. **Manhã**: Bloco A (~2h) — máquinas + split + PIX chave + simplificar PIN
2. **Tarde**: Bloco E (~3h) — impressoras + regras + integração nos pontos
3. **Fim do dia**: teste de ponta a ponta (caixa vende → ficha sai filtrada → garçom escaneia → ficha sai com filtro)

---

### O que NÃO será feito

- ❌ Integração Itaú/Cielo/Rede — não há API pública viável
- ❌ Servidor de impressão centralizado — desnecessário; várias workstations podem apontar pra mesma impressora física
- ❌ Comando direto pra maquininha de cartão imprimir — hardware fechado