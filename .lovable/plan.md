
# O que entendi (resumo das suas respostas)

1. **Inventário** vira fluxo guiado + **histórico** com autor e data; quando você confirma, o estoque fica **exatamente** com a contagem que você digitou (não “soma” a sobra, **substitui**).
2. **Consumação do promoter** = vale para **os 2 últimos eventos + o evento do dia** (3 no total, rolling). Configurável por promoter (posso aumentar/diminuir esse número de eventos pra um específico).
3. **Garçom** também valida QR code.
4. **Portaria** também vê a lista de nomes para dar check-in.
5. **Porteiro/relatórios:** vê **timeline** de lista e pagamentos (sem totais somados). Tudo que for valor agregado fica **mascarado com um ícone de olho**; clicar pede **email+senha do dono ou gerente** e libera só naquela sessão. Devolução/estorno também só com essa autorização.
6. **PIX:** cadastrar token **de produção** (real) e usar centavos (R$ 0,01) quando quiser testar. Adicionar uma flag global **“Modo teste”** que força todo valor pra R$ 0,01 mas mantém o fluxo pós-compra completo.

---

# Plano de execução

## 1. Inventário com fluxo guiado + histórico

**Fluxo (assistente em 4 passos):**

1. **Novo inventário** — botão “+ Novo inventário” abre diálogo:
   - Título (ex: “Fechamento de mês — Estoque principal”)
   - Local
   - Data/hora de início (default: agora)
   - Observação opcional
2. **Contagem** — tela cheia com todos os produtos do local zerados, busca, +1/+5/+10 e teclado numérico. Salva incremental como rascunho.
3. **Revisão** — tabela 3 colunas: **Sistema | Contado | Diferença** (unidades + R$ usando `cost_price`). Vermelho = faltando, verde = sobrando. Botões “Voltar” / “Confirmar”.
4. **Resumo final** — cards somando **Perda** (faltas × custo), **Ganho** (sobras × custo), **Resultado líquido**, total de unidades. Botão “Confirmar e ajustar estoque” → estoque vira **exatamente o valor contado** (substitui, não soma). Inventário fechado fica no histórico.

**Histórico:**
Lista abaixo com: Título, Local, Data início, Data fechamento, **Quem fez** (nome do funcionário), perda R$, ganho R$, líquido, status. Clicar abre versão somente leitura com tudo que foi contado.

*Técnico:* adicionar colunas em `stock_inventories`: `title`, `notes`, `started_at`, `closed_by_user_id`, `closed_by_name`, `loss_value`, `gain_value`, `net_value`. Histórico filtrável por mês.

---

## 2. Consumação do promoter (rolling 3 eventos)

- Saldo = soma dos créditos dos **2 últimos eventos passados** + **evento do dia em andamento**.
- Quando um 4º evento começa, o mais antigo expira automaticamente.
- Campo por promoter: `consumacao_window_events` (default 3) — você pode mudar pra 2, 4, etc., por promoter.
- Tela do promoter mostra: saldo atual, lista dos eventos que compõem (com data e valor), e aviso “credito de [evento X] expira após [próximo evento]”.

*Técnico:* nova função SQL `promoter_active_balance(_promoter_id, _window)` que pega últimos N eventos (incluindo o ativo) e soma créditos não consumidos. Substitui a RPC atual.

---

## 3. Página “Visão do Promoter”

Rota `/_app/promoter-view` (ou redirect ao selecionar persona Promoter):

- **Aba Eventos** — eventos vinculados:
  - Link da lista pessoal `/lista/{slug}` + botão WhatsApp
  - Nomes na lista / check-ins / conversão
  - Comissões a ganhar
- **Aba Consumação** — saldo, breakdown por evento, “expira em X dias / após próximo evento”
- **Aba Histórico** — festas anteriores

---

## 4. Personas ajustadas no “Ver como”

- **Garçom:** Vendas (modo garçom), Pedidos, Estoque (consulta), **Validar QR**. Remove Ao Vivo.
- **PDV Caixa:** PDV, Fechamento, Abrir caixa, Sangria, Pedidos, Histórico, **Validar QR**. Remove Ao Vivo.
- **Portaria/Porteiro:**
  - Vê: Validar QR, **Lista de nomes para check-in**, **Relatórios mascarados**
  - Relatórios = timeline de entradas + timeline de pagamentos (sem totais)
  - Cada valor somado / cada botão de estorno aparece com **🁢 ícone de olho** → clicar abre diálogo “Autorização” pedindo email+senha (do dono **ou** de funcionário com perm `financeiro` ou `pode_autorizar`); se ok, desbloqueia só naquela sessão da página.
- **Lojinha (vendedor):** sem mudança grande.

---

## 5. Lojinha — carrinho editável

No resumo do carrinho (antes do pagamento): + / − por item, lixeira por linha, “Limpar carrinho” com confirmação, subtotal ao vivo.

---

## 6. PIX — produção + Modo teste

- Cadastrar `MP_ACCESS_TOKEN` de **produção** (vou pedir via add_secret).
- Adicionar setting global por dono: **`test_mode_enabled` (boolean)** em `bar_settings`.
- Quando `test_mode_enabled = true`:
  - Todo PIX, Point e pagamento gerado força `transaction_amount = 0.01` (1 centavo)
  - Badge laranja “MODO TESTE — R$ 0,01” no topo do app
  - Fluxo pós-pagamento (confirmação, baixa de estoque, comissão, recibo) roda completo, pra você validar tudo
- Toggle fica em Configuração → Pagamentos.
- Logs do servidor expõem resposta crua do MP no diálogo quando der erro (“MP devolveu: …”) pra debug rápido.

---

## Ordem de execução

1. **Personas + Portaria com olho de autorização** (alta visibilidade)
2. **Carrinho da lojinha editável**
3. **Modo teste + token MP produção** (você cadastra a chave)
4. **Visão do Promoter** (rota dedicada + consumação rolling 3 eventos)
5. **Inventário guiado + histórico**

---

## Confirmar antes de codar

- **“Olho de autorização” na portaria:** quem pode autorizar — só dono, ou também funcionários com `pode_autorizar = true`? (sugestão: ambos, igual ao fluxo de desconto/sangria que já existe)
- **Modo teste:** quando ligado, vale pra **todo mundo** (lojinha cliente, PDV, garçom) ou só pras suas sessões de owner?
- **Cadastrar PIX produção agora:** posso já enviar o pedido do `MP_ACCESS_TOKEN` (você cola o token da sua conta MP de produção)?
