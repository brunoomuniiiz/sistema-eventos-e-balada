import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck, KeyRound } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { requestAuthGrant } from "@/lib/auth-grant.functions";
import { grantViaPin, hasOwnerPin } from "@/lib/owner-pin.functions";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

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
  const [mode, setMode] = useState<"pin" | "email">("pin");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const fnEmail = useServerFn(requestAuthGrant);
  const fnPin = useServerFn(grantViaPin);
  const fnHas = useServerFn(hasOwnerPin);

  // Detecta se workspace tem PIN cadastrado pra escolher modo padrão
  const { data: pinStatus } = useQuery({
    queryKey: ["has-owner-pin"],
    queryFn: () => fnHas(),
    staleTime: 60_000,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setMode(pinStatus?.exists ? "pin" : "email");
      setPin(""); setEmail(""); setPassword("");
    }
  }, [open, pinStatus]);

  const scopeForEmail = (["operation", "refund", "report"] as Scope[]).includes(scope)
    ? "withdrawal" // server fn antigo não conhece os novos scopes; mantém compatibilidade
    : scope as "withdrawal" | "discount" | "closing" | "open_cash";

  const submit = async () => {
    setLoading(true);
    try {
      if (mode === "pin") {
        if (!/^[0-9]{4,8}$/.test(pin)) return toast.error("Digite o PIN (4 a 8 dígitos)");
        const res = await fnPin({ data: { pin, scope } });
        onApproved(res.token, res.authorized_by_name);
        toast.success(`Autorizado por ${res.authorized_by_name}`);
      } else {
        if (!email || !password) return toast.error("Preencha e-mail e senha");
        const res = await fnEmail({ data: { email: email.trim(), password, scope: scopeForEmail } });
        onApproved(res.token, res.authorized_by_name);
        toast.success(`Autorizado por ${res.authorized_by_name}`);
      }
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

        {mode === "pin" ? (
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
            <button
              type="button"
              onClick={() => setMode("email")}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Usar e-mail e senha
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>E-mail do responsável</Label>
              <Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dono@bar.com" />
            </div>
            <div>
              <Label>Senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            </div>
            {pinStatus?.exists && (
              <button
                type="button"
                onClick={() => setMode("pin")}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Voltar para PIN
              </button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Verificando..." : "Autorizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
