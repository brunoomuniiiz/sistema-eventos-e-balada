import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/signup-owner")({
  component: SignupOwnerPage,
});

function SignupOwnerPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { display_name: displayName || email.split("@")[0] },
        },
      });
      if (authErr) throw authErr;
      if (!authData.user) throw new Error("Falha ao criar conta.");

      // Marca como owner na user_roles
      const { error: roleErr } = await supabase.from("user_roles").insert({
        user_id: authData.user.id,
        owner_id: authData.user.id,
        role: "owner",
        permissions: [],
        display_name: displayName || email.split("@")[0],
        email,
      });
      if (roleErr) throw roleErr;

      setDone(true);
      toast.success("Conta de owner criada! Redirecionando...");
      setTimeout(() => navigate({ to: "/" }), 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="h-12 w-12 rounded-2xl bg-gradient-primary grid place-items-center glow-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
        </Link>

        <div className="glass rounded-2xl p-7 md:p-9">
          <h1 className="text-3xl font-bold text-gradient text-center">
            {done ? "Conta criada" : "Criar conta de owner"}
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-1.5">
            {done
              ? "Você já pode começar a usar o NightOps."
              : "Somente para o dono do estabelecimento."}
          </p>

          {!done && (
            <form onSubmit={onSubmit} className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Como você quer ser chamado"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-primary text-primary-foreground hover:scale-[1.02] transition-transform glow-primary"
              >
                {submitting ? "Aguarde..." : <><ShieldCheck className="h-4 w-4 mr-1" /> Criar conta</>}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
