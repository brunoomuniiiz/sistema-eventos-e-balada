import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarIdentityPanel } from "@/components/config/BarIdentityPanel";
import { TeamPanel } from "@/components/config/TeamPanel";
import { PromotersPanel } from "@/components/config/PromotersPanel";
import { Settings, UserCog, Users } from "lucide-react";

export const Route = createFileRoute("/_app/configuracao")({
  component: ConfiguracaoPage,
});

function ConfiguracaoPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Configuração" subtitle="Identidade do bar, funcionários e promoters" />
      <Tabs defaultValue="identidade">
        <TabsList>
          <TabsTrigger value="identidade"><Settings className="h-4 w-4 mr-1.5" /> Identidade</TabsTrigger>
          <TabsTrigger value="funcionarios"><UserCog className="h-4 w-4 mr-1.5" /> Funcionários</TabsTrigger>
          <TabsTrigger value="promoters"><Users className="h-4 w-4 mr-1.5" /> Promoters</TabsTrigger>
        </TabsList>
        <TabsContent value="identidade" className="mt-4"><BarIdentityPanel /></TabsContent>
        <TabsContent value="funcionarios" className="mt-4"><TeamPanel /></TabsContent>
        <TabsContent value="promoters" className="mt-4"><PromotersPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
