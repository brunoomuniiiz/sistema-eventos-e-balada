## Passo 1 — Eventos & Landing da Lista

### 1.1 Bug "Cancelado"
O badge do evento só conhece 3 estados (`upcoming` → "Próximo", `finished` → "Realizado", qualquer outra coisa → vermelho "Cancelado"). Quando o evento auto-abre, o status vira `ongoing` e cai no "qualquer outra coisa" → aparece "Cancelado".

Correção em `src/routes/_app.eventos.index.tsx` e `_app.eventos.$eventId.tsx`:
- Mapear explicitamente `ongoing` → badge verde "Ao vivo".
- Mapear `live` (legado) → idem.
- Só mostrar vermelho "Cancelado" quando status === `cancelled`.

### 1.2 Hora de encerramento
Hoje só existe data/hora de início + `auto_close_hours_after` (não exposto). Vou:
- Adicionar coluna `end_date timestamptz` em `events` (migração).
- Adicionar campo "Hora de encerramento" no diálogo de criar/editar evento (input `datetime-local`, opcional).
- Mostrar a hora de fim na página da lista e no detalhe do evento.
- Corrigir bug paralelo: o `useState(() => {…})` no `EventDialog` está sendo usado como effect (errado, não re-roda ao editar outro evento). Trocar por `useEffect` dependendo de `event?.id` e `open`.

### 1.3 Página da lista pública (`/lista/:slug`)
Hoje não mostra o flyer e mostra o total real de pessoas. Vou:
- **Mostrar flyer** em destaque no topo do card.
- **Botão "Baixar flyer"** (download direto da imagem).
- **Botão "Convidar amigos no WhatsApp"** que abre `wa.me/?text=...` com a frase do evento + link da lista (sem número, share genérico).
- **Contador fake "X pessoas vendo agora"**: número aleatório pequeno (entre 6 e 24), recalculado a cada ~15s no cliente. Substitui o "X pessoas na lista".
- **Regra do contador real**: se a flag do dono permitir E o dia for o do evento E `total_entries >= 400`, mostra o número real "X confirmados". Caso contrário, segue o fake.
- Atualizar `get_guest_list_info` (migração) para também devolver `show_real_count_when_big boolean` e `event_end_date`.

### 1.4 Toggle do dono "mostrar números reais"
- Adicionar coluna `show_real_count_when_big boolean default false` em `events` (mesma migração).
- Toggle no diálogo de editar evento: "Mostrar nº real de inscritos quando passar de 400 (no dia do evento)".

### 1.5 Mensagem pós-cadastro na lista
Hoje, ao se inscrever, aparece bloco verde + botão grande "Receber confirmação no WhatsApp" com texto pronto. Pedido: desligar isso por enquanto e deixar só um campo para o dono colar o link do grupo do WhatsApp, e o convidado entrar nele.
- Usar a coluna já existente `events.whatsapp_group_url`.
- Expor o campo "Link do grupo WhatsApp" no diálogo de evento.
- Na confirmação da lista, substituir o botão antigo por: se houver `whatsapp_group_url`, mostrar botão "Entrar no grupo do WhatsApp"; senão, só "Tudo certo, você está na lista".
- Remover a chamada a `buildConfirmationMessage` nessa tela (mantém a função para uso futuro).
- `get_guest_list_info` passa a devolver `event_whatsapp_group_url`.

---

## Passo 2 — Menus & Ao Vivo

### 2.1 Tirar a aba "Vender agora"
Em `src/components/AppLayout.tsx`, remover o item `{ to: "/pdv", label: "Vender agora", … }`. O `/pdv` continua acessível, só some do menu (a aba "Vendas" segue existindo entre Ao vivo e Produtos).

### 2.2 Mover Drinks para "Ao vivo" dentro de Consumação interna
Hoje o painel de drinks (`LiveDrinkCostPanel` + `DrinkMarginCard`) vive na página do evento. O pedido é:
- No `/ao-vivo`, dentro do `ConsumacaoLivePanel` (consumação interna), adicionar um botão/aba **"Drinks"**.
- Esse modo abre o mesmo grid de garrafas pinadas (insumos `is_drink_input`). Clicar em "+1":
  - Lança 1 garrafa via `register_drink_consumption` (já existe), o que dá baixa de 1 no estoque e grava custo do drink no `event_drink_consumption`.
  - Esse custo entra como CMV do evento ativo (já é o comportamento do RPC).
- Manter o card de margem (`DrinkMarginCard`) visível no Ao Vivo para acompanhamento em tempo real.
- Remover (ou esconder) o `LiveDrinkCostPanel` da página do evento, já que migra para Ao Vivo.

---

## Detalhes técnicos
- **Migração**: `ALTER TABLE events ADD COLUMN end_date timestamptz, ADD COLUMN show_real_count_when_big boolean DEFAULT false;` + recriar `get_guest_list_info` para devolver `event_end_date`, `event_whatsapp_group_url`, `show_real_count_when_big`.
- **Compartilhar WhatsApp**: `https://wa.me/?text=<encodeURIComponent(texto + url)>` onde `url = window.location.origin + "/lista/" + slug`.
- **Download flyer**: `<a href={flyerUrl} download target="_blank">`. Como o flyer está no bucket `flyers` público, basta o href direto.
- **Contador fake**: `useEffect` com `setInterval(15000)` gerando `6 + Math.floor(Math.random()*19)`.
