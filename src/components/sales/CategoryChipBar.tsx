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
    <div className={cn("w-full max-w-full overflow-hidden", className)}>
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-none snap-x">
        {items.map((it) => {
          const active = it.id === activeId;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onChange(it.id)}
              className={cn(
                "snap-start whitespace-nowrap rounded-full border transition-colors shrink-0",
                "h-9 px-4 text-sm font-medium",
                active
                  ? "text-primary-foreground border-transparent bg-primary"
                  : "bg-card text-foreground border-border hover:bg-secondary",
              )}
              style={active && accentColor ? { background: accentColor, color: "#fff" } : undefined}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
