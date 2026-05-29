import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, PackageCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  source: "sale" | "order";
  id: string;
  className?: string;
  onDelivered?: () => void;
}

/**
 * Botão de entrega manual (quando a impressão está desligada).
 * - Estado inicial: "Entregar" (primário).
 * - Após clique: chama order_release e vira "Entreguei" (verde, desabilitado).
 */
export function DeliverButton({ source, id, className, onDelivered }: Props) {
  const [loading, setLoading] = useState(false);
  const [delivered, setDelivered] = useState(false);

  const handleClick = async () => {
    if (loading || delivered) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc("order_release", { _source: source, _id: id });
      if (error) throw error;
      setDelivered(true);
      onDelivered?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao marcar como entregue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={loading || delivered}
      size="lg"
      className={cn(
        "w-full h-14 text-base font-bold gap-2 transition-colors",
        delivered && "bg-success text-success-foreground hover:bg-success disabled:opacity-100",
        className,
      )}
    >
      {loading ? (
        <><Loader2 className="h-5 w-5 animate-spin" /> Confirmando…</>
      ) : delivered ? (
        <><CheckCircle2 className="h-5 w-5" /> Entreguei</>
      ) : (
        <><PackageCheck className="h-5 w-5" /> Entregar</>
      )}
    </Button>
  );
}
