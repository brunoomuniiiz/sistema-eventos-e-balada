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
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package, Minus, Layers, X } from "lucide-react";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_app/estoque")({
  component: EstoquePage,
});

type Product = {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  product_type: "simple" | "combo";
  track_stock: boolean;
};

type ComboItem = {
  id: string;
  combo_product_id: string;
  component_product_id: string;
  quantity: number;
  component?: { name: string };
};

type DraftComponent = { component_product_id: string; quantity: number };

function EstoquePage() {
  const { ownerId, can, loading } = usePermissions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({
    name: "",
    price: "",
    stock_quantity: "",
    product_type: "simple" as "simple" | "combo",
    track_stock: true,
  });
  const [draftComponents, setDraftComponents] = useState<DraftComponent[]>([]);
  const [pickComponentId, setPickComponentId] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["products", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock_quantity, product_type, track_stock")
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!ownerId && can("estoque"),
  });

  const { data: comboItems = [] } = useQuery({
    queryKey: ["combo_items", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("combo_items")
        .select("id, combo_product_id, component_product_id, quantity, component:products!combo_items_component_product_id_fkey(name)");
      if (error) throw error;
      return data as unknown as ComboItem[];
    },
    enabled: !!ownerId && can("estoque"),
  });

  if (loading) return null;
  if (!can("estoque")) {
    return <PageHeader title="Estoque" subtitle="Você não tem permissão para acessar esta página" />;
  }

  const simpleProducts = products.filter((p) => p.product_type === "simple");

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", price: "", stock_quantity: "", product_type: "simple", track_stock: true });
    setDraftComponents([]);
    setPickComponentId("");
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      price: String(p.price),
      stock_quantity: String(p.stock_quantity),
      product_type: p.product_type,
      track_stock: p.track_stock,
    });
    if (p.product_type === "combo") {
      const items = comboItems.filter((c) => c.combo_product_id === p.id);
      setDraftComponents(items.map((i) => ({
        component_product_id: i.component_product_id,
        quantity: Number(i.quantity),
      })));
    } else {
      setDraftComponents([]);
    }
    setPickComponentId("");
    setOpen(true);
  };

  const addDraftComponent = () => {
    if (!pickComponentId) return;
    if (draftComponents.some((d) => d.component_product_id === pickComponentId)) {
      return toast.error("Componente já adicionado");
    }
    setDraftComponents((prev) => [...prev, { component_product_id: pickComponentId, quantity: 1 }]);
    setPickComponentId("");
  };

  const updateDraftQty = (id: string, qty: number) =>
    setDraftComponents((prev) => prev.map((d) =>
      d.component_product_id === id ? { ...d, quantity: Math.max(0.01, qty) } : d));

  const removeDraft = (id: string) =>
    setDraftComponents((prev) => prev.filter((d) => d.component_product_id !== id));

  const save = async () => {
    if (!ownerId) return;
    if (!form.name.trim()) return toast.error("Informe o nome");
    const price = parseFloat(form.price.replace(",", ".")) || 0;
    const isCombo = form.product_type === "combo";
    const stock = isCombo && !form.track_stock ? 0 : parseInt(form.stock_quantity) || 0;

    if (isCombo && draftComponents.length === 0) {
      return toast.error("Adicione ao menos um item ao combo");
    }

    let productId = editing?.id;

    if (editing) {
      const { error } = await supabase
        .from("products")
        .update({
          name: form.name.trim(),
          price,
          stock_quantity: stock,
          product_type: form.product_type,
          track_stock: isCombo ? form.track_stock : true,
        })
        .eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert({
          user_id: ownerId,
          name: form.name.trim(),
          price,
          stock_quantity: stock,
          product_type: form.product_type,
          track_stock: isCombo ? form.track_stock : true,
        })
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      productId = data.id;
    }

    if (isCombo && productId) {
      // Replace combo items
      const { error: delErr } = await supabase.from("combo_items").delete().eq("combo_product_id", productId);
      if (delErr) return toast.error(delErr.message);
      const rows = draftComponents.map((d) => ({
        user_id: ownerId,
        combo_product_id: productId!,
        component_product_id: d.component_product_id,
        quantity: d.quantity,
      }));
      const { error: insErr } = await supabase.from("combo_items").insert(rows);
      if (insErr) return toast.error(insErr.message);
    }

    toast.success(editing ? "Produto atualizado" : "Produto cadastrado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["combo_items"] });
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
    qc.invalidateQueries({ queryKey: ["combo_items"] });
  };

  return (
    <div>
      <PageHeader
        title="Estoque"
        subtitle="Produtos e combos"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4" /> Novo</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar" : "Novo"} {form.product_type === "combo" ? "combo" : "produto"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={form.product_type}
                    onValueChange={(v) => setForm({ ...form, product_type: v as "simple" | "combo", track_stock: v === "combo" ? false : true })}
                    disabled={!!editing}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Produto avulso</SelectItem>
                      <SelectItem value="combo">Combo (composto por outros itens)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Preço de venda (R$)</Label>
                    <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                  </div>
                  {form.product_type === "simple" ? (
                    <div>
                      <Label>Quantidade em estoque</Label>
                      <Input type="number" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} />
                    </div>
                  ) : (
                    <div>
                      <Label>Estoque próprio?</Label>
                      <Select value={form.track_stock ? "yes" : "no"} onValueChange={(v) => setForm({ ...form, track_stock: v === "yes" })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">Não — descontar só componentes</SelectItem>
                          <SelectItem value="yes">Sim — controlar também</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {form.product_type === "combo" && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label>Itens do combo</Label>
                    <div className="flex gap-2">
                      <Select value={pickComponentId} onValueChange={setPickComponentId}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder={simpleProducts.length ? "Selecione um item" : "Cadastre produtos avulsos primeiro"} />
                        </SelectTrigger>
                        <SelectContent>
                          {simpleProducts
                            .filter((p) => !draftComponents.some((d) => d.component_product_id === p.id))
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" onClick={addDraftComponent} disabled={!pickComponentId}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {draftComponents.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded">
                        Nenhum item adicionado
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {draftComponents.map((d) => {
                          const p = products.find((x) => x.id === d.component_product_id);
                          return (
                            <div key={d.component_product_id} className="flex items-center gap-2 p-2 rounded border bg-card">
                              <span className="flex-1 text-sm truncate">{p?.name ?? "?"}</span>
                              <Input
                                type="number"
                                step="0.01"
                                min={0.01}
                                value={d.quantity}
                                onChange={(e) => updateDraftQty(d.component_product_id, parseFloat(e.target.value) || 1)}
                                className="w-20"
                              />
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeDraft(d.component_product_id)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
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
          {products.map((p) => {
            const isCombo = p.product_type === "combo";
            const items = comboItems.filter((c) => c.combo_product_id === p.id);
            return (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{p.name}</span>
                        {isCombo && <Badge variant="secondary" className="gap-1"><Layers className="h-3 w-3" /> Combo</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground">{formatBRL(Number(p.price))}</div>
                    </div>
                    {!isCombo || p.track_stock ? (
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" onClick={() => adjust(p, -1)}><Minus className="h-3 w-3" /></Button>
                        <span className={`w-12 text-center font-semibold ${p.stock_quantity <= 5 ? "text-destructive" : ""}`}>{p.stock_quantity}</span>
                        <Button variant="outline" size="icon" onClick={() => adjust(p, 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">via componentes</span>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  {isCombo && items.length > 0 && (
                    <div className="mt-3 pt-3 border-t flex flex-wrap gap-1.5">
                      {items.map((i) => (
                        <Badge key={i.id} variant="outline" className="text-xs">
                          {i.quantity}× {i.component?.name ?? "?"}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
