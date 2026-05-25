# Campanhas de crédito de promoter

Substitui a "Regra de crédito" antiga. Cada **campanha** junta: valor + regras + janela de horário + lista de promoters + evento. Ao salvar, o valor é creditado no saldo dos promoters escolhidos como um **bucket separado** dos créditos de nomes.

## Dois buckets de saldo

| Bucket | Origem | Janela de horário | Regras de uso |
|---|---|---|---|
| **Nomes** | comissão por nomes na lista (já existe) | sempre disponível | sem restrição |
| **Campanha** | dono atribui via campanha (NOVO) | só dentro da janela da campanha | regras da campanha (min compra, % máx, exclusões) |

O promoter vê **um saldo total** ("R$ 80 disponível"), mas internamente cada lançamento tem `source` = `list_name` ou `campaign` + `campaign_id`.

## Exemplo do usuário

- Promoter tem R$ 30 (nomes) + R$ 50 (campanha "Sex até 22h")
- Venda R$ 160, regra 50%, campanha ainda dentro do horário
- Teto = 50% × 160 = **R$ 80**
- Pode abater R$ 80: R$ 50 da campanha + R$ 30 dos nomes
- Se a venda for às 23h (fora da janela): só R$ 30 disponíveis (só nomes), abate R$ 30, resto pago em dinheiro
- Se a venda for R$ 100, teto = R$ 50: abate R$ 50 (R$ 50 campanha, R$ 0 nomes), prioriza campanha

**Ordem de consumo**: campanha primeiro (incentiva uso antes de expirar), nomes depois.

## Múltiplas campanhas no mesmo evento

Promoter pode estar em 2+ campanhas. No PDV o vendedor **escolhe qual campanha aplicar** naquela venda — as regras (%, exclusões, janela) vêm da campanha escolhida; o saldo abatido sai do bucket dela + nomes.

Ao montar nova campanha, promoters já em outra campanha do mesmo evento aparecem **acinzentados com aviso** "já em [Campanha X]" mas podem ser selecionados mesmo assim.

## Janela de horário

Por campanha, opcionais:
- `valid_from` / `valid_until` (timestamps)
- `valid_weekdays` (int[], 0–6)

Vazio = vale durante todo o evento. Fora da janela, o bucket da campanha vira 0 no PDV (saldo "congelado", não perdido — volta quando a janela reabre, exceto se o evento acabou).

## Flag de promoções de bebidas (preparada pro futuro)

Campo `applies_to_promotions bool default false` na campanha. Quando a aba "Promoções de bebidas" existir, produtos em promoção ativa serão tratados como excluídos pra campanhas com a flag desligada. Já fica no banco e no `computeMaxCredit` agora.

---

## Banco

```sql
create table promoter_credit_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_id uuid not null,
  name text not null,
  credit_amount numeric not null,
  min_purchase numeric not null default 0,
  max_percent numeric not null default 100,
  excluded_product_ids uuid[] not null default '{}',
  excluded_category_ids uuid[] not null default '{}',
  valid_from timestamptz,
  valid_until timestamptz,
  valid_weekdays int[],
  applies_to_promotions bool not null default false,
  enabled bool not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table promoter_credit_campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references promoter_credit_campaigns(id) on delete cascade,
  promoter_id uuid not null,
  credited_amount numeric not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, promoter_id)
);
```

Coluna `source` (`'list_name'|'campaign'`) e `campaign_id` na tabela de lançamentos de crédito do promoter, pra preservar o bucket de origem.

RLS:
- Owner: CRUD nas campanhas e members do próprio `user_id`
- Promoter: SELECT só nas campanhas onde está em members

Trigger `validate_promoter_redemption` no INSERT do uso: recalcula subtotal elegível, confere janela, bloqueia se `total_abatido > max_percent × subtotal_elegivel`.

## Frontend

**Novos arquivos**
- `src/components/config/PromoterCampaignsPanel.tsx` — lista campanhas + botão "Nova"
- `src/components/config/PromoterCampaignDialog.tsx` — form completo:
  - nome, evento, valor
  - regras (min compra, % máx, exclusões de produtos/categorias)
  - janela de horário (3 campos opcionais)
  - flag "vale em produtos em promoção" (default off)
  - **Seletor de promoters**: lista rolável com toggle + aviso de duplicado

**Atualizar**
- `PromotersPanel.tsx` — botão "Regra padrão" vira "Campanhas de crédito"
- `PromoterCreditPicker.tsx`:
  - Filtra campanhas ativas para o evento + dentro da janela atual
  - Se 2+ ativas para o promoter → passo "escolha a campanha"
  - Mostra breakdown: "Campanha R$ X disponível agora · Nomes R$ Y"
  - `hardMax = min(saldoTotalDisponível, tetoDaVenda)`
  - Aplica abate priorizando bucket campanha
- `_app.pdv.tsx` — revalida no checkout (janela pode ter virado entre selecionar e fechar)
- `_app.meu-extrato.tsx` — coluna "Origem" mostrando nome da lista ou nome da campanha

## O que não muda

- Crédito ganho com nomes na lista: lógica e UX intactas
- Engine de exclusões reaproveitada (`computeMaxCredit`)
- Saldo único exibido ao promoter; buckets são detalhe interno

## Migração da regra antiga

`promoter_credit_rules` deixa de ser usada no PDV. Mantida no banco como fallback global opcional (free, 100%) — sem migração destrutiva. Botão da regra antiga removido da UI.
