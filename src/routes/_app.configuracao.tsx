import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarIdentityPanel } from "@/components/config/BarIdentityPanel";
import { TeamPanel } from "@/components/config/TeamPanel";
import { PromotersPanel } from "@/components/config/PromotersPanel";
import { LojinhaDevicesPanel } from "@/lojinha/components/LojinhaDevicesPanel";
import { usePermissions } from "@/hooks/usePermissions";
import { Settings, UserCog, Users, Smartphone } from "lucide-react";

export const Route = createFileRoute("/_app/configuracao")({
  component: ConfiguracaoPage,
});

function ConfiguracaoPage() {
  const { isOwner } = usePermissions();
  return (
    <div className="space-y-6">
      <PageHeader title="Configuração" subtitle="Identidade do bar, funcionários, promoters e maquininhas" />
      <Tabs defaultValue="identidade">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="identidade"><Settings className="h-4 w-4 mr-1.5" /> Identidade</TabsTrigger>
          <TabsTrigger value="funcionarios"><UserCog className="h-4 w-4 mr-1.5" /> Funcionários</TabsTrigger>
          <TabsTrigger value="promoters"><Users className="h-4 w-4 mr-1.5" /> Promoters</TabsTrigger>
          {isOwner && <TabsTrigger value="maquininhas"><Smartphone className="h-4 w-4 mr-1.5" /> Maquininhas</TabsTrigger>}
        </TabsList>
        <TabsContent value="identidade" className="mt-4"><BarIdentityPanel /></TabsContent>
        <TabsContent value="funcionarios" className="mt-4"><TeamPanel /></TabsContent>
        <TabsContent value="promoters" className="mt-4"><PromotersPanel /></TabsContent>
        {isOwner && <TabsContent value="maquininhas" className="mt-4"><LojinhaDevicesPanel /></TabsContent>}
      </Tabs>
    </div>
  );
}
