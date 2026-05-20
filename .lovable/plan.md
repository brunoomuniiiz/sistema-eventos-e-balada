
# Fluxo de pedidos: numeração, QR e impressão de preparo

## 1. Numeração diária por bar (`#001`)

Banco:
- Nova coluna `daily_number INTEGER` em `sales` e em `lojinha_orders`.
- Nova coluna `daily_date DATE` em ambas (data local — usar `(now() AT TIME ZONE 'America/Sao_Paulo')::date`).
- Trigger `BEFORE INSERT` em cada tabela atribui:
  - `daily_date = hoje`
  - `daily_number = COALESCE(MAX(daily_number),0)+1` filtrando por `user_id` (owner) **e** `daily_date = hoje`, somando os dois canais. Para garantir contador único entre PDV e lojinha, criamos tabela auxiliar `daily_order_counter(user_id, date, last_number)` com `UPDATE … RETURNING` dentro de uma função `SECURITY DEFINER` chamada pelo trigger. Isso evita corrida.
- Helper SQL `format_order_no(n) → '#' || lpad(n::text,3,'0')`.

Front:
- Exibir `#NNN` em:
  - Histórico de vendas (`SalesHistory`) — substitui o `employee_name` como destaque principal da linha.
  - Tela do cliente `loja.$slug.pedido.$orderId` — badge grande no topo.
  - Painel `LojinhaOrdersPanel` (admin lojinha).
  - PDV ao finalizar venda (toast + tela de cupom).

## 2. QR code do pedido (PDV físico + lojinha online)

Conteúdo do QR: token opaco `pos:<sale_id>` ou `loja:<order_id>` (já existe `qr_token` em `lojinha_order_units` para retirada; aqui é um QR **do pedido inteiro**, não por unidade).

Banco:
- Nova coluna `pickup_token TEXT UNIQUE` em `sales` e `lojinha_orders` (gerada por trigger, `encode(gen_random_bytes(12),'base64url')`).
- Nova RPC `order_lookup_by_token(_token text)` (SECURITY DEFINER) usada pelo scanner do garçom. Verifica permissão `vendas` ou `lojinha` no owner do pedido e devolve `{ source, id, daily_number, items[], status }`.

Cupom impresso do PDV:
- Nova rota `/_app/pdv/cupom/$saleId` (componente "print-only", layout 80 mm).
- Conteúdo: nome do bar (logo opcional), `#NNN` enorme, data/hora, itens (qtd × nome), total, forma de pagamento, **QR code** (qrcode.react já está no projeto) com o `pickup_token`.
- Botão "Finalizar venda" no PDV chama `window.open(url, '_blank')` que faz `window.print()` no `onload` e fecha. Configurável por preferência de bar (toggle "imprimir cupom automaticamente").

Tela do cliente (lojinha):
- Após Pix aprovado, `loja.$slug.pedido.$orderId` mostra um único `<QRCodeSVG value={pickup_token} size={220} />` em destaque com texto "Mostre este código ao garçom" — substitui (ou complementa) a lista atual de QRs por unidade. Mantemos os QRs por unidade só se o usuário quiser uso por item; o padrão passa a ser **um QR por pedido**.

## 3. Scanner do garçom abre o pedido

- Já existe `LojinhaScanner.tsx`. Estender para reconhecer dois prefixos:
  - `pos:<token>` → chama `order_lookup_by_token`, navega para nova rota `/_app/pedidos/$source/$id`.
  - `loja:<token>` → mesma RPC, idem.
  - Tokens antigos por unidade continuam funcionando (rota atual de baixa).
- Nova rota `_app.pedidos.$source.$id.tsx` ("Tela de Liberação do Pedido"): mostra `#NNN`, itens com checkbox "entregue", botão **"Liberar pedido"** no rodapé.
- Permissão: `vendas` ou `lojinha`.

## 4. Impressão de preparo no botão "Liberar"

Ao clicar em **Liberar pedido**, o front:
1. Chama RPC `order_release(_source, _id)` que:
   - Marca o pedido como entregue/baixado conforme a origem.
   - Devolve `prep_slips: [{ slip_id, daily_number, bar_name, item_name, quantity, components: [{name, qty}], created_at }]` — **um item por combo** no pedido (`product_type='combo'`). Itens `simple` ficam fora.
2. Para cada `prep_slip`, abre uma janela imprimível: nova rota `/_app/preparo/$slipId` (ou query string com payload base64 para evitar persistência). Layout 80 mm: topo grande com **`#NNN`**, nome do combo, componentes do combo (vêm de `combo_items`), hora, garçom.
3. Estratégia "uma impressão por slip": iteração `for slip of slips → window.open(url,'_blank')` com pequeno `await` entre eles para o navegador respeitar o popup. Cada janela auto-executa `print()` no load e fecha.
4. Se não houver nenhum combo no pedido, nada imprime — só feedback "Pedido liberado" e baixa digital.

Observação sobre popup blocker: o botão "Liberar" é gesto direto do usuário, então a primeira abertura é permitida. Para múltiplos combos, abrimos em sequência dentro do mesmo handler — alguns navegadores podem pedir liberação de popups; mostramos aviso na primeira vez.

## 5. Recapitulando o que muda em código

```
supabase/migrations/<novo>.sql       # daily_number, daily_date, pickup_token,
                                     # tabela daily_order_counter, triggers,
                                     # RPC order_lookup_by_token, RPC order_release
src/routes/_app.pdv.tsx              # abre cupom em nova aba ao finalizar
src/routes/_app.pdv.cupom.$saleId.tsx          # NOVO — cupom 80mm + QR
src/routes/_app.preparo.$slipId.tsx            # NOVO — ficha de preparo 80mm
src/routes/_app.pedidos.$source.$id.tsx        # NOVO — tela liberar pedido
src/routes/loja.$slug.pedido.$orderId.tsx      # QR único + #NNN destaque
src/lojinha/components/LojinhaScanner.tsx      # reconhece pos:/loja:
src/lojinha/components/LojinhaOrdersPanel.tsx  # mostra #NNN
src/components/vendas/SalesHistory.tsx         # mostra #NNN
src/lojinha/api.ts                             # createPosOrder devolve pickup_token + daily_number
```

## 6. Detalhes técnicos importantes

- **Numeração atômica entre canais**: usar a tabela `daily_order_counter(user_id, date, last_number)` com `INSERT … ON CONFLICT (user_id,date) DO UPDATE SET last_number = last_number+1 RETURNING last_number` dentro de função SECURITY DEFINER chamada pelos triggers `BEFORE INSERT` das duas tabelas. Garante contador único por owner por dia, sem corrida.
- **Reset diário** usa `America/Sao_Paulo` (não UTC) para a "virada do dia" bater com a operação do bar.
- **Layout de impressão**: classe `print:` do Tailwind, `@page { size: 80mm auto; margin: 0 }`, `body { width: 80mm }`. Esconder navegação com `print:hidden` e remover backgrounds.
- **QR**: `qrcode.react` já está no projeto. Tamanho 180–220 px no cupom impresso.
- **Permissões**: `order_lookup_by_token` e `order_release` checam `has_permission(auth.uid(), user_id, 'vendas')` OU `'lojinha'` para o owner do pedido.
- **Realtime**: `LojinhaOrdersPanel` já assina mudanças; `daily_number` virá no select normal — nada a mudar.
- **Pedidos legados** (anteriores à migração) ficam com `daily_number = NULL`; exibimos fallback `#—` no UI.

## 7. Fora de escopo

- Integração com impressora térmica via driver (QZ Tray etc.). Mantemos `window.print()`; basta o navegador estar configurado para a impressora padrão correta.
- Layout customizável do cupom (logo, rodapé etc.) — fica para um próximo passo se você quiser.
