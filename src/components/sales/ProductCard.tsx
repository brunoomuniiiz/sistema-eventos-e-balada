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
    <Card className={`overflow-hidden ${soldOut ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={() => {
          if (soldOut) return;
          if (inCartQty === 0) onAdd();
          else onInc();
        }}
        disabled={soldOut}
        className={`w-full text-left ${soldOut ? "cursor-not-allowed" : "active:scale-[0.99]"} transition-transform`}
      >
        <CardContent className="p-3 flex gap-3">
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

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="font-medium truncate">{product.name}</div>
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
          </div>

          <div
            className="flex flex-col items-center justify-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {soldOut ? (
              <span className="text-xs font-medium text-destructive whitespace-nowrap">Esgotado</span>
            ) : inCartQty === 0 ? (
              <Button asChild size="sm" style={accentStyle}>
                <span>
                  <Plus className="h-4 w-4" />
                </span>
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDec();
                  }}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="font-bold w-5 text-center text-sm">{inCartQty}</span>
                <Button
                  size="icon"
                  className="h-7 w-7"
                  style={accentStyle}
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
      </button>
    </Card>
  );
}
