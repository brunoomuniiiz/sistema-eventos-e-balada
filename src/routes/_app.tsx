import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { OperationPinProvider } from "@/hooks/useOperationPin";


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
      <AppLayout />
    </OperationPinProvider>
  );
}
