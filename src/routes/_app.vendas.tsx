import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LockKeyhole } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { PdvView } from "./_app.pdv";
import { SalesHistory } from "@/components/vendas/SalesHistory";
import { CashClosingDialog } from "@/components/vendas/CashClosingDialog";
import { SessionWithdrawalsCard } from "@/components/vendas/SessionWithdrawalsCard";
import { CashGate } from "@/components/caixa/CashGate";

export const Route = createFileRoute("/_app/vendas")({
  component: VendasPage,
});

function VendasPage() {
  const { ownerId, can, loading } = usePermissions();
  const [closing, setClosing] = useState(false);

  if (loading) return null;
  if (!can("vendas")) {
    return <PageHeader title="Vendas" subtitle="Você não tem permissão para acessar esta página" />;
  }

  return (
    <Tabs defaultValue="pdv" className="space-y-4">
      <TabsList>
        <TabsTrigger value="pdv">PDV</TabsTrigger>
        <TabsTrigger value="historico">Histórico</TabsTrigger>
        <TabsTrigger value="fechamento">Fechamento</TabsTrigger>
      </TabsList>
      <TabsContent value="pdv"><CashGate sector="bar" sectorLabel="Bar"><PdvView /></CashGate></TabsContent>
      <TabsContent value="historico"><SalesHistory ownerId={ownerId} /></TabsContent>
      <TabsContent value="fechamento" className="space-y-4">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <h3 className="font-display font-bold text-lg">Fechamento cego do caixa</h3>
              <p className="text-sm text-muted-foreground">
                Declare os totais de cada forma de pagamento sem ver o esperado. Requer autorização do responsável.
              </p>
            </div>
            <Button onClick={() => setClosing(true)} className="w-full md:w-auto">
              <LockKeyhole className="h-4 w-4" /> Iniciar fechamento
            </Button>
          </CardContent>
        </Card>
        <SessionWithdrawalsCard />
        <CashClosingDialog open={closing} onOpenChange={setClosing} onDone={() => setClosing(false)} />
      </TabsContent>
    </Tabs>
  );
}
