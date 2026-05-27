## Problema

A cor "botões" das Configurações só sobrescreve `--primary`, mas a maior parte do roxo do app vem de outras variáveis que continuam fixas em magenta:

- `--gradient-primary` (usado em `bg-gradient-primary`, `text-gradient`, headers do Dashboard, botão "Novo evento", chips ativos)
- `--primary-glow` e `--shadow-glow-primary` (brilho dos botões e da logo)
- `--accent`, `--chart-1`, `--ring` (gráficos, focos, badges)
- `--sidebar-primary` e ícone ativo das abas mobile (`text-primary` + `drop-shadow` apontando para `--color-primary`)

Resultado: mesmo trocando a cor, Dashboard, "Novo evento", títulos de abas mobile e chips continuam roxos.

## Correção

Expandir `BrandingProvider` (`src/hooks/useBranding.tsx`) para, quando `button_color` estiver definida, recalcular e injetar todas as variáveis derivadas em vez de só `--primary`:

1. Sobrescrever em `:root`:
   - `--primary`, `--primary-glow` (mesma cor, levemente clareada)
   - `--gradient-primary` = `linear-gradient(135deg, button_color, primary-glow)`
   - `--gradient-accent` (mesma base)
   - `--shadow-glow-primary` (usando a nova cor com alpha)
   - `--ring`, `--sidebar-primary`, `--sidebar-ring`, `--chart-1`
   - `--accent` (deixar igual ao botão para sumir o ciano onde aparece junto)
2. Helper interno `lighten(hex, amount)` para gerar o tom do glow sem dependência externa (manipulação simples em RGB).
3. Aplicar o mesmo tratamento para `bg_color` e `text_color`: além de `--background`/`--foreground`, atualizar `--card`, `--popover`, `--secondary`, `--muted`, `--sidebar-accent` (derivados levemente mais claros que o fundo) e `--muted-foreground` (derivado do texto com opacidade) para não ficarem destoando do tema escolhido.
4. Limpar todas essas variáveis quando o usuário voltar aos valores padrão (sem cor salva).

## Pontos que voltam a ficar coloridos automaticamente após o fix

- Dashboard (cards "text-gradient", barra de progresso, ícones)
- Botão "Novo evento" e demais botões `bg-gradient-primary`
- Aba ativa no menu inferior mobile (ícone + label)
- Logo no canto superior
- Chips de categoria ativos em Vendas
- Gráficos (`chart-1`) no Dashboard

## Arquivos a editar

- `src/hooks/useBranding.tsx` — única alteração necessária; nada muda em componentes.

## Sem mudanças de banco

A migração já criada cobre todos os campos.