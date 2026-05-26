import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CompactTabsList, CompactTabsTrigger } from "@/components/ui/compact-tabs";
import { BarIdentityPanel } from "@/components/config/BarIdentityPanel";
import { TeamPanel } from "@/components/config/TeamPanel";
import { PromotersPanel } from "@/components/config/PromotersPanel";
import { LojinhaDevicesPanel } from "@/lojinha/components/LojinhaDevicesPanel";
import { PaymentTerminalsPanel } from "@/components/config/PaymentTerminalsPanel";
import { PrintersPanel } from "@/components/config/PrintersPanel";
import { usePermissions } from "@/hooks/usePermissions";
import { Settings, UserCog, Users, Smartphone, CreditCard, Printer } from "lucide-react";
import { MinhaContaPage } from "@/routes/_app.minha-conta";

export const Route = createFileRoute("/_app/configuracao")({
  component: ConfiguracaoPage,
});

function ConfiguracaoPage() {
  const { isOwner, rolePreset } = usePermissions();

  if (rolePreset === "promoter" && !isOwner) {
    return <MinhaContaPage />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Configuração" subtitle="Identidade, funcionários, promoters, maquininhas e impressoras" />
      <Tabs defaultValue={isOwner ? "identidade" : "promoters"}>
        <CompactTabsList>
          {isOwner && <CompactTabsTrigger value="identidade" icon={Settings} short="Ident.">Identidade</CompactTabsTrigger>}
          {isOwner && <CompactTabsTrigger value="funcionarios" icon={UserCog} short="Func.">Funcionários</CompactTabsTrigger>}
          <CompactTabsTrigger value="promoters" icon={Users} short="Promo.">Promoters</CompactTabsTrigger>
          {isOwner && <CompactTabsTrigger value="cartoes" icon={CreditCard} short="Cart.">Maquininhas</CompactTabsTrigger>}
          {isOwner && <CompactTabsTrigger value="impressoras" icon={Printer} short="Impr.">Impressoras</CompactTabsTrigger>}
          {isOwner && <CompactTabsTrigger value="mp_point" icon={Smartphone} short="MP">MP Point Lojinha</CompactTabsTrigger>}
        </CompactTabsList>
        {isOwner && <TabsContent value="identidade" className="mt-4"><BarIdentityPanel /></TabsContent>}
        {isOwner && <TabsContent value="funcionarios" className="mt-4"><TeamPanel /></TabsContent>}
        <TabsContent value="promoters" className="mt-4"><PromotersPanel /></TabsContent>
        {isOwner && <TabsContent value="cartoes" className="mt-4"><PaymentTerminalsPanel /></TabsContent>}
        {isOwner && <TabsContent value="impressoras" className="mt-4"><PrintersPanel /></TabsContent>}
        {isOwner && <TabsContent value="mp_point" className="mt-4"><LojinhaDevicesPanel /></TabsContent>}
      </Tabs>
    </div>
  );
}
