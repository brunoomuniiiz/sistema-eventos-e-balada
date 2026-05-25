## Plano direto para resolver de verdade

O problema principal não é só o card de produto: o fluxo ainda está caindo em telas genéricas/antigas e o `Ver como` não força uma troca clara de rota/aba. Vou corrigir isso de forma objetiva.

## O que vou mudar

1. **`Ver como` vai abrir a tela certa, não só trocar permissão**
   - Dono: `/dashboard`
   - Caixa/PDV: `/pdv`
   - Garçom: `/vendas?tab=vender`
   - Vendedor online: `/vendas?tab=vender`
   - Portaria: `/portaria`
   - Promoter: `/meu-extrato`

2. **Remover o desvio errado para `/lojinha`**
   - Hoje `/lojinha` redireciona para `/vendas`, e aí pode cair na aba padrão errada.
   - Para garçom e vendedor online, o `Ver como` vai direto para a aba `Vender (garçom)`.

3. **Corrigir a lógica da aba padrão em Vendas**
   - Se for dono/gerente: continua vendo gestão/caixas.
   - Se for PDV caixa: abre PDV caixa.
   - Se for garçom/vendedor online: abre diretamente `Vender (garçom)`.
   - Se a URL pedir uma aba que a persona não pode ver, troca automaticamente para a aba permitida.

4. **Deixar visualmente impossível confundir a persona ativa**
   - A barra “Visualizando como…” vai mostrar também o destino atual da visão.
   - Ao trocar persona, fecha o menu e navega imediatamente para a tela correta.

5. **Garantir que o produto apareça no vendedor online/garçom**
   - Manter a query de produtos habilitada para `lojinhaCanSell` ou `canVenderGarcom`.
   - Manter o card estilo lojinha online nos fluxos internos.

## Arquivos previstos

- `src/components/ViewAsBar.tsx`
- `src/routes/index.tsx`
- `src/routes/_app.vendas.tsx`
- possivelmente `src/hooks/useViewAs.tsx` só se precisar centralizar o destino de cada persona

## Critério de pronto

Depois da alteração, quando você clicar em:

- **Ver como > Caixa (PDV)**: precisa cair em `/pdv` com a tela de PDV.
- **Ver como > Garçom**: precisa cair em `/vendas?tab=vender`, com produtos visíveis no modelo de card da lojinha.
- **Ver como > Lojinha (vendedor online)**: precisa cair em `/vendas?tab=vender`, não ficar vazio nem parecer dashboard.
- **Sair**: volta para visão dono em `/dashboard`.