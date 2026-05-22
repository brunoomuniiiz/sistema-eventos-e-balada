import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Store, ScanLine, Package, AlertTriangle, Settings, Receipt, ShoppingCart, Wallet } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { PdvView } from "./_app.pdv";
import { SalesHistory } from "@/components/vendas/SalesHistory";
import { CashGate } from "@/components/caixa/CashGate";
import { LojinhaPosView } from "@/lojinha/components/LojinhaPosView";
import { LojinhaScanner } from "@/lojinha/components/LojinhaScanner";
import { LojinhaOrdersPanel } from "@/lojinha/components/LojinhaOrdersPanel";
import { LojinhaAbandonedPanel } from "@/lojinha/components/LojinhaAbandonedPanel";
import { LojinhaSettingsPanel } from "@/lojinha/components/LojinhaSettingsPanel";
import { SellerPermissionsPanel } from "@/components/vendas/SellerPermissionsPanel";
import { CaixasAdminPanel } from "@/components/vendas/CaixasAdminPanel";

type VendasSearch = { tab?: string };

export const Route = createFileRoute("/_app/vendas")({
  component: VendasPage,
  validateSearch: (s: Record<string, unknown>): VendasSearch => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
});

function VendasPage() {
  const {
    ownerId, isOwner, loading, can,
    canPdvCaixa, canVenderGarcom, canValidarQr, canVerPedidos, canVerHistorico,
  } = usePermissions();
  const isManager = isOwner || can("financeiro");
  const { tab } = useSearch({ from: "/_app/vendas" });
  const navigate = useNavigate();

  if (loading) return null;
  const hasAny = canPdvCaixa || canVenderGarcom || canValidarQr || canVerPedidos || canVerHistorico || isManager;
  if (!hasAny) {
    return <PageHeader title="Vendas" subtitle="Você não tem permissão para acessar esta página" />;
  }

  const showPdvCaixa = canPdvCaixa;
  const showPdvGarcom = canVenderGarcom;
  const defaultTab = isManager ? "caixas" : showPdvCaixa ? "pdv" : showPdvGarcom ? "vender" : canValidarQr ? "scanner" : canVerPedidos ? "pedidos" : "historico";
  const currentTab = tab ?? defaultTab;

  return (
    <div className="space-y-4">
      <PageHeader title="Vendas" subtitle="PDV, pedidos online, entregas e caixas" />
      <Tabs
        value={currentTab}
        onValueChange={(v) => navigate({ to: "/vendas", search: { tab: v }, replace: true })}
        className="space-y-4"
      >
        <TabsList className="flex-wrap h-auto">
          {isManager && <TabsTrigger value="caixas"><Wallet className="h-4 w-4 mr-1.5" /> Caixas</TabsTrigger>}
          {showPdvCaixa && <TabsTrigger value="pdv"><ShoppingCart className="h-4 w-4 mr-1.5" /> PDV Caixa</TabsTrigger>}
          {showPdvGarcom && <TabsTrigger value="vender"><Store className="h-4 w-4 mr-1.5" /> Vender (garçom)</TabsTrigger>}
          {canValidarQr && <TabsTrigger value="scanner"><ScanLine className="h-4 w-4 mr-1.5" /> Validar QR</TabsTrigger>}
          {canVerPedidos && <TabsTrigger value="pedidos"><Package className="h-4 w-4 mr-1.5" /> Pedidos</TabsTrigger>}
          {canVerHistorico && <TabsTrigger value="historico"><Receipt className="h-4 w-4 mr-1.5" /> Histórico</TabsTrigger>}
          {isOwner && <TabsTrigger value="abandonados"><AlertTriangle className="h-4 w-4 mr-1.5" /> Abandonados</TabsTrigger>}
          {isOwner && <TabsTrigger value="config"><Settings className="h-4 w-4 mr-1.5" /> Configuração</TabsTrigger>}
        </TabsList>

        {isManager && <TabsContent value="caixas"><CaixasAdminPanel /></TabsContent>}

        {showPdvCaixa && (
          <TabsContent value="pdv">
            <CashGate sector="bar" sectorLabel="Bar"><PdvView /></CashGate>
          </TabsContent>
        )}
        {showPdvGarcom && (
          <TabsContent value="vender"><LojinhaPosView /></TabsContent>
        )}
        {canValidarQr && <TabsContent value="scanner"><LojinhaScanner /></TabsContent>}
        {canVerPedidos && <TabsContent value="pedidos"><LojinhaOrdersPanel /></TabsContent>}
        {canVerHistorico && <TabsContent value="historico"><SalesHistory ownerId={ownerId} /></TabsContent>}
        {isOwner && <TabsContent value="abandonados"><LojinhaAbandonedPanel /></TabsContent>}
        {isOwner && (
          <TabsContent value="config" className="space-y-4">
            <SellerPermissionsPanel />
            <LojinhaSettingsPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
