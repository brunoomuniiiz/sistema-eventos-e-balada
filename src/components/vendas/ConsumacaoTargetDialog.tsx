import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Music2, Disc3, ShieldCheck, UserCog, Gift, ArrowLeft } from "lucide-react";

export type ConsumacaoTarget = "banda" | "dj" | "seguranca" | "funcionario" | "sorteio";

const OPTIONS: { value: ConsumacaoTarget; label: string; icon: React.ReactNode; hint: string; placeholder: string }[] = [
  { value: "banda", label: "Banda", icon: <Music2 className="h-5 w-5" />, hint: "Atração musical contratada", placeholder: "ex.: Banda Os Caras" },
  { value: "dj", label: "DJ", icon: <Disc3 className="h-5 w-5" />, hint: "DJ residente ou convidado", placeholder: "ex.: DJ Fulano" },
  { value: "seguranca", label: "Segurança", icon: <ShieldCheck className="h-5 w-5" />, hint: "Equipe de portaria/segurança", placeholder: "ex.: Gledson (som)" },
  { value: "funcionario", label: "Funcionário", icon: <UserCog className="h-5 w-5" />, hint: "Equipe da casa", placeholder: "ex.: nome do funcionário" },
  { value: "sorteio", label: "Ganhador sorteio", icon: <Gift className="h-5 w-5" />, hint: "Prêmio / cortesia promocional", placeholder: "ex.: nome do ganhador" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (target: ConsumacaoTarget, recipientName: string | null) => void;
}

export function ConsumacaoTargetDialog({ open, onOpenChange, onPick }: Props) {
  const [picked, setPicked] = useState<ConsumacaoTarget | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) { setPicked(null); setName(""); }
  }, [open]);

  const current = picked ? OPTIONS.find((o) => o.value === picked)! : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{picked ? `Consumação · ${current?.label}` : "Para quem é essa consumação?"}</DialogTitle>
          <DialogDescription>
            {picked
              ? "Quem pegou? (opcional — ajuda no histórico e no abatimento da parcela do som)"
              : <>Os itens saem do estoque na hora e <strong>não</strong> entram no faturamento. O custo é somado no fechamento do evento.</>}
          </DialogDescription>
        </DialogHeader>

        {!picked ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setPicked(o.value)}
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
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Nome de quem pegou (opcional)</Label>
              <Input
                autoFocus
                placeholder={current?.placeholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onPick(picked, name.trim() || null);
                    onOpenChange(false);
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Se essa pessoa tiver uma parcela com "abate automático" configurada, o valor balcão dos itens será descontado da próxima parcela em aberto.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setPicked(null)}>
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button
                onClick={() => {
                  onPick(picked, name.trim() || null);
                  onOpenChange(false);
                }}
              >
                Lançar consumação
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
