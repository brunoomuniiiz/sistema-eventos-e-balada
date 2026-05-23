## Objetivo
Deixar a navegação por abas (Vendas, Ao vivo, Dashboard, Eventos, Produtos, Portaria) confortável em telas estreitas e tornar o PDV Caixa + Vender (garçom) com a mesma pegada da Lojinha (rápido, "tap-friendly", ótimo no celular).

## 1. Componente novo: `<CompactTabsList>` (sigla → nome completo no ativo)

Criar `src/components/ui/compact-tabs.tsx` envolvendo `TabsList`/`TabsTrigger` do shadcn com regras:

- Cada trigger recebe `label` (completo) + `short` (sigla/abrev opcional, ex.: "Pag.", "Conf.", "Hist.").
- Em telas `<sm`: mostra **ícone + `short`** (ou ícone só, se não tiver short e o label for longo).
- Aba **ativa sempre mostra label completo** (auto-expande), as outras ficam compactas → fica claro onde estou sem ocupar espaço.
- `flex-wrap` permitido: se mesmo abreviado não couber, quebra pra 2 linhas (texto com `leading-tight whitespace-normal text-[11px]`).
- Em `sm+` mostra label completo normal.
- Touch target mínimo 40px de altura.

Comportamento "abreviado → toca expande": como ao tocar a aba ela vira ativa, o `short` é substituído pelo nome inteiro automaticamente.

## 2. Aplicar em todas as páginas com abas

Substituir `TabsList` por `CompactTabsList` em:

- `src/routes/_app.vendas.tsx` — Caixas, PDV (PDV), Vender (Garçom → "Garçom"), Validar QR (QR), Pedidos (Ped.), Histórico (Hist.), Abandonados (Aband.), Configuração (Conf.)
- `src/routes/_app.ao-vivo.tsx` — (sem abas próprias; o painel interno tem cards + filtro de período)
- `src/routes/_app.dashboard.tsx`, `_app.financeiro.tsx`, `_app.produtos.tsx`, `_app.estoque.tsx`, `_app.eventos.$eventId.tsx`, `_app.portaria.tsx`, `_app.configuracao.tsx`, `_app.funcionarios.tsx`, `_app.promoters.tsx`, `_app.lojinha.tsx`.

Mapa de siglas comuns:
- Pagamento → Pag.
- Configuração → Conf.
- Histórico → Hist.
- Produtos → Prod.
- Estoque → Estq.
- Eventos → Eve.
- Financeiro → Fin.
- Funcionários → Func.
- Promoters → Promo.
- Categorias → Cat.
- Investimento → Inv.
- Despesas → Desp.
- Consumação → Cons.
- Abandonados → Aband.
- Permissões → Perm.

## 3. Painel ao vivo — botões/cards mais enxutos

Em `LiveDashboardPanel.tsx`:
- O `Select` de período fica `h-9 w-full sm:w-[180px]` (full no mobile, fixo no desktop) e o título quebra abaixo se necessário (`flex-wrap`).
- Cards `MethodCard`: label aceita sigla. Ex.: "Dinheiro (bruto)" → "Dinh." no mobile, expandido em `sm+`. Mesma técnica: classe `sm:hidden` / `hidden sm:inline`.
- "Mix por canal" e "Ranking" já são `grid md:grid-cols-2` — manter.
- `QuickEventCostCard` e `QuickConsumacaoCard`: revisar para tabs internas usarem `CompactTabsList`.

## 4. PDV Caixa + Vender (garçom) — pegada Lojinha no celular

Padrão Lojinha hoje (`LojinhaPosView`): chips de categoria horizontais + grid 2 colunas com foto, busca grande, FAB do carrinho, sheet de checkout em passos (cart → método → aguardando).

Mudanças no `_app.pdv.tsx` para ficar igual:

1. **Header compacto no mobile**: substituir `<PageHeader title="Venda Rápida" subtitle=...>` por uma barra sticky fina com status do caixa + botão "Sangria" colapsado num menu.
2. **Card "Caixa aberto"**: encolher no mobile (só ícone + total + botão Sangria como `icon`), expande detalhes em `sm+`.
3. **Grid de produtos**: já é `grid-cols-2 sm:grid-cols-3...`. Aumentar área tocável: padding `p-3` no mobile, `p-4` em `sm+`. Adicionar miniatura `photo_url` (igual lojinha) quando existir.
4. **Chips de categoria**: trocar fonte para `text-xs sm:text-sm`, padding `px-2.5 py-1` no mobile.
5. **Busca**: input `h-11` no mobile com `inputMode="search"`.
6. **FAB carrinho**: já existe; mover pra `bottom-24` no mobile pra não colidir com a nav inferior + safe-area.
7. **Sheet de checkout**: passar a usar **passos** como na lojinha (Carrinho → Pagamento → Confirmação) em vez de um único scroll comprido — em mobile é mais fácil. Em `sm+` mantém scroll único.
8. **SplitPaymentEditor**: revisar os botões de método de pagamento — usar grid `grid-cols-2 sm:grid-cols-4`, labels com sigla ("Dinh.", "Déb.", "Créd.", "Prom.") + ícone, label completo aparece em `sm+` ou no botão ativo.
9. **Botão "Finalizar"**: já é `h-14`, manter. "Lançar como Consumação" vira botão `outline` mais discreto (`h-11`) no mobile.

Para `LojinhaPosView` (Vender garçom): já está próximo do ideal. Pequenos ajustes:
- Garantir `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` (hoje pode estar diferente, validar).
- FAB carrinho em `bottom-24` no mobile.
- Passo "method" com botões grandões `h-16` lado a lado.

## 5. Sidebar/Bottom-nav (AppLayout)

- Bottom-nav atual já tem ícone + label `text-[10px]`. Adicionar `truncate max-w-[68px]` para evitar quebra feia.
- Para itens com label longo (`Configuração`, `Financeiro`) usar versão curta no mobile via `<span className="sm:hidden">Conf.</span><span className="hidden sm:inline">Configuração</span>` no array de `navItems`.

## 6. Ordem de execução

1. Criar `CompactTabsList`.
2. Aplicar em `/vendas` (prioridade — é o caso mais visível) + `/ao-vivo`.
3. Reformar PDV mobile (grid, FAB, sheet por passos, métodos de pagamento curtos).
4. Replicar `CompactTabsList` nas demais páginas com abas.
5. Ajustes finais no bottom-nav.

## Notas técnicas

- Nenhuma mudança em banco, RPC, regras de venda, permissões ou cálculo. Só apresentação/UX.
- Os labels curtos não substituem `value` das `TabsTrigger` — só o texto exibido. Roteamento via `?tab=` continua igual.
- Animação simples (`transition-[width,opacity]`) quando label troca curto↔longo.
