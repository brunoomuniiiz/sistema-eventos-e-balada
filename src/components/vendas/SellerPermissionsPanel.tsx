import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/hooks/usePermissions";
import { UserCog } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: "owner" | "staff";
  permissions: string[];
  aceita_dinheiro: boolean;
  aceita_pix: boolean;
  aceita_cartao: boolean;
  lojinha_can_sell: boolean;
};

export function SellerPermissionsPanel() {
  const { ownerId, isOwner } = usePermissions();
  const qc = useQueryClient();

  const { data: team = [], isLoading } = useQuery({
    queryKey: ["seller-perms", ownerId],
    enabled: !!ownerId && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, display_name, email, role, permissions, aceita_dinheiro, aceita_pix, aceita_cartao, lojinha_can_sell")
        .eq("owner_id", ownerId!)
        .order("role", { ascending: true });
      if (error) throw error;
      return data as Row[];
    },
  });

  const update = async (id: string, patch: Partial<Row>) => {
    const { error } = await supabase.from("user_roles").update(patch as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Atualizado");
    qc.invalidateQueries({ queryKey: ["seller-perms"] });
  };

  const togglePerm = async (row: Row, perm: "vendas" | "lojinha", on: boolean) => {
    const set = new Set(row.permissions ?? []);
    if (on) set.add(perm); else set.delete(perm);
    await update(row.id, { permissions: Array.from(set) });
  };

  if (!isOwner) {
    return <div className="text-sm text-muted-foreground">Sem permissão.</div>;
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-display font-bold flex items-center gap-2"><UserCog className="h-4 w-4 text-primary" /> Permissões de venda por funcionário</h3>
            <p className="text-xs text-muted-foreground">Ative o que cada um pode fazer. Para criar funcionário ou editar avançado, use Configuração &gt; Funcionários.</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/configuracao">Funcionários (avançado)</Link></Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Carregando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 px-2">Funcionário</th>
                  <th className="text-center py-2 px-2">Vender no PDV</th>
                  <th className="text-center py-2 px-2">Vender online/garçom</th>
                  <th className="text-center py-2 px-2">Dinheiro</th>
                  <th className="text-center py-2 px-2">Pix</th>
                  <th className="text-center py-2 px-2">Cartão</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {team.map((m) => {
                  const isOwnerRow = m.role === "owner";
                  const hasVendas = m.permissions?.includes("vendas") ?? false;
                  const hasLojinha = m.permissions?.includes("lojinha") ?? false;
                  return (
                    <tr key={m.id}>
                      <td className="py-2 px-2">
                        <div className="font-medium">{m.display_name ?? m.email ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{m.email}{isOwnerRow ? " · owner" : ""}</div>
                      </td>
                      <td className="text-center py-2 px-2">
                        <Switch disabled={isOwnerRow} checked={isOwnerRow || hasVendas} onCheckedChange={(v) => togglePerm(m, "vendas", v)} />
                      </td>
                      <td className="text-center py-2 px-2">
                        <Switch disabled={isOwnerRow} checked={isOwnerRow || (hasLojinha && m.lojinha_can_sell)} onCheckedChange={async (v) => {
                          await togglePerm(m, "lojinha", v);
                          await update(m.id, { lojinha_can_sell: v });
                        }} />
                      </td>
                      <td className="text-center py-2 px-2">
                        <Switch disabled={isOwnerRow} checked={isOwnerRow || m.aceita_dinheiro} onCheckedChange={(v) => update(m.id, { aceita_dinheiro: v })} />
                      </td>
                      <td className="text-center py-2 px-2">
                        <Switch disabled={isOwnerRow} checked={isOwnerRow || m.aceita_pix} onCheckedChange={(v) => update(m.id, { aceita_pix: v })} />
                      </td>
                      <td className="text-center py-2 px-2">
                        <Switch disabled={isOwnerRow} checked={isOwnerRow || m.aceita_cartao} onCheckedChange={(v) => update(m.id, { aceita_cartao: v })} />
                      </td>
                    </tr>
                  );
                })}
                {team.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Nenhum funcionário cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
