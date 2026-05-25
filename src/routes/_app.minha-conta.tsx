import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserCog, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_app/minha-conta")({
  component: MinhaContaPage,
});

function MinhaContaPage() {
  const { user } = useAuth();
  const { rolePreset } = usePermissions();
  const qc = useQueryClient();

  const { data: row } = useQuery({
    queryKey: ["my-role-row", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("id, display_name, email")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const [name, setName] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  // hidrata o nome quando carrega
  if (row && name === "" && row.display_name) {
    setName(row.display_name);
  }

  const saveName = async () => {
    if (!row) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ display_name: name.trim() || null })
        .eq("id", row.id);
      if (error) throw error;
      toast.success("Nome atualizado");
      qc.invalidateQueries({ queryKey: ["my-role-row"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async () => {
    if (pwd.length < 6) return toast.error("Senha mínima de 6 caracteres");
    if (pwd !== pwd2) return toast.error("As senhas não coincidem");
    setSavingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      toast.success("Senha alterada");
      setPwd(""); setPwd2("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <PageHeader title="Minha conta" subtitle={rolePreset === "promoter" ? "Sua área de promoter" : "Dados pessoais"} />

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><UserCog className="h-4 w-4 text-primary" /> Identificação</div>
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={row?.email ?? user?.email ?? ""} disabled />
            <p className="text-[11px] text-muted-foreground">Troca de email em breve.</p>
          </div>
          <Button onClick={saveName} disabled={savingName} className="bg-gradient-primary text-primary-foreground">
            {savingName ? "Salvando..." : "Salvar nome"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" /> Trocar senha</div>
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Confirmar nova senha</Label>
            <Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
          </div>
          <Button onClick={savePassword} disabled={savingPwd} variant="outline">
            {savingPwd ? "Alterando..." : "Alterar senha"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="p-4 text-xs text-muted-foreground">
          Em breve: foto de perfil, troca de email, telefone/WhatsApp e Pix para receber comissões.
        </CardContent>
      </Card>
    </div>
  );
}
