import { createFileRoute } from "@tanstack/react-router";
import { Settings, Package, ScanLine, Smartphone, Store } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LojinhaSettingsPanel } from "@/lojinha/components/LojinhaSettingsPanel";
import { LojinhaOrdersPanel } from "@/lojinha/components/LojinhaOrdersPanel";
import { LojinhaScanner } from "@/lojinha/components/LojinhaScanner";
import { LojinhaDevicesPanel } from "@/lojinha/components/LojinhaDevicesPanel";
import { LojinhaPosView } from "@/lojinha/components/LojinhaPosView";
import { usePermissions } from "@/hooks/usePermissions";

export const Route = createFileRoute("/_app/lojinha")({
  component: LojinhaPage,
});

function LojinhaPage() {
  const { isOwner, lojinhaCanSell } = usePermissions();
  const defaultTab = lojinhaCanSell ? "pdv" : "scanner";

  return (
    <div className="space-y-6">
      <PageHeader title="Lojinha" subtitle="Venda online + balcão com QR ou maquininha" />
      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex-wrap h-auto">
          {lojinhaCanSell && <TabsTrigger value="pdv"><Store className="h-4 w-4 mr-1.5" /> Vender</TabsTrigger>}
          <TabsTrigger value="scanner"><ScanLine className="h-4 w-4 mr-1.5" /> Validar QR</TabsTrigger>
          <TabsTrigger value="pedidos"><Package className="h-4 w-4 mr-1.5" /> Pedidos</TabsTrigger>
          {isOwner && <TabsTrigger value="devices"><Smartphone className="h-4 w-4 mr-1.5" /> Maquininhas</TabsTrigger>}
          {isOwner && <TabsTrigger value="config"><Settings className="h-4 w-4 mr-1.5" /> Configuração</TabsTrigger>}
        </TabsList>
        {lojinhaCanSell && <TabsContent value="pdv" className="mt-4"><LojinhaPosView /></TabsContent>}
        <TabsContent value="scanner" className="mt-4"><LojinhaScanner /></TabsContent>
        <TabsContent value="pedidos" className="mt-4"><LojinhaOrdersPanel /></TabsContent>
        {isOwner && <TabsContent value="devices" className="mt-4"><LojinhaDevicesPanel /></TabsContent>}
        {isOwner && <TabsContent value="config" className="mt-4"><LojinhaSettingsPanel /></TabsContent>}
      </Tabs>
    </div>
  );
}
