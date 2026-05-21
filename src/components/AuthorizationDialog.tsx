import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { requestAuthGrant } from "@/lib/auth-grant.functions";
import { toast } from "sonner";

type Scope = "withdrawal" | "discount" | "closing" | "open_cash";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: Scope;
  title: string;
  description: string;
  onApproved: (token: string, authorizedByName: string) => void;
}

export function AuthorizationDialog({ open, onOpenChange, scope, title, description, onApproved }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const fn = useServerFn(requestAuthGrant);

  const submit = async () => {
    if (!email || !password) return toast.error("Preencha e-mail e senha");
    setLoading(true);
    try {
      const res = await fn({ data: { email: email.trim(), password, scope } });
      onApproved(res.token, res.authorized_by_name);
      onOpenChange(false);
      setEmail(""); setPassword("");
      toast.success(`Autorizado por ${res.authorized_by_name}`);
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
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> {title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
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
        </div>
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
