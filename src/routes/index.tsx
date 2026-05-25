import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { getPersonaDestination, useViewAs } from "@/hooks/useViewAs";

export const Route = createFileRoute("/")({
  component: RootRedirect,
});

function RootRedirect() {
  const { user, loading: authLoading } = useAuth();
  const { isOwner, rolePreset, can, lojinhaCanSell, loading: permsLoading } = usePermissions();
  const { persona } = useViewAs();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (permsLoading) return;

    if (persona !== "dono") {
      navigate({ ...getPersonaDestination(persona), replace: true });
      return;
    }

    // 1. Owner / gerente → dashboard
    if (isOwner || rolePreset === "gerente") {
      navigate({ to: "/dashboard", replace: true });
      return;
    }
    // 2. Caixa da portaria
    if (rolePreset === "caixa_portaria" || (can("portaria") && !can("vendas") && !can("lojinha"))) {
      navigate({ to: "/portaria", replace: true });
      return;
    }
    // 3. Caixa do bar / garçom-caixa / qualquer um com vendas → PDV
    if (rolePreset === "caixa_bar" || rolePreset === "garcom_caixa" || can("vendas")) {
      navigate({ to: "/pdv", replace: true });
      return;
    }
    // 4. Garçom puro (validar QR) ou outro perfil com lojinha
    if (rolePreset === "garcom" || lojinhaCanSell || can("lojinha")) {
      navigate({ to: "/lojinha", replace: true });
      return;
    }
    // 5. Fallbacks
    if (can("portaria")) navigate({ to: "/portaria", replace: true });
    else if (can("estoque")) navigate({ to: "/estoque", replace: true });
    else if (can("eventos")) navigate({ to: "/eventos", replace: true });
    else if (can("financeiro")) navigate({ to: "/financeiro", replace: true });
    else if (can("funcionarios")) navigate({ to: "/funcionarios", replace: true });
    else if (can("promoters")) navigate({ to: "/promoters", replace: true });
    else navigate({ to: "/dashboard", replace: true });
  }, [user, authLoading, permsLoading, persona, isOwner, rolePreset, can, lojinhaCanSell, navigate]);

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}
