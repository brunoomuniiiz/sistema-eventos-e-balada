import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Minus, ShoppingBag } from "lucide-react";
import { formatBRL } from "@/lib/format";
import type { ReactNode } from "react";

export type ProductCardProduct = {
  id: string;
  name: string;
  price: number;
  photo_url?: string | null;
  description?: string | null;
};

export type StockStatus = "ok" | "low" | "last" | "out";

type Props = {
  product: ProductCardProduct;
  inCartQty: number;
  stockStatus?: StockStatus;
  stockText?: string | null;
  accentColor?: string;
  badge?: ReactNode;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
};

export function ProductCard({
  product,
  inCartQty,
  stockStatus = "ok",
  stockText,
  accentColor,
  badge,
  onAdd,
  onInc,
  onDec,
}: Props) {
  const soldOut = stockStatus === "out" && inCartQty === 0;
  const accentStyle = accentColor ? { background: accentColor } : undefined;

  return (
    <Card className={`w-full max-w-full overflow-hidden ${soldOut ? "opacity-60" : ""}`}>
      <CardContent
        role="button"
        tabIndex={soldOut ? -1 : 0}
        onClick={() => {
          if (soldOut) return;
          if (inCartQty === 0) onAdd();
          else onInc();
        }}
        onKeyDown={(event) => {
          if (soldOut || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          if (inCartQty === 0) onAdd();
          else onInc();
        }}
        className={`p-3 flex w-full max-w-full min-w-0 gap-3 ${soldOut ? "cursor-not-allowed" : "cursor-pointer active:scale-[0.99]"} transition-transform`}
      >
        {product.photo_url ? (
          <img
            src={product.photo_url}
            alt={product.name}
            className="h-20 w-20 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="h-20 w-20 rounded-lg bg-secondary grid place-items-center shrink-0">
            <ShoppingBag className="h-7 w-7 text-muted-foreground" />
          </div>
        )}

        <div className="flex-1 min-w-0 self-center">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="font-semibold truncate">{product.name}</div>
            {badge}
          </div>
          {product.description && (
            <div className="text-xs text-muted-foreground line-clamp-2">{product.description}</div>
          )}
          <div
            className="mt-1 font-bold"
            style={accentColor ? { color: accentColor } : undefined}
          >
            {formatBRL(Number(product.price))}
          </div>
          {stockText && (
            <div
              className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                stockStatus === "out"
                  ? "bg-destructive/15 text-destructive"
                  : stockStatus === "last"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-amber-500/15 text-amber-600"
              }`}
            >
              {stockText}
            </div>
          )}
          <div className="mt-2 flex sm:hidden" onClick={(e) => e.stopPropagation()}>
            {soldOut ? (
              <span className="text-xs font-medium text-destructive">Esgotado</span>
            ) : inCartQty === 0 ? (
              <Button size="sm" className="h-8 rounded-full px-3" style={accentStyle} onClick={onAdd}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
              </Button>
            ) : (
              <div className="inline-grid grid-cols-[32px_28px_32px] items-center gap-1">
                <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={onDec}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="font-bold text-center text-sm">{inCartQty}</span>
                <Button size="icon" className="h-8 w-8 rounded-full" style={accentStyle} onClick={onInc}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <div
          className="hidden w-20 shrink-0 flex-col items-center justify-center gap-1 sm:flex sm:w-24"
          onClick={(e) => e.stopPropagation()}
        >
          {soldOut ? (
            <span className="text-xs font-medium text-destructive whitespace-nowrap">Esgotado</span>
          ) : inCartQty === 0 ? (
            <Button
              size="icon"
              className="h-9 w-9 rounded-full"
              style={accentStyle}
              aria-label={`Adicionar ${product.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          ) : (
            <div className="grid grid-cols-[28px_20px_28px] items-center gap-0.5 sm:grid-cols-[32px_24px_32px] sm:gap-1">
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7 rounded-full sm:h-8 sm:w-8"
                aria-label={`Remover ${product.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDec();
                }}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="font-bold text-center text-sm">{inCartQty}</span>
              <Button
                size="icon"
                className="h-7 w-7 rounded-full sm:h-8 sm:w-8"
                style={accentStyle}
                aria-label={`Adicionar ${product.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onInc();
                }}
                disabled={stockStatus === "out"}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
