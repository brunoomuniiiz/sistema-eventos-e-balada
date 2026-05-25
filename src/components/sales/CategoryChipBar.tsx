import { cn } from "@/lib/utils";

export type CategoryChipItem = {
  id: string;
  label: string;
};

type Props = {
  items: CategoryChipItem[];
  activeId: string;
  onChange: (id: string) => void;
  accentColor?: string;
  className?: string;
};

/**
 * Barra de categorias com swipe horizontal — mesmo padrão visual da lojinha
 * pública. Mantém em UMA linha, arrasta pro lado, sem barra de rolagem visível,
 * com botões grandes o suficiente pra tocar no celular.
 */
export function CategoryChipBar({ items, activeId, onChange, accentColor, className }: Props) {
  if (items.length === 0) return null;
  return (
    <div className={cn("relative w-full max-w-full min-w-0 overflow-hidden", className)}>
      <div className="flex w-full max-w-full min-w-0 gap-2 overflow-x-auto overscroll-x-contain touch-pan-x scroll-smooth pb-1 pr-10 scrollbar-none snap-x snap-mandatory">
        {items.map((it) => {
          const active = it.id === activeId;
          return (
            <button
              key={it.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(it.id)}
              className={cn(
                "snap-start whitespace-nowrap rounded-full border transition-colors shrink-0",
                "h-10 min-w-max px-4 text-sm font-semibold",
                active
                  ? "text-primary-foreground border-transparent bg-primary"
                  : "bg-card text-foreground border-border hover:bg-secondary",
              )}
              style={active && accentColor ? { background: accentColor, color: "var(--color-primary-foreground)" } : undefined}
            >
              {it.label}
            </button>
          );
        })}
      </div>
      <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-9 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
