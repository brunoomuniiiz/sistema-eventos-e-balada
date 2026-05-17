import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

export const Route = createFileRoute("/")({
  component: RootRedirect,
});

function RootRedirect() {
  const { user, loading: authLoading } = useAuth();
  const { isOwner, can, loading: permsLoading } = usePermissions();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (permsLoading) return;
    if (isOwner || can("financeiro")) {
      navigate({ to: "/dashboard", replace: true });
    } else if (can("vendas")) {
      navigate({ to: "/pdv", replace: true });
    } else if (can("portaria")) {
      navigate({ to: "/portaria", replace: true });
    } else if (can("estoque")) {
      navigate({ to: "/estoque", replace: true });
    } else {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [user, authLoading, permsLoading, isOwner, can, navigate]);

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}
