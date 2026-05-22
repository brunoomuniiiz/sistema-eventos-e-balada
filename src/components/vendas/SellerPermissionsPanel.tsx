import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/usePermissions";
import { UserCog, Pencil } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SellerPermissionDialog, type SellerRow } from "./SellerPermissionDialog";

export function SellerPermissionsPanel() {
  const { ownerId, isOwner } = usePermissions();
  const [editing, setEditing] = useState<SellerRow | null>(null);

  const { data: team = [], isLoading } = useQuery({
    queryKey: ["seller-perms", ownerId],
    enabled: !!ownerId && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, display_name, email, role, permissions, aceita_dinheiro, aceita_pix, aceita_cartao, aceita_credito_promoter, pode_lancar_consumacao, lojinha_can_sell, can_discount, max_discount_percent, vendas_pdv_caixa, vendas_garcom, vendas_validar_qr, vendas_pedidos, vendas_historico, vendas_fechamento, vendas_abre_caixa, vendas_sangria")
        .eq("owner_id", ownerId!)
        .order("role", { ascending: true });
      if (error) throw error;
      return data as SellerRow[];
    },
  });

  if (!isOwner) return <div className="text-sm text-muted-foreground">Sem permissão.</div>;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-display font-bold flex items-center gap-2"><UserCog className="h-4 w-4 text-primary" /> Permissões por funcionário</h3>
            <p className="text-xs text-muted-foreground">Toque em um funcionário para editar tudo que ele pode fazer no módulo Vendas.</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/configuracao">Funcionários (cadastro)</Link></Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Carregando...</div>
        ) : team.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Nenhum funcionário cadastrado.</div>
        ) : (
          <div className="grid gap-2">
            {team.map((m) => {
              const isOwnerRow = m.role === "owner";
              const chips: string[] = [];
              if (isOwnerRow) chips.push("Acesso total");
              else {
                if (m.vendas_pdv_caixa) chips.push("PDV");
                if (m.vendas_garcom) chips.push("Garçom");
                if (m.vendas_validar_qr) chips.push("QR");
                if (m.vendas_pedidos) chips.push("Pedidos");
                if (m.vendas_historico) chips.push("Histórico");
                if (m.vendas_fechamento) chips.push("Fechamento");
                const pays: string[] = [];
                if (m.aceita_dinheiro) pays.push("Dinheiro");
                if (m.aceita_pix) pays.push("Pix");
                if (m.aceita_cartao) pays.push("Cartão");
                if (pays.length) chips.push(pays.join(" · "));
              }
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setEditing(m)}
                  className="text-left p-3 rounded-lg border hover:bg-muted/40 transition flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{m.display_name ?? m.email ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{m.email}{isOwnerRow ? " · owner" : ""}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {chips.map((c) => (
                        <Badge key={c} variant="secondary" className="text-[10px] font-normal">{c}</Badge>
                      ))}
                      {!isOwnerRow && chips.length === 0 && (
                        <span className="text-[11px] text-muted-foreground italic">Sem acessos configurados</span>
                      )}
                    </div>
                  </div>
                  <Pencil className="h-4 w-4 text-muted-foreground mt-1" />
                </button>
              );
            })}
          </div>
        )}

        <SellerPermissionDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} row={editing} />
      </CardContent>
    </Card>
  );
}
