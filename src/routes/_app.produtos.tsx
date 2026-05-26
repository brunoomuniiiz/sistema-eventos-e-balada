import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CompactTabsList, CompactTabsTrigger } from "@/components/ui/compact-tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package, Layers, X, Upload, Image as ImageIcon, EyeOff, Store, Search, ShoppingCart } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { CurrencyInput } from "@/components/ui/currency-input";
import { toggleProductOnline } from "@/lojinha/api";

import { EstoqueView } from "./_app.estoque";
import { CategoriasManager } from "@/components/produtos/CategoriasManager";
import { PurchaseSheet } from "@/components/estoque/PurchaseSheet";

export const Route = createFileRoute("/_app/produtos")({
  component: ProdutosShell,
});

function ProdutosShell() {
  return (
    <Tabs defaultValue="catalogo" className="space-y-4">
      <CompactTabsList>
        <CompactTabsTrigger value="catalogo" short="Cat.">Catálogo</CompactTabsTrigger>
        <CompactTabsTrigger value="categorias" short="Categ.">Categorias</CompactTabsTrigger>
        <CompactTabsTrigger value="estoque" short="Estq.">Estoque</CompactTabsTrigger>
      </CompactTabsList>
      <TabsContent value="catalogo"><ProdutosPage /></TabsContent>
      <TabsContent value="categorias"><CategoriasManager /></TabsContent>
      <TabsContent value="estoque"><EstoqueView /></TabsContent>
    </Tabs>
  );
}

type Product = {
  id: string;
  name: string;
  price: number;
  cost_price: number;
  stock_quantity: number;
  product_type: "simple" | "combo";
  track_stock: boolean;
  description: string | null;
  pickup_description: string | null;
  photo_url: string | null;
  unit: string;
  category_id: string | null;
  is_available: boolean;
  sell_online?: boolean;
  online_price?: number | null;
  ativo_geral?: boolean;
  visivel_pdv_caixa?: boolean;
  visivel_mobile_garcom?: boolean;
  visivel_lojinha_cliente?: boolean;
};


type Category = { id: string; name: string };

type ComboItem = {
  id: string;
  combo_product_id: string;
  component_product_id: string;
  quantity: number;
  component?: { name: string; cost_price: number } | null;
};

type DraftComponent = { component_product_id: string; quantity: number };

function ProdutosPage() {
  const { ownerId, can, canProdutosAddEntrada, canProdutosCriarEditar, canProdutosCriarCombo, loading } = usePermissions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [tab, setTab] = useState<"simple" | "combo">("simple");
  const [query, setQuery] = useState("");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "",
    price: 0,
    cost_price: 0,
    stock_quantity: "",
    product_type: "simple" as "simple" | "combo",
    track_stock: true,
    description: "",
    pickup_description: "",
    photo_url: "",
    unit: "un",
    category_id: "none" as string,
    is_available: true,
    sell_online: true,
    online_price: 0,
    ativo_geral: true,
    visivel_pdv_caixa: true,
    visivel_mobile_garcom: true,
    visivel_lojinha_cliente: true,
  });

  const [draftComponents, setDraftComponents] = useState<DraftComponent[]>([]);
  const [pickComponentId, setPickComponentId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [cascadeAsk, setCascadeAsk] = useState<{ product: Product; combos: Product[] } | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["product_categories", ownerId],
    enabled: !!ownerId && can("estoque"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id, name")
        .order("sort_order");
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-full", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, cost_price, stock_quantity, product_type, track_stock, description, pickup_description, photo_url, unit, category_id, is_available, sell_online, online_price, ativo_geral, visivel_pdv_caixa, visivel_mobile_garcom, visivel_lojinha_cliente")
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!ownerId && can("estoque"),
  });

  const { data: comboItems = [] } = useQuery({
    queryKey: ["combo_items_full", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("combo_items")
        .select("id, combo_product_id, component_product_id, quantity, component:products!combo_items_component_product_id_fkey(name, cost_price)");
      if (error) throw error;
      return data as unknown as ComboItem[];
    },
    enabled: !!ownerId && can("estoque"),
  });

  const simpleProducts = useMemo(() => products.filter((p) => p.product_type === "simple"), [products]);
  const comboProducts = useMemo(() => products.filter((p) => p.product_type === "combo"), [products]);

  const draftCost = useMemo(() => {
    return draftComponents.reduce((sum, d) => {
      const p = products.find((x) => x.id === d.component_product_id);
      return sum + Number(p?.cost_price ?? 0) * Number(d.quantity);
    }, 0);
  }, [draftComponents, products]);

  if (loading) return null;
  if (!can("estoque")) {
    return <PageHeader title="Produtos" subtitle="Você não tem permissão para acessar esta página" />;
  }

  const openNew = (type: "simple" | "combo") => {
    setEditing(null);
    setForm({
      name: "", price: 0, cost_price: 0, stock_quantity: "",
      product_type: type, track_stock: type === "simple",
      description: "", pickup_description: "", photo_url: "", unit: "un",
      category_id: "none", is_available: true,
      sell_online: true, online_price: 0,
      ativo_geral: true,
      visivel_pdv_caixa: true,
      visivel_mobile_garcom: true,
      visivel_lojinha_cliente: true,
    });
    setDraftComponents([]);
    setPickComponentId("");
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      price: Number(p.price),
      cost_price: Number(p.cost_price ?? 0),
      stock_quantity: String(p.stock_quantity),
      product_type: p.product_type,
      track_stock: p.track_stock,
      description: p.description ?? "",
      pickup_description: p.pickup_description ?? "",
      photo_url: p.photo_url ?? "",
      unit: p.unit ?? "un",
      category_id: p.category_id ?? "none",
      is_available: p.is_available ?? true,
      sell_online: p.sell_online ?? false,
      online_price: Number(p.online_price ?? 0),
      ativo_geral: p.ativo_geral ?? true,
      visivel_pdv_caixa: p.visivel_pdv_caixa ?? true,
      visivel_mobile_garcom: p.visivel_mobile_garcom ?? true,
      visivel_lojinha_cliente: p.visivel_lojinha_cliente ?? (p.sell_online ?? true),
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

  const uploadPhoto = async (file: File) => {
    if (!ownerId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${ownerId}/p-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-photos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("product-photos").getPublicUrl(path);
      setForm((f) => ({ ...f, photo_url: pub.publicUrl }));
      toast.success("Foto enviada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
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
    const price = form.price;
    const isCombo = form.product_type === "combo";
    const cost = isCombo ? draftCost : form.cost_price;
    const stock = isCombo ? 0 : parseInt(form.stock_quantity) || 0;

    if (isCombo && draftComponents.length === 0) {
      return toast.error("Adicione ao menos um item ao combo");
    }

    const payload = {
      name: form.name.trim(),
      price,
      cost_price: cost,
      stock_quantity: isCombo ? 0 : stock,
      product_type: form.product_type,
      track_stock: isCombo ? false : form.track_stock,
      description: form.description.trim() || null,
      pickup_description: form.pickup_description.trim() || null,
      photo_url: form.photo_url.trim() || null,
      unit: form.unit.trim() || "un",
      category_id: form.category_id === "none" ? null : form.category_id,
      // Manter colunas legadas em sincronia com as novas flags por compatibilidade
      is_available: form.ativo_geral,
      sell_online: form.visivel_lojinha_cliente,
      online_price: form.online_price && form.online_price > 0 ? form.online_price : null,
      ativo_geral: form.ativo_geral,
      visivel_pdv_caixa: form.visivel_pdv_caixa,
      visivel_mobile_garcom: form.visivel_mobile_garcom,
      visivel_lojinha_cliente: form.visivel_lojinha_cliente,
    };


    let productId = editing?.id;

    if (editing) {
      const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert({ user_id: ownerId, ...payload })
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      productId = data.id;
    }

    if (isCombo && productId) {
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
    qc.invalidateQueries({ queryKey: ["products-full"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["combo_items_full"] });
    qc.invalidateQueries({ queryKey: ["combo_items"] });
  };

  const remove = async (p: Product) => {
    if (!confirm(`Excluir ${p.name}?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produto removido");
    qc.invalidateQueries({ queryKey: ["products-full"] });
    qc.invalidateQueries({ queryKey: ["combo_items_full"] });
  };

  const toggleAvailable = async (p: Product, next: boolean) => {
    // Se está desativando um produto simples que é componente de combos, perguntar
    if (!next && p.product_type === "simple") {
      const dependentCombos = products.filter((c) =>
        c.product_type === "combo" &&
        c.is_available !== false &&
        comboItems.some((ci) => ci.combo_product_id === c.id && ci.component_product_id === p.id)
      );
      if (dependentCombos.length > 0) {
        // primeiro desativa o produto, depois pergunta sobre combos
        await supabase.from("products").update({ is_available: false }).eq("id", p.id);
        qc.invalidateQueries({ queryKey: ["products-full"] });
        qc.invalidateQueries({ queryKey: ["products"] });
        setCascadeAsk({ product: p, combos: dependentCombos });
        return;
      }
    }
    const { error } = await supabase.from("products").update({ is_available: next }).eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["products-full"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const applyCascade = async (alsoDisableCombos: boolean) => {
    if (!cascadeAsk) return;
    if (alsoDisableCombos) {
      const ids = cascadeAsk.combos.map((c) => c.id);
      const { error } = await supabase.from("products").update({ is_available: false }).in("id", ids);
      if (error) toast.error(error.message);
      else toast.success(`${ids.length} combo(s) desabilitado(s)`);
      qc.invalidateQueries({ queryKey: ["products-full"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    }
    setCascadeAsk(null);
  };

  const toggleOnline = async (p: Product) => {
    // Otimista
    qc.setQueryData<Product[]>(["products-full", ownerId], (old) =>
      old?.map((x) => x.id === p.id ? { ...x, sell_online: !x.sell_online } : x) ?? old
    );
    try {
      await toggleProductOnline(p.id);
      toast.success(p.sell_online ? "Removido da lojinha" : "Adicionado à lojinha");
    } catch (e) {
      qc.invalidateQueries({ queryKey: ["products-full"] });
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const renderCard = (p: Product) => {
    const items = comboItems.filter((c) => c.combo_product_id === p.id);
    const margin = p.price > 0 ? ((p.price - Number(p.cost_price)) / p.price) * 100 : 0;
    return (
      <Card key={p.id} className={p.is_available === false ? "opacity-60" : ""}>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="h-16 w-16 rounded-lg bg-secondary/40 grid place-items-center overflow-hidden flex-shrink-0">
              {p.photo_url ? (
                <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">{p.name}</span>
                {p.product_type === "combo" && (
                  <Badge variant="secondary" className="gap-1"><Layers className="h-3 w-3" /> Combo</Badge>
                )}
                {p.is_available === false && (
                  <Badge variant="outline" className="gap-1 text-amber-500 border-amber-500/50">
                    <EyeOff className="h-3 w-3" /> Indisponível
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground flex gap-3 flex-wrap">
                <span>Venda <strong className="text-foreground">{formatBRL(Number(p.price))}</strong></span>
                <span>Custo {formatBRL(Number(p.cost_price))}</span>
                <span className={margin >= 50 ? "text-emerald-400" : margin >= 20 ? "text-amber-400" : "text-destructive"}>
                  Margem {margin.toFixed(0)}%
                </span>
              </div>
              {p.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{p.description}</div>}
            </div>
            <div className="flex flex-col items-end gap-1 self-start">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleOnline(p)}
                  title={p.sell_online ? "Na lojinha — clique para esconder" : "Fora da lojinha — clique para mostrar. Quando o estoque acabar, some sozinho."}
                  className={`grid place-items-center h-8 w-8 rounded-md border transition-colors ${
                    p.sell_online
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/25"
                      : "bg-muted border-border text-muted-foreground hover:bg-muted/70"
                  }`}
                  aria-label="Vender na lojinha"
                >
                  <Store className="h-4 w-4" />
                </button>
                <Switch
                  checked={p.is_available !== false}
                  onCheckedChange={(v) => toggleAvailable(p, v)}
                  aria-label="Disponível no PDV"
                />
              </div>
              <div className="flex">
                <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
          {p.product_type === "combo" && items.length > 0 && (
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
  };

  const baseList = tab === "simple" ? simpleProducts : comboProducts;
  const list = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return baseList;
    const cats = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
    return baseList.filter((p) => {
      const catName = p.category_id ? (cats.get(p.category_id) ?? "") : "";
      return p.name.toLowerCase().includes(s)
        || (p.unit ?? "").toLowerCase().includes(s)
        || catName.includes(s);
    });
  }, [baseList, query, categories]);
  const onlineCount = list.filter((p) => p.sell_online !== false).length;

  return (
    <div>
      <PageHeader
        title="Produtos"
        subtitle="Cadastro de bebidas, comidas e combos"
        actions={
          <div className="flex items-center gap-2">
            {canAddProducts && (
              <Button variant="outline" onClick={() => setPurchaseOpen(true)}>
                <ShoppingCart className="h-4 w-4" /> Registrar compra
              </Button>
            )}
            {canAddProducts && (
              <Button onClick={() => openNew(tab)}>
                <Plus className="h-4 w-4" /> Novo {tab === "combo" ? "combo" : "produto"}
              </Button>
            )}
          </div>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "simple" | "combo")} className="mb-4">
        <CompactTabsList>
          <CompactTabsTrigger value="simple" short={`Prod. (${simpleProducts.length})`}>Produtos ({simpleProducts.length})</CompactTabsTrigger>
          <CompactTabsTrigger value="combo" short={`Combos (${comboProducts.length})`}>Combos ({comboProducts.length})</CompactTabsTrigger>
        </CompactTabsList>
        <TabsContent value="simple" />
        <TabsContent value="combo" />
      </Tabs>

      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, categoria ou unidade..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpar busca"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Store className="h-3.5 w-3.5 text-emerald-500" />
        <span>
          <strong className="text-foreground">{onlineCount}</strong> de {list.length} na lojinha
        </span>
        <span className="opacity-60">· clique no <Store className="inline h-3 w-3" /> de cada produto para ligar/desligar</span>
      </div>

      {list.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
          {query ? `Nenhum resultado para "${query}"` : `Nenhum ${tab === "combo" ? "combo" : "produto"} cadastrado`}
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">{list.map(renderCard)}</div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar" : "Novo"} {form.product_type === "combo" ? "combo" : "produto"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 rounded-xl bg-secondary/40 grid place-items-center overflow-hidden flex-shrink-0">
                {form.photo_url ? (
                  <img src={form.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => photoInput.current?.click()} disabled={uploading}>
                  <Upload className="h-3.5 w-3.5" /> {uploading ? "Enviando..." : "Foto do produto"}
                </Button>
                {form.photo_url && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, photo_url: "" })}>
                    Remover
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div>
              <Label>Categoria</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Preço venda</Label>
                <CurrencyInput value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
              </div>
              {form.product_type === "simple" ? (
                <>
                  <div>
                    <Label>Custo</Label>
                    <CurrencyInput value={form.cost_price} onChange={(v) => setForm({ ...form, cost_price: v })} />
                  </div>
                  <div>
                    <Label>Unidade</Label>
                    <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="un, ml, g" />
                  </div>
                </>
              ) : (
                <div className="col-span-2">
                  <Label>Custo (somado dos itens)</Label>
                  <Input value={formatBRL(draftCost)} disabled />
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg border bg-card/40 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visibilidade</div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="cursor-pointer">Ativo geral</Label>
                  <p className="text-[11px] text-muted-foreground">Desligado: some de todo o sistema.</p>
                </div>
                <Switch checked={form.ativo_geral} onCheckedChange={(v) => setForm({ ...form, ativo_geral: v })} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="cursor-pointer">Visível no PDV (caixa)</Label>
                  <p className="text-[11px] text-muted-foreground">Tela do caixa fixo.</p>
                </div>
                <Switch
                  checked={form.visivel_pdv_caixa}
                  disabled={!form.ativo_geral}
                  onCheckedChange={(v) => setForm({ ...form, visivel_pdv_caixa: v })}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="cursor-pointer">Visível no app do garçom</Label>
                  <p className="text-[11px] text-muted-foreground">Interface mobile de vendas.</p>
                </div>
                <Switch
                  checked={form.visivel_mobile_garcom}
                  disabled={!form.ativo_geral}
                  onCheckedChange={(v) => setForm({ ...form, visivel_mobile_garcom: v })}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="cursor-pointer">Visível na lojinha pública</Label>
                  <p className="text-[11px] text-muted-foreground">Catálogo do cliente final (PIX).</p>
                </div>
                <Switch
                  checked={form.visivel_lojinha_cliente}
                  disabled={!form.ativo_geral}
                  onCheckedChange={(v) => setForm({ ...form, visivel_lojinha_cliente: v })}
                />
              </div>

              {form.visivel_lojinha_cliente && (
                <div className="pt-2 border-t">
                  <Label>Preço online (opcional)</Label>
                  <CurrencyInput value={form.online_price ?? 0} onChange={(v) => setForm({ ...form, online_price: v })} />
                  <p className="text-[11px] text-muted-foreground mt-1">Deixe vazio para usar o mesmo preço do PDV.</p>
                </div>
              )}
            </div>


            {form.product_type === "simple" && (
              <>
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                  <div>
                    <Label className="cursor-pointer">Controlar estoque</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Desligue para itens sem estoque (couvert, rolha, consumação mínima, cortesia).
                    </p>
                  </div>
                  <Switch
                    checked={form.track_stock}
                    onCheckedChange={(v) => setForm({ ...form, track_stock: v })}
                  />
                </div>

                {form.track_stock && (
                  <div>
                    <Label>Estoque inicial</Label>
                    <Input
                      type="number"
                      value={form.stock_quantity}
                      onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                      disabled={!!editing}
                    />
                    {editing && <div className="text-[11px] text-muted-foreground mt-1">Use a página de Estoque para ajustar quantidades</div>}
                  </div>
                )}
              </>
            )}

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descrição visível ao cliente"
                rows={2}
              />
            </div>

            <div>
              <Label>Instruções de retirada (copa)</Label>
              <Textarea
                value={form.pickup_description}
                onChange={(e) => setForm({ ...form, pickup_description: e.target.value })}
                placeholder="Ex: 1 copo grande, gelo, 2 limões. Será impresso na ficha de retirada."
                rows={2}
              />
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
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} — {formatBRL(Number(p.cost_price))}
                          </SelectItem>
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
                      const lineCost = Number(p?.cost_price ?? 0) * Number(d.quantity);
                      return (
                        <div key={d.component_product_id} className="flex items-center gap-2 p-2 rounded border bg-card">
                          <span className="flex-1 text-sm truncate">{p?.name ?? "?"}</span>
                          <span className="text-xs text-muted-foreground">{formatBRL(lineCost)}</span>
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
                    <div className="flex justify-between items-center pt-2 border-t text-sm">
                      <span className="text-muted-foreground">Custo total do combo</span>
                      <span className="font-semibold">{formatBRL(draftCost)}</span>
                    </div>
                    {form.price && Number(form.price) > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Margem</span>
                        <span className="font-semibold">
                          {(((Number(form.price) - draftCost) / Number(form.price)) * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
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

      <AlertDialog open={!!cascadeAsk} onOpenChange={(v) => !v && setCascadeAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desabilitar combos relacionados?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{cascadeAsk?.product.name}</strong> faz parte de {cascadeAsk?.combos.length} combo(s):
              <span className="block mt-2 text-sm">
                {cascadeAsk?.combos.map((c) => c.name).join(", ")}
              </span>
              <span className="block mt-2">Deseja desabilitar esses combos também?</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => applyCascade(false)}>Não, manter</AlertDialogCancel>
            <AlertDialogAction onClick={() => applyCascade(true)}>Sim, desabilitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {ownerId && (
        <PurchaseSheet open={purchaseOpen} onOpenChange={setPurchaseOpen} ownerId={ownerId} />
      )}
    </div>
  );
}
