import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CompactTabsList, CompactTabsTrigger } from "@/components/ui/compact-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Minus, Package, ArrowRightLeft, ClipboardList, MapPin,
  CheckCircle2, AlertTriangle, ChevronRight, Save, Folder, FileText, Lock, History,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { AuthorizationDialog } from "@/components/AuthorizationDialog";
import { StockLedgerTimeline } from "@/components/estoque/StockLedgerTimeline";


export const Route = createFileRoute("/_app/estoque")({
  component: EstoqueView,
});

type Location = { id: string; name: string; is_default: boolean };
type Product = { id: string; name: string; cost_price: number; product_type: string; track_stock: boolean };
type Stock = { product_id: string; location_id: string; quantity: number };
type Inventory = {
  id: string; location_id: string; status: string; opened_at: string; closed_at: string | null;
  net_value: number; total_surplus_value: number; total_shortage_value: number; opened_by_name: string | null;
};
type InventoryItem = {
  id: string; product_id: string; product_name: string;
  system_qty: number; counted_qty: number | null; cost_price: number; diff_value: number;
};

export function EstoqueView() {
  const { ownerId, can, loading } = usePermissions();
  const qc = useQueryClient();

  const { data: locations = [], refetch: refetchLocs } = useQuery({
    queryKey: ["stock_locations", ownerId],
    enabled: !!ownerId && can("estoque"),
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_locations")
        .select("id, name, is_default").order("is_default", { ascending: false }).order("name");
      if (error) throw error;
      return data as Location[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-stock", ownerId],
    enabled: !!ownerId && can("estoque"),
    queryFn: async () => {
      const { data, error } = await supabase.from("products")
        .select("id, name, price, cost_price, product_type, track_stock").order("name");
      if (error) throw error;
      return (data as (Product & { price: number })[]).filter((p) => p.product_type === "simple" || p.track_stock);
    },
  });

  const { data: stock = [], refetch: refetchStock } = useQuery({
    queryKey: ["product_stock", ownerId],
    enabled: !!ownerId && can("estoque"),
    queryFn: async () => {
      const { data, error } = await supabase.from("product_stock")
        .select("product_id, location_id, quantity");
      if (error) throw error;
      return data as Stock[];
    },
  });

  // Auto-create default location if none exists
  useEffect(() => {
    if (!ownerId || !can("estoque") || loading) return;
    if (locations.length === 0) {
      supabase.from("stock_locations").insert({
        user_id: ownerId, name: "Principal", is_default: true,
      }).then(({ error }) => { if (!error) refetchLocs(); });
    }
  }, [ownerId, can, loading, locations.length, refetchLocs]);

  if (loading) return null;
  if (!can("estoque")) return <PageHeader title="Estoque" subtitle="Você não tem permissão" />;

  const getQty = (pid: string, lid: string) =>
    stock.find((s) => s.product_id === pid && s.location_id === lid)?.quantity ?? 0;

  const totals = useMemo(() => {
    let totalCost = 0;
    let totalSale = 0;
    products.forEach((p) => {
      const qty = stock
        .filter((s) => s.product_id === p.id)
        .reduce((sum, s) => sum + s.quantity, 0);
      totalCost += qty * Number(p.cost_price || 0);
      totalSale += qty * Number((p as any).price || 0);
    });
    return { totalCost, totalSale };
  }, [products, stock]);

  return (
    <div className="space-y-4 pb-20">
      <PageHeader title="Estoque" subtitle="Quantidades por local, transferências e inventários" />
      
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-card/50">
          <CardContent className="p-3 pt-4 text-center">
            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Custo Total</div>
            <div className="text-lg font-bold text-primary">{formatBRL(totals.totalCost)}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-3 pt-4 text-center">
            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Projeção Venda</div>
            <div className="text-lg font-bold text-emerald-400">{formatBRL(totals.totalSale)}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="locais">
        <CompactTabsList>
          <CompactTabsTrigger value="locais" icon={MapPin} short="Locais">Locais</CompactTabsTrigger>
          <CompactTabsTrigger value="transferir" icon={ArrowRightLeft} short="Transf.">Transferir</CompactTabsTrigger>
          <CompactTabsTrigger value="inventario" icon={ClipboardList} short="Inv.">Inventário</CompactTabsTrigger>
          <CompactTabsTrigger value="extrato" icon={History} short="Extrato">Extrato</CompactTabsTrigger>
        </CompactTabsList>

        <TabsContent value="locais" className="space-y-4 mt-4">
          <LocaisTab
            ownerId={ownerId!} locations={locations} products={products} getQty={getQty}
            onAdjust={() => { refetchStock(); qc.invalidateQueries({ queryKey: ["products-full"] }); }}
            onLocChange={refetchLocs}
          />
        </TabsContent>

        <TabsContent value="transferir" className="space-y-4 mt-4">
          <TransferirTab
            locations={locations} products={products} getQty={getQty}
            onDone={() => { refetchStock(); qc.invalidateQueries({ queryKey: ["products-full"] }); }}
          />
        </TabsContent>

        <TabsContent value="inventario" className="space-y-4 mt-4">
          <InventarioTab
            ownerId={ownerId!} locations={locations} products={products} stock={stock}
            onClosed={() => { refetchStock(); qc.invalidateQueries({ queryKey: ["products-full"] }); }}
          />
        </TabsContent>

        <TabsContent value="extrato" className="space-y-4 mt-4">
          <StockLedgerTimeline />
        </TabsContent>
      </Tabs>

    </div>
  );
}

// ============ LOCAIS ============
function LocaisTab({
  ownerId, locations, products, getQty, onAdjust, onLocChange,
}: {
  ownerId: string; locations: Location[]; products: Product[];
  getQty: (pid: string, lid: string) => number; onAdjust: () => void; onLocChange: () => void;
}) {
  const [newLoc, setNewLoc] = useState("");
  const [openLocs, setOpenLocs] = useState(false);
  const [pinAction, setPinAction] = useState<(() => Promise<void>) | null>(null);
  const defaultLoc = locations.find((l) => l.is_default) ?? locations[0];
  const [selectedLoc, setSelectedLoc] = useState<string>("");

  useEffect(() => {
    if (!selectedLoc && defaultLoc) setSelectedLoc(defaultLoc.id);
  }, [defaultLoc, selectedLoc]);

  const addLoc = async () => {
    if (!newLoc.trim()) return;
    const { error } = await supabase.from("stock_locations").insert({
      user_id: ownerId, name: newLoc.trim(), is_default: locations.length === 0,
    });
    if (error) return toast.error(error.message);
    setNewLoc("");
    onLocChange();
    toast.success("Local criado");
  };

  const removeLoc = async (id: string) => {
    const loc = locations.find(l => l.id === id);
    if (loc?.is_default) return toast.error("Não é possível remover o local principal.");

    // PIN de proteção para excluir local
    setPinAction(() => async () => {
      // Deleta o estoque vinculado primeiro para evitar erros de constraint
      await supabase.from("product_stock").delete().eq("location_id", id);
      const { error } = await supabase.from("stock_locations").delete().eq("id", id);
      if (error) {
        toast.error(error.message);
      } else {
        onLocChange();
        toast.success("Local removido");
      }
    });
  };

  const adjust = async (pid: string, lid: string, delta: number) => {
    const current = getQty(pid, lid);
    const newQty = Math.max(0, current + delta);
    const existing = await supabase.from("product_stock")
      .select("id").eq("product_id", pid).eq("location_id", lid).maybeSingle();
    if (existing.data) {
      const { error } = await supabase.from("product_stock")
        .update({ quantity: newQty }).eq("id", existing.data.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("product_stock").insert({
        user_id: ownerId, product_id: pid, location_id: lid, quantity: newQty,
      });
      if (error) return toast.error(error.message);
    }
    onAdjust();
  };

  const setQty = async (pid: string, lid: string, qty: number) => {
    const newQty = Math.max(0, qty);
    const existing = await supabase.from("product_stock")
      .select("id").eq("product_id", pid).eq("location_id", lid).maybeSingle();
    if (existing.data) {
      await supabase.from("product_stock").update({ quantity: newQty }).eq("id", existing.data.id);
    } else {
      await supabase.from("product_stock").insert({
        user_id: ownerId, product_id: pid, location_id: lid, quantity: newQty,
      });
    }
    onAdjust();
  };

  return (
    <>
      <AuthorizationDialog
        open={!!pinAction}
        onOpenChange={(open) => !open && setPinAction(null)}
        scope="operation"
        title="Confirmar Exclusão"
        description="Digite o PIN para confirmar a exclusão deste local de estoque."
        onApproved={() => {
          if (pinAction) {
            pinAction();
            setPinAction(null);
          }
        }}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={selectedLoc} onValueChange={setSelectedLoc}>
          <SelectTrigger className="w-60"><SelectValue placeholder="Selecione um local" /></SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name} {l.is_default && "(padrão)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog open={openLocs} onOpenChange={setOpenLocs}>
          <DialogTrigger asChild>
            <Button variant="outline"><MapPin className="h-4 w-4" /> Gerenciar locais</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Locais de estoque</DialogTitle></DialogHeader>
            <div className="space-y-2">
              {locations.map((l) => (
                <div key={l.id} className="flex items-center gap-2 p-2 rounded border">
                  <span className="flex-1">{l.name}</span>
                  {l.is_default && <Badge variant="secondary">padrão</Badge>}
                  {!l.is_default && (
                    <Button variant="ghost" size="icon" onClick={() => removeLoc(l.id)}>
                      <Minus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex gap-2 pt-2 border-t">
                <Input placeholder="Ex: Bar 1, Depósito" value={newLoc} onChange={(e) => setNewLoc(e.target.value)} />
                <Button onClick={addLoc}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!selectedLoc ? null : products.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Cadastre produtos primeiro
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <div className="divide-y">
            {products.map((p) => {
              const qty = getQty(p.id, selectedLoc);
              return (
                <div key={p.id} className="flex items-center gap-2 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">Custo {formatBRL(Number(p.cost_price))}</div>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => adjust(p.id, selectedLoc, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input
                    type="number" value={qty}
                    onChange={(e) => setQty(p.id, selectedLoc, parseInt(e.target.value) || 0)}
                    className={`w-20 text-center font-semibold ${qty <= 5 ? "text-destructive" : ""}`}
                  />
                  <Button variant="outline" size="icon" onClick={() => adjust(p.id, selectedLoc, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent></Card>
      )}
    </>
  );
}

// ============ TRANSFERIR ============
function TransferirTab({
  locations, products, getQty, onDone,
}: {
  locations: Location[]; products: Product[];
  getQty: (pid: string, lid: string) => number; onDone: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [fromLoc, setFromLoc] = useState("");
  const [toLoc, setToLoc] = useState("");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");

  const { data: transfers = [], refetch } = useQuery({
    queryKey: ["stock_transfers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_transfers")
        .select("id, quantity, notes, created_at, created_by_name, product:products(name), from:stock_locations!stock_transfers_from_location_id_fkey(name), to:stock_locations!stock_transfers_to_location_id_fkey(name)")
        .order("created_at", { ascending: false }).limit(20);
      if (error) return [];
      return data as unknown as Array<{
        id: string; quantity: number; notes: string | null; created_at: string;
        created_by_name: string | null;
        product: { name: string } | null;
        from: { name: string } | null;
        to: { name: string } | null;
      }>;
    },
  });

  const submit = async () => {
    if (!productId || !fromLoc || !toLoc) return toast.error("Preencha todos os campos");
    const q = parseInt(qty);
    if (!q || q <= 0) return toast.error("Quantidade inválida");
    const { error } = await supabase.rpc("transfer_stock", {
      _product_id: productId, _from_location: fromLoc, _to_location: toLoc,
      _quantity: q, _notes: notes.trim() || undefined,
    });
    if (error) return toast.error(error.message);
    toast.success("Transferência realizada");
    setProductId(""); setQty("1"); setNotes("");
    onDone(); refetch();
  };

  const fromQty = productId && fromLoc ? getQty(productId, fromLoc) : 0;

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Nova transferência</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Produto</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>De</Label>
              <Select value={fromLoc} onValueChange={setFromLoc}>
                <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {productId && fromLoc && (
                <div className="text-xs text-muted-foreground mt-1">Disponível: {fromQty}</div>
              )}
            </div>
            <div>
              <Label>Para</Label>
              <Select value={toLoc} onValueChange={setToLoc}>
                <SelectTrigger><SelectValue placeholder="Destino" /></SelectTrigger>
                <SelectContent>
                  {locations.filter((l) => l.id !== fromLoc).map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <Label>Observação (opcional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button onClick={submit} className="w-full">
            <ArrowRightLeft className="h-4 w-4" /> Transferir
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico recente</CardTitle></CardHeader>
        <CardContent>
          {transfers.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">Nenhuma transferência ainda</div>
          ) : (
            <div className="space-y-2">
              {transfers.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm p-2 rounded border">
                  <span className="font-medium flex-1">{t.product?.name ?? "?"}</span>
                  <Badge variant="outline">{t.quantity}</Badge>
                  <span className="text-muted-foreground text-xs">{t.from?.name}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground text-xs">{t.to?.name}</span>
                  <span className="text-muted-foreground text-xs ml-2">
                    {new Date(t.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ============ INVENTÁRIO ============
function InventarioTab({
  ownerId, locations, products, stock, onClosed,
}: {
  ownerId: string; locations: Location[]; products: Product[]; stock: Stock[]; onClosed: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pinTargetId, setPinTargetId] = useState<string | null>(null);

  const { data: inventories = [], refetch: refetchInv } = useQuery({
    queryKey: ["stock_inventories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_inventories")
        .select("id, location_id, status, opened_at, closed_at, net_value, total_surplus_value, total_shortage_value, opened_by_name")
        .order("opened_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data as Inventory[];
    },
  });

  const openInv = inventories.find((i) => i.status === "open");

  useEffect(() => {
    if (!activeId && openInv) setActiveId(openInv.id);
  }, [openInv, activeId]);

  const start = async (locId: string) => {
    const { data: existing } = await supabase.from("stock_inventories")
      .select("id").eq("status", "open").eq("location_id", locId).maybeSingle();
    if (existing) {
      setActiveId(existing.id);
      return toast.info("Já existe inventário aberto neste local");
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { data: name } = await supabase.from("user_roles")
      .select("display_name, email").eq("user_id", user!.id).maybeSingle();
    const { data: inv, error } = await supabase.from("stock_inventories").insert({
      user_id: ownerId, location_id: locId,
      opened_by: user!.id, opened_by_name: name?.display_name ?? name?.email ?? null,
    }).select("id").single();
    if (error) return toast.error(error.message);

    // Snapshot system qty
    const items = products.map((p) => {
      const qty = stock.find((s) => s.product_id === p.id && s.location_id === locId)?.quantity ?? 0;
      return {
        user_id: ownerId, inventory_id: inv.id, product_id: p.id, product_name: p.name,
        system_qty: qty, cost_price: Number(p.cost_price ?? 0),
      };
    });
    if (items.length > 0) {
      const { error: itErr } = await supabase.from("stock_inventory_items").insert(items);
      if (itErr) return toast.error(itErr.message);
    }
    setActiveId(inv.id);
    refetchInv();
    toast.success("Inventário iniciado");
  };

  if (activeId) {
    const inv = inventories.find((i) => i.id === activeId);
    return (
      <InventoryWizard
        inventoryId={activeId}
        location={locations.find((l) => l.id === inv?.location_id)}
        readOnly={inv?.status === "closed"}
        onBack={() => setActiveId(null)}
        onClosed={() => { refetchInv(); onClosed(); setActiveId(null); }}
      />
    );
  }

  return (
    <>
      <AuthorizationDialog
        open={!!pinTargetId}
        onOpenChange={(open) => !open && setPinTargetId(null)}
        scope="operation"
        title="Ver Inventário"
        description="Acesso restrito. Digite o PIN para visualizar o histórico."
        onApproved={() => {
          if (pinTargetId) {
            setActiveId(pinTargetId);
            setPinTargetId(null);
          }
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Iniciar inventário</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm text-muted-foreground">Selecione o local para abrir uma contagem</div>
          {locations.map((l) => (
            <Button key={l.id} variant="outline" className="w-full justify-between" onClick={() => start(l.id)}>
              <span>{l.name}</span>
              <ClipboardList className="h-4 w-4" />
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="text-sm font-bold flex items-center gap-2 px-1">
          <Folder className="h-4 w-4 text-primary" /> Histórico (Pastas)
        </div>
        {inventories.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6 border rounded-lg bg-card/40">Nenhum inventário ainda</div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {inventories.map((i) => {
              const loc = locations.find((l) => l.id === i.location_id);
              const isClosed = i.status === "closed";
              return (
                <button
                  key={i.id} 
                  onClick={() => isClosed ? setPinTargetId(i.id) : setActiveId(i.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border bg-card/60 hover:bg-card/80 transition shadow-sm text-left group"
                >
                  <div className={`p-2 rounded-lg ${isClosed ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary animate-pulse"}`}>
                    {isClosed ? <FileText className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm flex items-center gap-2">
                      {new Date(i.opened_at).toLocaleDateString("pt-BR")}
                      {isClosed && <Lock className="h-3 w-3 text-muted-foreground/50" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase font-medium">
                      {loc?.name ?? "Geral"} · {i.opened_by_name?.split(' ')[0] ?? "Sistema"}
                    </div>
                  </div>
                  {isClosed && (
                    <div className="text-right">
                      <div className={`text-sm font-bold ${i.net_value < 0 ? "text-destructive" : "text-emerald-400"}`}>
                        {i.net_value > 0 ? "+" : ""}{formatBRL(Number(i.net_value))}
                      </div>
                      <div className="text-[9px] text-muted-foreground uppercase">Resultado</div>
                    </div>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function InventoryWizard({
  inventoryId, location, readOnly, onBack, onClosed,
}: {
  inventoryId: string; location: Location | undefined; readOnly: boolean;
  onBack: () => void; onClosed: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [adjust, setAdjust] = useState(true);

  const { data: items = [], refetch } = useQuery({
    queryKey: ["stock_inventory_items", inventoryId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_inventory_items")
        .select("id, product_id, product_name, system_qty, counted_qty, cost_price, diff_value")
        .eq("inventory_id", inventoryId).order("product_name");
      if (error) throw error;
      return data as InventoryItem[];
    },
  });

  const updateCount = async (id: string, val: number | null) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const counted = val;
    const diff = counted === null ? 0 : (counted - it.system_qty) * Number(it.cost_price);
    await supabase.from("stock_inventory_items")
      .update({ counted_qty: counted, diff_value: diff }).eq("id", id);
    refetch();
  };

  const totals = useMemo(() => {
    let surplus = 0, shortage = 0, missing = 0;
    items.forEach((i) => {
      if (i.counted_qty === null || i.counted_qty === undefined) { missing++; return; }
      const diff = (i.counted_qty - i.system_qty) * Number(i.cost_price);
      if (diff > 0) surplus += diff; else shortage += -diff;
    });
    return { surplus, shortage, net: surplus - shortage, missing };
  }, [items]);

  const closeInv = async () => {
    if (totals.missing > 0 && !confirm(`${totals.missing} item(s) sem contagem serão ignorados. Continuar?`)) return;
    const { error } = await supabase.rpc("close_inventory", {
      _inventory_id: inventoryId, _adjust_stock: adjust,
    });
    if (error) return toast.error(error.message);
    toast.success("Inventário fechado");
    onClosed();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Inventário · {location?.name ?? ""}</CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              {readOnly ? "Visualização (fechado)" : `Etapa ${step} de 3`}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack}>Voltar</Button>
        </div>
        {!readOnly && (
          <div className="flex gap-1 mt-2">
            {[1, 2, 3].map((n) => (
              <button key={n} onClick={() => setStep(n as 1 | 2 | 3)}
                className={`flex-1 h-1.5 rounded ${step >= n ? "bg-primary" : "bg-secondary"}`} />
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {(readOnly || step === 1) && (
          <div>
            <div className="text-sm font-medium mb-2">1. Quantidade contada</div>
            <div className="space-y-1.5">
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-2 p-2 rounded border">
                  <span className="flex-1 truncate">{i.product_name}</span>
                  <Input
                    type="number" placeholder="—"
                    value={i.counted_qty ?? ""} disabled={readOnly}
                    onChange={(e) => updateCount(i.id, e.target.value === "" ? null : parseInt(e.target.value))}
                    className="w-24"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {(readOnly || step === 2) && (
          <div>
            <div className="text-sm font-medium mb-2">2. Sistema vs Contagem</div>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-sm">
              <div className="font-medium text-xs uppercase text-muted-foreground">Produto</div>
              <div className="font-medium text-xs uppercase text-muted-foreground text-right">Sistema</div>
              <div className="font-medium text-xs uppercase text-muted-foreground text-right">Contado</div>
              <div className="font-medium text-xs uppercase text-muted-foreground text-right">Diferença</div>
              {items.map((i) => {
                const counted = i.counted_qty;
                const diff = counted === null ? null : counted - i.system_qty;
                return (
                  <div key={i.id} className="contents">
                    <div className="truncate py-1">{i.product_name}</div>
                    <div className="text-right py-1">{i.system_qty}</div>
                    <div className="text-right py-1">{counted ?? "—"}</div>
                    <div className={`text-right py-1 font-medium ${diff === null ? "text-muted-foreground" : diff > 0 ? "text-emerald-400" : diff < 0 ? "text-destructive" : ""}`}>
                      {diff === null ? "—" : diff > 0 ? `+${diff}` : diff}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(readOnly || step === 3) && (
          <div className="space-y-3">
            <div className="text-sm font-medium">3. Resultado financeiro</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border p-3 text-center">
                <div className="text-xs text-muted-foreground">Sobra</div>
                <div className="text-lg font-bold text-emerald-400">{formatBRL(totals.surplus)}</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-xs text-muted-foreground">Falta</div>
                <div className="text-lg font-bold text-destructive">{formatBRL(totals.shortage)}</div>
              </div>
              <div className="rounded-lg border p-3 text-center bg-card/60">
                <div className="text-xs text-muted-foreground">Resultado</div>
                <div className={`text-lg font-bold ${totals.net < 0 ? "text-destructive" : "text-emerald-400"}`}>
                  {formatBRL(totals.net)}
                </div>
              </div>
            </div>

            {!readOnly && (
              <>
                {totals.missing > 0 && (
                  <div className="flex items-center gap-2 text-sm text-amber-400 p-2 rounded border border-amber-400/30 bg-amber-400/5">
                    <AlertTriangle className="h-4 w-4" />
                    {totals.missing} item(s) sem contagem
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
                  Ajustar estoque do sistema com a contagem ao fechar
                </label>
                <Button onClick={closeInv} className="w-full">
                  <CheckCircle2 className="h-4 w-4" /> Fechar inventário
                </Button>
              </>
            )}
          </div>
        )}

        {!readOnly && (
          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" disabled={step === 1} onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} className="flex-1">
              Anterior
            </Button>
            <Button variant="outline" disabled={step === 3} onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)} className="flex-1">
              Próxima
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
