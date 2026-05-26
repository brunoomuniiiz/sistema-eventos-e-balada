import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck, KeyRound } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { grantViaPin, hasOwnerPin } from "@/lib/owner-pin.functions";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

type Scope = "withdrawal" | "discount" | "closing" | "open_cash" | "operation" | "refund" | "report";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: Scope;
  title: string;
  description: string;
  onApproved: (token: string, authorizedByName: string) => void;
}

export function AuthorizationDialog({ open, onOpenChange, scope, title, description, onApproved }: Props) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const fnPin = useServerFn(grantViaPin);
  const fnHas = useServerFn(hasOwnerPin);

  const { data: pinStatus } = useQuery({
    queryKey: ["has-owner-pin"],
    queryFn: () => fnHas(),
    staleTime: 60_000,
    enabled: open,
  });

  useEffect(() => {
    if (open) setPin("");
  }, [open]);

  const submit = async () => {
    if (!/^[0-9]{4,8}$/.test(pin)) {
      toast.error("Digite o PIN (4 a 8 dígitos)");
      return;
    }
    setLoading(true);
    try {
      const res = await fnPin({ data: { pin, scope } });
      onApproved(res.token, res.authorized_by_name);
      toast.success(`Autorizado por ${res.authorized_by_name}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na autorização");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {pinStatus && !pinStatus.exists ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm space-y-2">
            <p className="font-medium">PIN do dono ainda não foi cadastrado.</p>
            <p className="text-muted-foreground text-xs">Vá em <Link to="/minha-conta" className="underline">Minha conta</Link> e cadastre um PIN antes de autorizar operações sensíveis.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Label className="flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> PIN do dono</Label>
            <Input
              autoFocus
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="••••"
              className="h-14 text-2xl text-center tracking-[0.6em] font-bold"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || (pinStatus && !pinStatus.exists)}>
            {loading ? "Verificando..." : "Autorizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
