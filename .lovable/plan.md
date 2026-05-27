## Problema
A página `/minha-conta` (onde fica o cadastro do **PIN de operação**) existe, mas não há link visível em nenhum menu do app. Só dá pra chegar digitando a URL. Por isso você não acha o PIN.

## Correção
Adicionar uma aba **"Minha conta"** dentro da tela **Configuração**, visível para o owner, renderizando o componente `MinhaContaPage` já existente (que tem a seção PIN, foto de perfil, trocar email/senha).

### Mudança única
- `src/routes/_app.configuracao.tsx`: adicionar `CompactTabsTrigger value="minha-conta"` com ícone de perfil + `TabsContent` renderizando `<MinhaContaPage />` (import já existe no arquivo).

Resultado: Configuração → aba **Minha conta** → seção **PIN de operação** → cadastrar/trocar.

## Fora de escopo
Não vou mexer no fluxo, layout ou conteúdo da `MinhaContaPage` em si — só expor ela como aba.
