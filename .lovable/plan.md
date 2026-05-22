
# Plano — Promoters, créditos e custo rápido

## 1) Regras de comissão por promoter (totalmente personalizáveis)

Cada promoter terá **uma tabela de comissão própria** com 4 linhas:

| Categoria | Tipo padrão | Valor padrão |
|---|---|---|
| Mulher — lista free (entrou sem pagar) | valor fixo | R$ 3,00 |
| Mulher — pagante | percentual | 25% do valor pago |
| Homem — lista free | valor fixo | R$ 2,00 |
| Homem — pagante | valor fixo ou % | R$ 5,00 (ou %) |

Para cada linha, o owner pode escolher:
- **Tipo:** `fixo` (R$) ou `percentual` (%)
- **Valor**

Esses 4 valores são o **padrão global** do promoter. Na tela do promoter haverá também a opção **"sobrescrever neste evento"** — caso queira alterar só para uma festa específica sem mudar o padrão.

**Quando o crédito é gerado:** automaticamente, a cada check-in na portaria (lista free) ou a cada venda de ingresso (pagante) atribuída ao promoter — exatamente como já é feito hoje na atribuição via `event_promoters` + `guest_list_entries` + `event_entries`.

## 2) Janela de validade — "últimos 2 eventos vigentes"

Regra: o crédito ganho em um evento fica válido durante **os 3 eventos seguintes** (incluindo o próprio). Quando o 4º evento começa, o crédito do evento original expira.

Na prática isso significa: **um promoter sempre pode gastar o que ganhou nos últimos 2 eventos finalizados + o evento em andamento**.

Implementação:
- Cada crédito tem `expires_at_event_id` (calculado no momento da geração: o evento atual + 2 eventos seguintes na ordem de data).
- Job leve roda no abrir/encerrar de evento: marca como `expired` os créditos cuja janela passou.
- Saldo do promoter = soma dos créditos `status = 'active'` − soma dos `redeemed`.

Na tela do promoter o owner vê:
- Saldo disponível agora
- Quebra por evento de origem com data de expiração
- Histórico de consumos

## 3) Crédito promoter como método de pagamento no PDV

### a) Permissão por funcionário
Em **Configuração → Equipe → permissões de pagamento** do funcionário, novo toggle:
- ☑ Pode aceitar **crédito promoter** como pagamento

(fica ao lado dos toggles de dinheiro/débito/crédito/pix que já existem)

### b) Fluxo na venda
No PDV, na tela de pagamento (junto com Dinheiro / Débito / Crédito / Pix) aparece um botão **"Crédito promoter"** (só se o vendedor tem a permissão).

Ao clicar:
1. Busca rápida do promoter (nome ou últimos consumos)
2. Mostra **saldo disponível** do promoter
3. Funcionário confirma o valor a abater (até o limite do saldo OU do total da venda)
4. Se a venda for maior que o saldo, o restante volta para split em outro método
5. Pode exigir **autorização** (mesmo AuthorizationDialog já usado) — escolho deixar opcional, configurável

### c) Registro
- A venda recebe um `sale_payment` com `method = 'promoter_credit'` e `promoter_id`
- Gera linha em `promoter_credit_redemptions` (consumo)
- Atualiza o saldo do promoter
- No fechamento de caixa, "Crédito promoter" aparece como linha separada (não conta como dinheiro físico, mas conta como faturamento do bar)

### d) Impacto no DRE/Financeiro
- A venda entra na receita normalmente pelo preço de tabela
- O crédito promoter abatido entra como **"Cortesia promoter"** no DRE do evento (custo de marketing/aquisição), usando o **CMV real dos produtos consumidos** (não o preço de tabela) — conforme você combinou na conversa anterior

## 4) Lançamento rápido de custo no Painel Ao Vivo (Opção A)

No `LiveDashboardPanel.tsx`, adicionar bloco fixo no topo:

```
┌─ Custo rápido ──────────────────────────────────┐
│  [ Valor R$ ____ ]  [ Categoria ▾ ]  [ Descrição ]│
│                                      [ + Lançar ]│
└──────────────────────────────────────────────────┘
```

- Apenas 3 campos: valor, categoria (dropdown com categorias do evento já cadastradas: DJ, Segurança, Som, Cachê, etc.), descrição livre opcional
- Botão único "Lançar" → insere em `event_costs` vinculado ao evento ativo
- Toast confirmando + mostra na lista de "Últimos custos da noite" logo abaixo
- Funciona em mobile (lançar do celular durante a festa) e desktop

Escolhi a forma **3 campos previsíveis** em vez do parser de linguagem natural porque:
- não falha
- é igual de rápida (3 toques)
- evita confusão na correria do evento

## Mudanças técnicas (resumo)

### Banco
- `promoters`: adicionar 4 colunas (woman_free_value, woman_paid_value, woman_paid_type, ... idem homem) + tipo (fixo/percent) por linha
- Nova tabela `promoter_credits`: id, promoter_id, event_id, amount, source ('checkin' | 'paid_entry'), source_ref, expires_after_event_id, status
- Nova tabela `promoter_credit_redemptions`: id, promoter_id, sale_id, amount, authorized_by
- `user_roles` / permissões do funcionário: nova flag `can_accept_promoter_credit`
- `sale_payments`: aceitar `method = 'promoter_credit'` + coluna opcional `promoter_id`

### Frontend
- `PromotersPanel` (config): UI da tabela de 4 linhas + saldo + histórico
- `EventPromotersManager`: opção "sobrescrever neste evento"
- `PdvPaymentDialog` (ou equivalente em `_app.pdv.tsx` / `SplitPaymentEditor`): novo botão "Crédito promoter"
- `TeamPanel`: toggle de permissão
- `LiveDashboardPanel`: bloco de custo rápido
- Triggers/funções: gerar crédito no check-in e na venda de ingresso, calcular expiração

## Sprint sugerido
1. **Sprint A (1 entrega):** tabela de comissão personalizada por promoter + geração automática de créditos + tela de saldo
2. **Sprint B:** crédito promoter como método de pagamento no PDV + permissão por funcionário
3. **Sprint C:** custo rápido no painel ao vivo + janela de expiração de 3 eventos automatizada

Posso começar pela Sprint A assim que aprovar.
