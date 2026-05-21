## Diagnóstico

### 1. ❌ `function gen_random_bytes(integer) does not exist` (loja cliente + garçom PIX)
**Causa raiz:** a migration recente `20260521223626_...sql` reintroduziu chamadas a `gen_random_bytes(...)` **sem o prefixo `extensions.`** em duas funções RPC:
- `lojinha_create_pending_order` (usada pelo checkout do **cliente** na loja pública)
- `lojinha_create_pos_pending_order` (usada pelo **garçom** ao apertar PIX no PDV mobile)

Já tivemos esse mesmo bug antes (migrations `20260520221529` e `20260520222320` corrigiram outras funções adicionando `extensions.`). A extensão `pgcrypto` vive no schema `extensions` neste projeto, e funções com `SECURITY DEFINER` + `SET search_path = public` não enxergam `gen_random_bytes` sem o prefixo.

**Por isso:**
- Cliente paga → erro `gen_random_bytes does not exist`
- Garçom aperta PIX → mesmo erro, exibido como "Erro ao criar pedido"
- PDV Caixa funciona porque usa outro caminho (`sales` direto, sem essa RPC)

### 2. ✅ PDV Caixa abrindo nova aba após PIX simulado
**Não é bug.** Após confirmar a venda no PDV Caixa, o sistema abre `/pdv-cupom/$saleId` em nova aba e dispara `window.print()` automaticamente — isso é o cupom térmico (80mm) para a impressora. Sem impressora conectada, o navegador apenas mostra o preview de impressão (você pode fechar). É o comportamento correto e necessário quando você tiver a impressora térmica.

**Opcional:** posso adicionar uma config "Imprimir cupom automaticamente" (default ON) que, quando desligada, mostra só um toast "Venda concluída" sem abrir a aba — útil enquanto você não tem impressora.

---

## Plano de correção

### Passo 1 — Migration de hotfix (única mudança obrigatória)
Recriar as duas funções da migration `20260521223626` trocando:
```
encode(gen_random_bytes(18), 'hex')
```
por:
```
encode(extensions.gen_random_bytes(18), 'hex')
```
Funções afetadas:
- `public.lojinha_create_pending_order(...)`
- `public.lojinha_create_pos_pending_order(...)`

Também vou varrer outras funções da mesma migration para garantir que nenhuma outra chamada quebrada passou (busca por `gen_random_bytes` sem `extensions.`).

### Passo 2 (opcional, se você quiser) — Toggle "imprimir cupom automático"
- Adicionar flag `auto_print_receipt` em `bar_settings` (default `true`).
- No PDV Caixa, após venda: se `false`, mostrar toast e **não** abrir a aba do cupom; deixar um botão "Imprimir cupom" no histórico para imprimir manualmente.

---

## Resumo das mudanças

| Item | Tipo | Obrigatório |
|---|---|---|
| Migration corrigindo `gen_random_bytes` → `extensions.gen_random_bytes` nas 2 RPCs da lojinha | SQL | ✅ Sim |
| Toggle "imprimir cupom auto" | UI + SQL | ⚪ Opcional |

**Pergunta antes de executar:** quer que eu inclua o toggle opcional do item 2 ou só o hotfix do PIX?