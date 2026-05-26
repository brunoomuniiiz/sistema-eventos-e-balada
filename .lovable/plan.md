## Problema

Na aba **Vender (garçom)**, deslizar nas categorias arrasta a **página inteira** horizontalmente, em vez de mover só a tira de chips. A `CategoryChipBar` já é desenhada para rolar internamente (`overflow-x-auto` + `min-w-0`), mas como ela contém chips com `min-w-max` dentro de um pai flex que não trava largura, o overflow "vaza" para cima e empurra `<main>` para fora da viewport.

## Causa raiz

Em `src/components/AppLayout.tsx` o shell é um flex:

```text
<div class="min-h-screen flex">
  <aside ... />            ← sidebar fixa
  <main class="flex-1 ..."> ← SEM min-w-0
    <div class="px-4 md:px-8 ... max-w-7xl mx-auto"> ← SEM min-w-0 / overflow-x-hidden
      <Outlet />
```

Em flex, um filho com `flex-1` cresce até o conteúdo quando não tem `min-w-0` — esse é o "flex blowout" clássico. Qualquer filho com `min-w-max` (os chips da categoria) faz a `<main>` ficar maior que a viewport e a página inteira ganha scroll horizontal.

## Mudança proposta (cirúrgica, só CSS)

`src/components/AppLayout.tsx`:

1. Linha 116 — adicionar `min-w-0` e `overflow-x-hidden` ao `<main>`:
   ```tsx
   <main className="flex-1 min-w-0 overflow-x-hidden md:ml-16 pb-[...] md:pb-8">
   ```
2. Linha 132 — adicionar `min-w-0` ao wrapper interno:
   ```tsx
   <div className="px-4 md:px-8 py-6 md:py-8 max-w-7xl mx-auto min-w-0">
   ```

Nada na `CategoryChipBar` nem na `LojinhaPosView` precisa mudar — elas já estão corretas; só estavam sendo "estouradas" pelo pai.

## Validação

- Abrir `/vendas` → aba **Vender (garçom)** no viewport mobile (≈673px).
- Arrastar lateralmente nos chips: só a tira deve rolar, página fica parada.
- Conferir outras rotas (Configuração, Estoque, Eventos) — layout permanece igual, sem novo clipping indesejado.
