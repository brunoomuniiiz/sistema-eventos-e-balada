
# Lojinha — PDV do garçom-caixa

Tudo continua isolado em `src/lojinha/`. Adiciona um **modo caixa** dentro do app do garçom: ele monta a venda, cobra na Point Smart (cartão) ou gera Pix MP, e fecha apertando "Entreguei".

## Permissões (3 níveis dentro de `lojinha`)

Em `user_roles.permissions` continua existindo só `lojinha`. Os sub-níveis ficam em colunas/flags próprias do `user_roles` (sem inventar permissão nova solta):

- `lojinha_can_sell` (bool) — pode abrir o PDV da lojinha.
- `lojinha_payment_methods` (text[]) — `['pix']`, `['pix','card']` ou `[]`.
- Quem tem `lojinha` mas sem `lojinha_can_sell` → **só scanner** (entrega QR do cliente online), igual hoje.
- Maquininha vinculada (`lojinha_point_device_id`) só faz sentido se `'card'` estiver nos métodos.

Tela do convite/edição de funcionário ganha um bloco "Lojinha" com 3 checkboxes (Validar QR, Vender no Pix, Vender no cartão) + dropdown da maquininha quando cartão estiver marcado.

## Cadastro de maquininhas (owner)

Nova aba em `/_app/lojinha` → **Maquininhas**:
- Lista de Point Smart cadastradas (nome amigável + `device_id` da MP + garçom vinculado).
- Botão "Sincronizar com Mercado Pago" puxa `GET /point/integration-api/devices` e mostra os aparelhos disponíveis para o owner escolher.
- Cada maquininha pode ser vinculada a 1 garçom (ou ficar livre para owner usar).

Secret necessário (no fim, junto com o resto): `MERCADO_PAGO_ACCESS_TOKEN` (mesma conta da loja online já cobre tudo: Pix Checkout Pro + Point API + webhook).

## PDV do garçom-caixa (`/lojinha-pdv` no app)

Layout mobile, parecido com o PDV atual:

1. Lista de produtos marcados `sell_online` (com `online_price` se houver).
2. Carrinho lateral.
3. Botão "Cobrar" → modal com métodos **filtrados pela permissão do garçom**:
   - **Pix MP** → cria preference Checkout Pro e mostra QR Pix grande na tela para o cliente apontar o celular.
   - **Cartão (Point Smart)** → chama `POST /point/integration-api/devices/{device_id}/payment-intents` com o valor; a maquininha vinculada acorda sozinha; cliente insere/aproxima.
4. Tela de espera: polling de 2s no status do pedido (Realtime já habilitado).
5. Pago: aparece **recibo + botão grande "Entreguei o produto"**.
6. Toque em "Entreguei" → chama `lojinha_confirm_delivery_pos`:
   - Marca todas as unidades do pedido como `delivered` (delivered_by = garçom).
   - Baixa de `product_stock.quantity` (combos explodem como no PDV).
   - Registra em `sales`/`sale_items` com `category='online'`, `session_id=NULL`, `payment_method` correto.
   - Pedido vai para `delivered` direto.
7. Não gera QR para venda do garçom-caixa (não precisa, é entrega imediata). Cancelar pagamento antes de entregar libera reserva.

## Integração Point Smart

Server functions em `src/lojinha/point.functions.ts`:

- `pointListDevices()` — owner, lista aparelhos do MP.
- `pointCreatePaymentIntent({ orderId, deviceId, amount })` — cria intent; salva `mp_point_intent_id` no pedido.
- `pointCancelPaymentIntent({ orderId })` — se garçom cancelar antes do cliente passar o cartão.

Webhook **único** `/api/public/mp-webhook` já estava planejado; agora trata:
- `topic=payment` (Pix Checkout Pro) → confirma pedido.
- `topic=point_integration_wh` (cartão na Point) → confirma pedido pelo `external_reference`.

Em ambos: marca pedido `paid`, dispara Realtime, **mas não baixa estoque** — a baixa só acontece quando garçom clica "Entreguei" (ou na entrega do QR do cliente online).

## Banco (delta)

- `user_roles`: adicionar `lojinha_can_sell boolean DEFAULT false`, `lojinha_payment_methods text[] DEFAULT '{}'`, `lojinha_point_device_id text NULL`.
- Nova tabela `lojinha_point_devices(id, user_id, mp_device_id UNIQUE, label, assigned_to_user_id NULL, created_at)`.
- `lojinha_orders`: `channel text DEFAULT 'online'` (`'online'` ou `'pos'`), `seller_user_id uuid NULL`, `seller_name text NULL`, `mp_point_intent_id text NULL`, `point_device_id text NULL`.
- Nova RPC `lojinha_create_pos_order(_items, _payment_method, _device_id)` — cria pedido `pending` já com `channel='pos'`, reserva estoque, devolve `order_id`.
- Nova RPC `lojinha_confirm_delivery_pos(_order_id)` — só roda se pedido é `pos` + `paid`; faz a baixa de estoque, registra `sales`, marca `delivered`.

## Fluxo resumido

```text
Cliente online:        catálogo → carrinho → MP Checkout Pro → QR no cel do cliente → garçom scanner → entregue
Garçom-caixa (Pix):    PDV → carrinho → "Cobrar Pix" → QR na tela do garçom → cliente paga → "Entreguei" → baixa estoque
Garçom-caixa (cartão): PDV → carrinho → "Cobrar cartão" → Point acorda → cliente passa → "Entreguei" → baixa estoque
```

## Detalhes técnicos

- **Comunicação com a Point**: 100% via API HTTP do Mercado Pago (servidor → MP → maquininha pela rede da própria MP). **Não usa Bluetooth nem WiFi local**, só precisa que a maquininha esteja ligada e com internet (chip ou WiFi do bar). É o caminho oficial e o único confiável.
- **Vínculo da maquininha ↔ garçom**: 1 fixa por garçom que tem cartão (owner amarra no painel). Garçom sem maquininha vinculada não vê opção "cartão" no PDV. Owner pode usar qualquer uma das livres.
- **Realtime**: já habilitado em `lojinha_orders`; mesmo canal serve para a tela de espera do PDV.
- **Sem QR para venda POS**: simplifica, evita confusão. Se um dia precisar (ex: dois garçons no mesmo balcão), basta ligar uma flag.

## Ordem de implementação

1. Migração (colunas + tabela `lojinha_point_devices` + RPCs novas).
2. UI de permissões no convite/edição de funcionário (3 checkboxes + dropdown maquininha).
3. Aba "Maquininhas" no `/_app/lojinha` (owner) — sem chamar MP ainda, só CRUD manual de serial.
4. PDV mobile `/lojinha-pdv` com fluxo Pix (já que MP token virá no fim).
5. Integração Point Smart (server fn + tela de "aguardando cartão").
6. Webhook MP único tratando os dois tópicos.
7. No final: pedir `MERCADO_PAGO_ACCESS_TOKEN` + `MERCADO_PAGO_WEBHOOK_SECRET` e ativar tudo.

## Fora do escopo

- Estorno automatizado (Pix ou cartão) — continua manual no painel MP.
- Trocar de maquininha no meio da venda.
- Recibo impresso (a Point Smart imprime o comprovante do cartão sozinha).

Posso seguir nessa direção?
