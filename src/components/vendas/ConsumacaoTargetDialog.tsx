import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Music2, Disc3, ShieldCheck, UserCog, Gift } from "lucide-react";

export type ConsumacaoTarget = "banda" | "dj" | "seguranca" | "funcionario" | "sorteio";

const OPTIONS: { value: ConsumacaoTarget; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: "banda", label: "Banda", icon: <Music2 className="h-5 w-5" />, hint: "Atração musical contratada" },
  { value: "dj", label: "DJ", icon: <Disc3 className="h-5 w-5" />, hint: "DJ residente ou convidado" },
  { value: "seguranca", label: "Segurança", icon: <ShieldCheck className="h-5 w-5" />, hint: "Equipe de portaria/segurança" },
  { value: "funcionario", label: "Funcionário", icon: <UserCog className="h-5 w-5" />, hint: "Equipe da casa" },
  { value: "sorteio", label: "Ganhador sorteio", icon: <Gift className="h-5 w-5" />, hint: "Prêmio / cortesia promocional" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (target: ConsumacaoTarget) => void;
}

export function ConsumacaoTargetDialog({ open, onOpenChange, onPick }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Para quem é essa consumação?</DialogTitle>
          <DialogDescription>
            Os itens saem do estoque na hora e <strong>não</strong> entram no faturamento.
            O custo é somado no fechamento do evento.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onPick(o.value); onOpenChange(false); }}
              className="text-left p-3 rounded-xl border bg-card hover:border-primary hover:bg-primary/5 transition active:scale-[0.98]"
            >
              <div className="flex items-center gap-2 font-semibold">
                <span className="text-primary">{o.icon}</span>
                {o.label}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{o.hint}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
