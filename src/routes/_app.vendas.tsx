import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CompactTabsList, CompactTabsTrigger } from "@/components/ui/compact-tabs";
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
    rolePreset, canPdvCaixa, canVenderGarcom, canValidarQr, canVerPedidos, canVerHistorico,
  } = usePermissions();
  const isManager = isOwner || can("financeiro");
  const { tab } = useSearch({ from: "/_app/vendas" });
  const navigate = useNavigate();

  const hasAny = canPdvCaixa || canVenderGarcom || canValidarQr || canVerPedidos || canVerHistorico || isManager;
  const showPdvCaixa = canPdvCaixa;
  const showPdvGarcom = canVenderGarcom;
  const allowedTabs = [
    ...(isManager ? ["caixas"] : []),
    ...(showPdvCaixa ? ["pdv"] : []),
    ...(showPdvGarcom ? ["vender"] : []),
    ...(canValidarQr ? ["scanner"] : []),
    ...(canVerPedidos ? ["pedidos"] : []),
    ...(canVerHistorico ? ["historico"] : []),
    ...(isOwner ? ["abandonados", "config"] : []),
  ];
  const defaultTab = isManager ? "caixas" : showPdvCaixa ? "pdv" : showPdvGarcom ? "vender" : canValidarQr ? "scanner" : canVerPedidos ? "pedidos" : "historico";
  const currentTab = tab && allowedTabs.includes(tab) ? tab : defaultTab;

  useEffect(() => {
    if (loading || !hasAny || !tab || allowedTabs.includes(tab)) return;
    navigate({ to: "/vendas", search: { tab: defaultTab }, replace: true });
  }, [loading, hasAny, tab, allowedTabs, defaultTab, navigate]);

  if (loading) return null;
  if (!hasAny) {
    return <PageHeader title="Vendas" subtitle="Você não tem permissão para acessar esta página" />;
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Vendas" subtitle="PDV, pedidos online, entregas e caixas" />
      <Tabs
        value={currentTab}
        onValueChange={(v) => navigate({ to: "/vendas", search: { tab: v }, replace: true })}
        className="space-y-4"
      >
        <CompactTabsList>
          {isManager && <CompactTabsTrigger value="caixas" icon={Wallet} short="Cx.">Caixas</CompactTabsTrigger>}
          {showPdvCaixa && <CompactTabsTrigger value="pdv" icon={ShoppingCart} short="PDV">PDV Caixa</CompactTabsTrigger>}
          {showPdvGarcom && <CompactTabsTrigger value="vender" icon={Store} short="Garçom">Vender (garçom)</CompactTabsTrigger>}
          {canValidarQr && <CompactTabsTrigger value="scanner" icon={ScanLine} short="QR">Validar QR</CompactTabsTrigger>}
          {canVerPedidos && <CompactTabsTrigger value="pedidos" icon={Package} short="Ped.">Pedidos</CompactTabsTrigger>}
          {canVerHistorico && <CompactTabsTrigger value="historico" icon={Receipt} short="Hist.">Histórico</CompactTabsTrigger>}
          {isOwner && <CompactTabsTrigger value="abandonados" icon={AlertTriangle} short="Aband.">Abandonados</CompactTabsTrigger>}
          {isOwner && <CompactTabsTrigger value="config" icon={Settings} short="Conf.">Configuração</CompactTabsTrigger>}
        </CompactTabsList>

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
