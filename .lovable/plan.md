## O que vai mudar em Produtos e Estoque

### 1. Lupa de busca em "Produtos"
Acima da lista, uma barra com ícone de lupa. Filtra em tempo real por nome, categoria e unidade — sem recarregar. Quando vazia, mostra a lista completa como hoje.

### 2. Toggle "Controlar estoque" no formulário do produto
Hoje o sistema decide automático (simples = sim, combo = não). Vamos expor isso como um switch **Sim / Não** logo abaixo de "Tipo do produto":
- Default sempre **Sim** (não atrapalha quem só clica salvar).
- Se desligado: o produto não aparece em Estoque, não bloqueia venda por falta, não entra em inventário, e não é puxado para a Entrada de Compra (item 3).
- Útil para coisas como "couvert", "rolha", "consumação mínima", água de cortesia etc.

### 3. Novo fluxo "Entrada de Compra" (estilo Zig)
Ponto de entrada: **botão "Registrar compra"** no topo de Produtos (ao lado da lupa).

Abre um painel lateral (Sheet à direita) com duas áreas:

**(a) Adicionar item**
- Lupa de produto (só lista produtos com "controlar estoque" ligado).
- Quantidade.
- Valor pago — com toggle **"Valor total"** ⇄ **"Valor por unidade"**. O sistema calcula o outro automaticamente.
- Botão **Adicionar à compra**.

**(b) Carrinho da compra (lista lateral)**
Cada linha mostra: produto · qtd · unitário · total. Botões **lápis** (edita) e **lixeira** (remove). Rodapé com **subtotal acumulado**.

**(c) Confirmar compra**
Botão **Revisar e confirmar** abre o "atalho do financeiro" pedido — uma tela curta com os mesmos campos do lançamento de despesa:
- Fornecedor (lupa, igual ao Financeiro)
- Já paguei? (Sim / Não — se "Não", aparece **Vencimento**)
- Forma de pagamento (Pix, dinheiro, débito, crédito, boleto…)
- Categoria de despesa (default "Compra de mercadoria / CMV")
- Data da compra
- Observação

Ao salvar:
1. **Estoque** — cada item entra no **local de estoque padrão** (sem perguntar).
2. **Custo do produto** — atualiza `cost_price` de cada item com o **último valor unitário pago** (pra deixar o CMV vivo).
3. **Financeiro** — cria **uma única despesa** em `bar_expenses` com o **valor total da compra**, vinculada ao fornecedor, com a descrição listando os itens.
4. Histórico — a compra fica registrada para auditoria e para a aba "Histórico de entradas".

### 4. Aba "Entradas" em Estoque (histórico)
Lista de compras já feitas: data, fornecedor, total, quem registrou. Clicando expande os itens. Permite **estornar** uma compra (devolve o estoque e cancela a despesa) com confirmação do dono.

---

### Detalhes técnicos
- **Tabelas novas** (migration):
  - `stock_purchases` (id, user_id, supplier_id, supplier_name, total_amount, expense_id FK→`bar_expenses`, notes, created_by, created_by_name, created_at).
  - `stock_purchase_items` (id, purchase_id FK, product_id FK, product_name_snapshot, quantity, unit_cost, total_cost).
  - RLS: dono + permissão `estoque` (visualizar/criar); dono pode estornar.
- **RPC `register_stock_purchase`** transacional: insere `stock_purchases` + `stock_purchase_items`, faz `UPDATE product_stock` por item no local padrão, atualiza `products.cost_price`, insere `bar_expenses` e devolve `purchase_id`.
- **RPC `reverse_stock_purchase`** (owner only): decrementa estoque, marca purchase como `reversed`, deleta a despesa vinculada.
- **Front**:
  - `src/components/produtos/ProductSearchBar.tsx` (lupa reaproveitável — input controlado).
  - `src/components/estoque/PurchaseSheet.tsx` (Sheet à direita com cart + revisão).
  - `src/components/estoque/PurchaseHistoryTab.tsx` (aba "Entradas" em Estoque).
  - Em `_app.produtos.tsx`: adicionar lupa + botão "Registrar compra"; expor switch `track_stock` no formulário.
  - Em `_app.estoque.tsx`: nova `TabsTrigger value="entradas"`.
- Reaproveita `ExpenseFormDialog` para a tela de revisão (mesmos campos do Financeiro), pré-preenchendo categoria "Compra de mercadoria".

### Fora do escopo agora
- Editar `cost_price` direto na linha do carrinho — fica só no produto.
- Importar nota fiscal / XML.
- Múltiplos locais de destino numa mesma compra.