import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { OperationPinProvider } from "@/hooks/useOperationPin";
import { usePermissions } from "@/hooks/usePermissions";
import { useOperationWindow } from "@/hooks/useOperationWindow";
import { OperationClosedScreen } from "@/components/OperationClosedScreen";

export const Route = createFileRoute("/_app")({
  component: AppGuard,
});

function AppGuard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", replace: true });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <OperationPinProvider>
      <OperationGate />
    </OperationPinProvider>
  );
}

/**
 * Fora da janela de operação:
 *   - Owner passa direto.
 *   - Quem tem permissão de eventos OU promoters (gestão) passa direto (vê só essas abas via AppLayout).
 *   - Funcionário vinculado a promoter (promoter_id) é redirecionado pra /meus-eventos.
 *   - Demais funcionários veem a tela "Bar fechado".
 */
function OperationGate() {
  const { isOwner, realIsOwner, can, promoterId, rolePreset, loading } = usePermissions();
  const window = useOperationWindow();
  const navigate = useNavigate();

  const hasEventosOrPromoters = can("eventos") || can("promoters");
  const isPromoterMode = rolePreset === "promoter" && !isOwner;

  // Funcionário comum vinculado a promoter: força a área do promoter
  useEffect(() => {
    if (loading) return;
    if (window.isOpen) return;
    if (realIsOwner || isOwner || hasEventosOrPromoters || isPromoterMode) return;
    if (promoterId) {
      navigate({ to: "/meus-eventos", replace: true });
    }
  }, [loading, window.isOpen, realIsOwner, isOwner, hasEventosOrPromoters, isPromoterMode, promoterId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (
    !window.isOpen &&
    !realIsOwner &&
    !isOwner &&
    !hasEventosOrPromoters &&
    !isPromoterMode &&
    !promoterId
  ) {
    return (
      <OperationClosedScreen
        nextOpenAt={window.opensAt}
        nextEventName={window.eventName}
      />
    );
  }

  return <AppLayout />;
}
