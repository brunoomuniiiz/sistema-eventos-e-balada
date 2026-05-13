import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package, Minus } from "lucide-react";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_app/estoque")({
  component: EstoquePage,
});

type Product = { id: string; name: string; price: number; stock_quantity: number };

function EstoquePage() {
  const { ownerId, can, loading } = usePermissions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: "", price: "", stock_quantity: "" });

  const { data: products = [] } = useQuery({
    queryKey: ["products", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock_quantity")
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!ownerId && can("estoque"),
  });

  if (loading) return null;
  if (!can("estoque")) {
    return <PageHeader title="Estoque" subtitle="Você não tem permissão para acessar esta página" />;
  }

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", price: "", stock_quantity: "" });
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, price: String(p.price), stock_quantity: String(p.stock_quantity) });
    setOpen(true);
  };

  const save = async () => {
    if (!ownerId) return;
    if (!form.name.trim()) return toast.error("Informe o nome");
    const price = parseFloat(form.price.replace(",", ".")) || 0;
    const stock = parseInt(form.stock_quantity) || 0;

    if (editing) {
      const { error } = await supabase
        .from("products")
        .update({ name: form.name.trim(), price, stock_quantity: stock })
        .eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Produto atualizado");
    } else {
      const { error } = await supabase
        .from("products")
        .insert({ user_id: ownerId, name: form.name.trim(), price, stock_quantity: stock });
      if (error) return toast.error(error.message);
      toast.success("Produto cadastrado");
    }
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const adjust = async (p: Product, delta: number) => {
    const newStock = Math.max(0, p.stock_quantity + delta);
    const { error } = await supabase.from("products").update({ stock_quantity: newStock }).eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const remove = async (p: Product) => {
    if (!confirm(`Excluir ${p.name}?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produto removido");
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  return (
    <div>
      <PageHeader
        title="Estoque"
        subtitle="Cadastre e ajuste produtos"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4" /> Novo produto</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Preço (R$)</Label>
                    <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                  </div>
                  <div>
                    <Label>Quantidade</Label>
                    <Input type="number" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save}>{editing ? "Salvar" : "Cadastrar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {products.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Nenhum produto cadastrado
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {products.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-sm text-muted-foreground">{formatBRL(Number(p.price))}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" onClick={() => adjust(p, -1)}><Minus className="h-3 w-3" /></Button>
                  <span className={`w-12 text-center font-semibold ${p.stock_quantity <= 5 ? "text-destructive" : ""}`}>{p.stock_quantity}</span>
                  <Button variant="outline" size="icon" onClick={() => adjust(p, 1)}><Plus className="h-3 w-3" /></Button>
                </div>
                <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
