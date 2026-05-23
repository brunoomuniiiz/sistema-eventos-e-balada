import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * Lista de abas compacta:
 * - Em telas estreitas (< sm) cada gatilho usa a sigla `short` se houver.
 * - A aba ATIVA sempre mostra o nome completo (auto-expande).
 * - Em sm+ mostra sempre o nome completo.
 * - Quebra em 2 linhas se mesmo abreviado não couber.
 */

export const CompactTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex flex-wrap items-stretch gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
CompactTabsList.displayName = "CompactTabsList";

type CompactTabsTriggerProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
  /** Sigla / abreviação curta para telas pequenas. Se omitida, usa label inteiro. */
  short?: string;
  /** Ícone opcional (lucide). */
  icon?: React.ComponentType<{ className?: string }>;
  /** Texto completo (children). */
  children: React.ReactNode;
};

export const CompactTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  CompactTabsTriggerProps
>(({ className, short, icon: Icon, children, ...props }, ref) => {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "group inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-md px-2 py-1.5 sm:px-2.5 min-h-9 text-[11px] sm:text-sm font-medium",
        "ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
        "whitespace-normal leading-tight text-center",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />}
      {short ? (
        <>
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{children}</span>
        </>
      ) : (
        <span>{children}</span>
      )}
    </TabsPrimitive.Trigger>
  );
});
CompactTabsTrigger.displayName = "CompactTabsTrigger";
