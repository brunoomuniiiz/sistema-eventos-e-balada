import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useOperationPin } from "@/hooks/useOperationPin";

export function OperationPinLockButton({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const { isUnlocked, lock, authorizedByName } = useOperationPin();
  if (!isUnlocked) return null;

  if (variant === "full") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => lock(false)}
        className="gap-2 border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
        title={`Destravado por ${authorizedByName ?? "—"}`}
      >
        <Lock className="h-3.5 w-3.5" /> Trancar PIN
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => lock(false)}
      className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
      title={`Destravado por ${authorizedByName ?? "—"} — toque para trancar`}
    >
      <Lock className="h-4 w-4" />
    </Button>
  );
}
