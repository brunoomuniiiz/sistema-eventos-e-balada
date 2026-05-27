## Problema
Hoje o `PixQrDialog` (usado no PDV e no garçom) renderiza em `max-w-sm` com:
- Header + descrição
- Tabs (QR / Chave PIX) quando o usuário tem permissão
- QR 256×256 em card branco
- Campo "Pix copia-e-cola" com código truncado + botão copiar
- Linha "Aguardando pagamento" + countdown
- Botão "Cancelar"
- Botão "[TESTE] Simular Pagamento"

Em celular isso estoura a altura da viewport e o QR fica fora da dobra. O operador precisa rolar pra mostrar pro cliente.

## Solução (apenas UI no `src/components/vendas/PixQrDialog.tsx`)

Reorganizar para caber em uma tela só, com o QR sempre visível na primeira dobra:

1. **Dialog mais largo e altura fixa**: trocar `max-w-sm` por `max-w-[92vw] sm:max-w-md`, e usar `max-h-[92vh]` com layout flex coluna. Sem scroll interno na aba QR.
2. **Header enxuto**: título "PIX" + valor em destaque grande na mesma linha; remover `DialogDescription` longa (mover descrição para um subtítulo de 1 linha truncada).
3. **Tabs compactas** (quando aparecerem): manter, mas com altura reduzida (`h-8`).
4. **QR como elemento principal**: reduzir de `w-64 h-64` (256px) para `w-52 h-52` (~208px) — ainda escaneia bem e libera espaço vertical. Centralizado com padding mínimo.
5. **Copia-e-cola colapsável**: substituir o bloco fixo por um único botão "Copiar código Pix" (com ícone Copy/Check). O código longo deixa de ocupar espaço; quem precisar ver clica e cola. Isso elimina a maior fonte de altura desperdiçada.
6. **Rodapé fixo compacto**: uma linha com "Aguardando… · expira em mm:ss" + botão "Cancelar" como link/ghost pequeno do lado. Reduz de 3 blocos pra 1.
7. **Botão de simulação**: ocultar atrás de um `details`/link pequeno "Modo teste" no rodapé (não muda comportamento, só tira da dobra principal). Mantém para QA.
8. **Estado aprovado/recusado**: já é compacto, só ajustar paddings pra mesma altura do estado pendente (evita "pulo" do dialog).
9. **Aba Chave PIX**: igualmente compactada — textarea menor (`rows={2}`), botão de confirmar imediatamente abaixo.

Resultado: numa viewport de ~640px de altura (celular típico em paisagem do garçom ou retrato do PDV), tudo cabe sem scroll e o QR fica imediatamente visível ao abrir.

## Arquivos
- `src/components/vendas/PixQrDialog.tsx` — única edição.

Sem mudanças de lógica, server functions, schema ou permissões.
