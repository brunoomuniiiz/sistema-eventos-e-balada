import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [checkedLink, setCheckedLink] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "USER_UPDATED") setReady(true);
    });

    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        let linkError: string | null = null;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            setReady(true);
            url.searchParams.delete("code");
            window.history.replaceState({}, "", url.pathname + url.search + url.hash);
            return;
          }
          linkError = error.message;
        }

        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : "";
        const params = new URLSearchParams(hash);
        const tokenHash = url.searchParams.get("token_hash") || params.get("token_hash");
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
          if (!error) {
            setReady(true);
            window.history.replaceState({}, "", window.location.pathname);
            return;
          }
          linkError = error.message;
        }

        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (!error) {
            setReady(true);
            window.history.replaceState({}, "", window.location.pathname);
            return;
          }
          linkError = error.message;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) setReady(true);
        else if (linkError) toast.error("Link inválido ou expirado. Peça um novo link de recuperação.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Link inválido ou expirado");
      } finally {
        setCheckedLink(true);
      }
    })();

    return () => subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Abra esta página pelo link de recuperação enviado no email.");

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha atualizada! Redirecionando...");
      setTimeout(() => navigate({ to: "/" }), 800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar senha");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="h-12 w-12 rounded-2xl bg-gradient-primary grid place-items-center glow-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
        </div>
        <div className="glass rounded-2xl p-7 md:p-9">
          <h1 className="text-3xl font-bold text-gradient text-center">Nova senha</h1>
          <p className="text-sm text-muted-foreground text-center mt-1.5">
            {ready
              ? "Defina uma nova senha para sua conta"
              : checkedLink
              ? "Digite a senha e confirme usando o link recebido no email"
              : "Validando link de recuperação..."}
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">Nova senha</Label>
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={submitting || password.length < 6}
              className="w-full bg-gradient-primary text-primary-foreground hover:scale-[1.02] transition-transform glow-primary"
            >
              {submitting ? "Aguarde..." : "Atualizar senha"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
