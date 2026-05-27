## Problema

Você está logado como dono, mas vê a tela "Bar fechado / próximo evento em…".

Olhando o código, o `OperationGate` (em `src/routes/_app.tsx`) usa `isOwner` vindo de `usePermissions`. Esse `isOwner` **respeita a máscara do "Ver como"**: se em algum momento você (ou outra sessão neste navegador) escolheu uma persona diferente de "Dono" na barra de testes, o valor fica salvo em `sessionStorage` (`viewAsPersona`) e o sistema te trata como aquele perfil — sem permissão de eventos/promoters e sem ser dono. Resultado: fora da janela de operação, cai na tela "Bar fechado", e como aquela tela **não mostra a barra de Ver-como**, você não tem como voltar pra "Dono" — fica preso.

A regra que conversamos ("dono sempre entra") tem que valer pela conta real, não pela máscara de teste.

## O que vou mudar

Edição cirúrgica só em frontend, sem mexer em permissões/banco.

### 1. `src/routes/_app.tsx` — `OperationGate`
- Trocar a checagem de `isOwner` por `realIsOwner` (já exposto pelo `usePermissions`) no bloqueio fora-de-horário.
- Assim, dono logado **sempre passa**, mesmo que o "Ver como" esteja simulando garçom/caixa/portaria.
- Mantém o resto da regra igual: funcionário com permissão de eventos/promoters passa; promoter passa; funcionário vinculado a promoter vai pra `/meus-eventos`; demais veem "Bar fechado".

### 2. `src/components/OperationClosedScreen.tsx` — escape do "Ver como"
- Quando `realIsOwner === true` e a persona atual ≠ "dono", mostrar no topo da tela um aviso pequeno + botão **"Voltar para visão de Dono"** que chama `setPersona("dono")`.
- Isso garante que mesmo se algum dia o gate bloquear o dono por engano, ele tem um caminho de saída visível.

### 3. (defensivo) `src/hooks/useViewAs.tsx`
- Nenhuma mudança de comportamento. Continua em `sessionStorage`, então fechando a aba já volta pra Dono. (Não vou mexer pra não quebrar fluxo de teste de outros perfis.)

## O que NÃO muda

- Lógica de quem pode entrar fora do horário (owner / eventos / promoters / promoter vinculado) — segue igual.
- Janela de operação (`useOperationWindow`) — segue igual: abre 1h antes do próximo evento "upcoming/ongoing".
- Nenhuma mudança de schema, RLS, server functions ou permissões.
- PDV/Lojinha/Garçom continuam bloqueados pra funcionário comum fora do horário.

## Como validar depois

1. Logar como dono → entrar direto no `/dashboard`, sem ver "Bar fechado", mesmo sem evento futuro.
2. Trocar pra "Ver como → Garçom" sem evento aberto → cai em "Bar fechado", e o topo mostra "Voltar para visão de Dono".
3. Clicar nesse botão → volta pra dashboard normalmente.
4. Logar como funcionário sem permissão de eventos, sem evento aberto → continua vendo "Bar fechado" (regra preservada).
