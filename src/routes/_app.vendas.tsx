import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, ShoppingCart } from "lucide-react";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_app/vendas")({
  component: VendasPage,
});

type PaymentMethod = "debito" | "credito" | "pix" | "dinheiro";

type CartItem = {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  stock: number;
};

function VendasPage() {
  const { user } = useAuth();
  const { ownerId, can, loading } = usePermissions();
  const qc = useQueryClient();

  const [employeeId, setEmployeeId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [pickProductId, setPickProductId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock_quantity")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, role")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const total = useMemo(
    () => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0),
    [cart],
  );

  const addProduct = () => {
    if (!pickProductId) return;
    const p = products.find((x) => x.id === pickProductId);
    if (!p) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === p.id
            ? { ...i, quantity: Math.min(i.quantity + 1, p.stock_quantity || 9999) }
            : i,
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_name: p.name,
          unit_price: Number(p.price),
          quantity: 1,
          stock: p.stock_quantity,
        },
      ];
    });
    setPickProductId("");
  };

  const updateQty = (id: string, qty: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.product_id === id ? { ...i, quantity: Math.max(1, qty) } : i,
      ),
    );
  };

  const removeItem = (id: string) =>
    setCart((prev) => prev.filter((i) => i.product_id !== id));

  const finalize = async () => {
    if (!user || !ownerId) return;
    if (cart.length === 0) return toast.error("Adicione pelo menos um produto");
    if (!employeeId) return toast.error("Selecione um funcionário");
    if (!paymentMethod) return toast.error("Selecione a forma de pagamento");

    setSubmitting(true);
    try {
      const employee = employees.find((e) => e.id === employeeId);
      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          user_id: ownerId,
          employee_id: employeeId,
          employee_name: employee?.name ?? null,
          payment_method: paymentMethod,
          total,
        })
        .select()
        .single();
      if (saleErr) throw saleErr;

      const items = cart.map((i) => ({
        user_id: ownerId,
        sale_id: sale.id,
        product_id: i.product_id,
        product_name: i.product_name,
        unit_price: i.unit_price,
        quantity: i.quantity,
        subtotal: i.unit_price * i.quantity,
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) throw itemsErr;

      toast.success("Venda finalizada!");
      setCart([]);
      setEmployeeId("");
      setPaymentMethod("");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao finalizar venda";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;
  if (!can("vendas")) {
    return <PageHeader title="Vendas" subtitle="Você não tem permissão para acessar esta página" />;
  }

  return (
    <div>
      <PageHeader title="Nova Venda" subtitle="Registre uma venda do bar/loja" />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Produtos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Select value={pickProductId} onValueChange={setPickProductId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={products.length ? "Selecione um produto" : "Cadastre produtos no estoque"} />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={p.stock_quantity <= 0}>
                      {p.name} — {formatBRL(Number(p.price))} {p.stock_quantity <= 0 ? "(sem estoque)" : `(${p.stock_quantity} un.)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={addProduct} disabled={!pickProductId}>
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>

            {cart.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">
                Nenhum item na venda
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((i) => (
                  <div key={i.product_id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{i.product_name}</div>
                      <div className="text-xs text-muted-foreground">{formatBRL(i.unit_price)} cada</div>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={i.quantity}
                      onChange={(e) => updateQty(i.product_id, parseInt(e.target.value) || 1)}
                      className="w-20"
                    />
                    <div className="w-24 text-right font-semibold">{formatBRL(i.unit_price * i.quantity)}</div>
                    <Button variant="ghost" size="icon" onClick={() => removeItem(i.product_id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Funcionário</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder={employees.length ? "Selecione" : "Cadastre funcionários"} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}{e.role ? ` — ${e.role}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debito">Débito</SelectItem>
                  <SelectItem value="credito">Crédito</SelectItem>
                  <SelectItem value="pix">Pix</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between pt-3 border-t">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold text-gradient">{formatBRL(total)}</span>
            </div>

            <Button onClick={finalize} disabled={submitting} className="w-full" size="lg">
              <ShoppingCart className="h-4 w-4" />
              {submitting ? "Salvando..." : "Finalizar Venda"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
