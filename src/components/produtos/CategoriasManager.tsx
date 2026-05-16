import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X, Shapes } from "lucide-react";

type Cat = { id: string; name: string; sort_order: number; is_default: boolean };

export function CategoriasManager() {
  const { ownerId } = usePermissions();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const { data: cats = [] } = useQuery({
    queryKey: ["product_categories", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id, name, sort_order, is_default")
        .order("sort_order");
      if (error) throw error;
      return data as Cat[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["product_categories"] });
    qc.invalidateQueries({ queryKey: ["pdv-categories"] });
  };

  const add = async () => {
    if (!newName.trim() || !ownerId) return;
    const next = (cats[cats.length - 1]?.sort_order ?? 0) + 1;
    const { error } = await supabase.from("product_categories").insert({
      user_id: ownerId, name: newName.trim(), sort_order: next, is_default: false,
    });
    if (error) return toast.error(error.message);
    setNewName("");
    refresh();
  };

  const rename = async (id: string) => {
    if (!editingName.trim()) return;
    const { error } = await supabase.from("product_categories")
      .update({ name: editingName.trim() }).eq("id", id);
    if (error) return toast.error(error.message);
    setEditingId(null);
    refresh();
  };

  const remove = async (c: Cat) => {
    if (!confirm(`Excluir "${c.name}"? Produtos ficarão sem categoria.`)) return;
    await supabase.from("products").update({ category_id: null }).eq("category_id", c.id);
    const { error } = await supabase.from("product_categories").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["products-full"] });
    refresh();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Shapes className="h-4 w-4" /> Categorias de produto
        </div>
        <div className="flex gap-2">
          <Input placeholder="Nova categoria" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
        {cats.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">Nenhuma categoria.</div>
        ) : (
          <div className="space-y-2">
            {cats.map((c) => (
              <div key={c.id} className="flex items-center gap-2 p-2 rounded border">
                {editingId === c.id ? (
                  <>
                    <Input value={editingName} onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && rename(c.id)} className="flex-1" autoFocus />
                    <Button size="icon" variant="ghost" onClick={() => rename(c.id)}><Check className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 font-medium">{c.name}</span>
                    {c.is_default && <Badge variant="secondary" className="text-[10px]">padrão</Badge>}
                    <Button size="icon" variant="ghost" onClick={() => { setEditingId(c.id); setEditingName(c.name); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(c)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
