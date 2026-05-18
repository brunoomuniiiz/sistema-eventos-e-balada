import { createFileRoute } from "@tanstack/react-router";
import { Settings, Package, ScanLine } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LojinhaSettingsPanel } from "@/lojinha/components/LojinhaSettingsPanel";
import { LojinhaOrdersPanel } from "@/lojinha/components/LojinhaOrdersPanel";
import { LojinhaScanner } from "@/lojinha/components/LojinhaScanner";
import { usePermissions } from "@/hooks/usePermissions";

export const Route = createFileRoute("/_app/lojinha")({
  component: LojinhaPage,
});

function LojinhaPage() {
  const { isOwner } = usePermissions();

  return (
    <div className="space-y-6">
      <PageHeader title="Lojinha" subtitle="Venda online com QR code para retirada no balcão" />
      <Tabs defaultValue="scanner">
        <TabsList>
          <TabsTrigger value="scanner"><ScanLine className="h-4 w-4 mr-1.5" /> Validar QR</TabsTrigger>
          <TabsTrigger value="pedidos"><Package className="h-4 w-4 mr-1.5" /> Pedidos</TabsTrigger>
          {isOwner && <TabsTrigger value="config"><Settings className="h-4 w-4 mr-1.5" /> Configuração</TabsTrigger>}
        </TabsList>
        <TabsContent value="scanner" className="mt-4"><LojinhaScanner /></TabsContent>
        <TabsContent value="pedidos" className="mt-4"><LojinhaOrdersPanel /></TabsContent>
        {isOwner && <TabsContent value="config" className="mt-4"><LojinhaSettingsPanel /></TabsContent>}
      </Tabs>
    </div>
  );
}
