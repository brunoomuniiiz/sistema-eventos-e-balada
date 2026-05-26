## Objetivo

Adicionar um teste automatizado que valida a migração da persona antiga `lojinha` para `garcom` no `ViewAsProvider`, garantindo que:
1. Ao montar com `sessionStorage.viewAsPersona = "lojinha"`, o contexto expõe `persona === "garcom"`.
2. O `sessionStorage` é reescrito para `"garcom"` (não permanece `"lojinha"`).
3. Personas válidas (ex.: `"caixa"`) não sofrem mudança.

## Setup de testes (ainda não existe no projeto)

Adicionar dependências dev: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.

Criar:
- `vitest.config.ts` — environment `jsdom`, alias `@` → `src`, setup file.
- `src/test/setup.ts` — importa `@testing-library/jest-dom`.
- Script `"test": "vitest run"` em `package.json`.

## Arquivo de teste

`src/hooks/useViewAs.test.tsx` — usa `renderHook` com `ViewAsProvider` como wrapper e `useViewAs()`:

- **Caso 1 — migração:** seeda `sessionStorage.setItem("viewAsPersona", "lojinha")` antes do render. Após o effect inicial, espera `result.current.persona === "garcom"` e `sessionStorage.getItem("viewAsPersona") === "garcom"`.
- **Caso 2 — persona válida preservada:** seeda `"caixa"`, espera persona `"caixa"` e sessionStorage inalterado.
- **Caso 3 — `setPersona("lojinha")` em runtime:** chama o setter dentro de `act()`, espera estado e storage como `"garcom"`.

`beforeEach` limpa `sessionStorage`.

## Detalhes técnicos

- O effect de leitura roda só uma vez no mount; o `renderHook` do Testing Library aguarda automaticamente, mas usaremos `waitFor` para o assert de storage para evitar flakiness.
- Sem mocks de Supabase necessários — `useViewAs` não toca rede.
- Não alterar `useViewAs.tsx`; o teste é puramente de verificação.