import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { LiveDashboardPanel } from "@/components/vendas/LiveDashboardPanel";
import { usePermissions } from "@/hooks/usePermissions";

export const Route = createFileRoute("/_app/ao-vivo")({
  component: AoVivoPage,
});

function AoVivoPage() {
  const { isOwner, can, loading } = usePermissions();
  if (loading) return null;
  const allowed = isOwner || can("vendas") || can("financeiro");
  if (!allowed) {
    return <PageHeader title="Ao vivo" subtitle="Você não tem permissão para acessar esta página" />;
  }
  return (
    <div className="space-y-4">
      <PageHeader title="Painel ao vivo" subtitle="Acompanhamento em tempo real do evento" />
      <LiveDashboardPanel />
    </div>
  );
}
