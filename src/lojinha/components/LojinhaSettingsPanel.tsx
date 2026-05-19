import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, ExternalLink, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Settings = {
  id?: string;
  enabled: boolean;
  slug: string;
  store_name: string;
  stock_location_id: string | null;
  pickup_message: string;
  accent_color: string;
};

const empty: Settings = {
  enabled: false,
  slug: "",
  store_name: "",
  stock_location_id: null,
  pickup_message: "Retire no balcão apresentando o QR code.",
  accent_color: "#e94560",
};

export function LojinhaSettingsPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings>(empty);
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["lojinha-settings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("lojinha_settings").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["stock-locations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("stock_locations").select("id, name").order("name");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        id: settings.id,
        enabled: settings.enabled,
        slug: settings.slug ?? "",
        store_name: settings.store_name ?? "",
        stock_location_id: settings.stock_location_id,
        pickup_message: settings.pickup_message ?? empty.pickup_message,
        accent_color: settings.accent_color ?? empty.accent_color,
      });
    }
  }, [settings]);

  async function save() {
    if (!user) return;
    if (form.enabled && (!form.slug.trim() || !form.stock_location_id)) {
      toast.error("Para ativar a loja informe slug e localização de estoque");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        enabled: form.enabled,
        slug: form.slug.trim().toLowerCase() || null,
        store_name: form.store_name.trim() || null,
        stock_location_id: form.stock_location_id,
        pickup_message: form.pickup_message,
        accent_color: form.accent_color,
      };
      const { error } = settings?.id
        ? await supabase.from("lojinha_settings").update(payload).eq("id", settings.id)
        : await supabase.from("lojinha_settings").insert(payload);
      if (error) throw error;
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["lojinha-settings"] });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <div className="grid place-items-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const publicUrl = form.slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/loja/${form.slug}` : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuração da Lojinha</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="font-medium">Loja ativa</div>
            <div className="text-xs text-muted-foreground">Quando desligada, ninguém consegue acessar.</div>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Nome exibido</Label>
            <Input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} placeholder="Bar do Zé" />
          </div>
          <div>
            <Label>Slug (URL)</Label>
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="bardoze" />
          </div>
        </div>

        {/* Estoque único — auto-selecionado, sem escolha */}

        <div>
          <Label>Mensagem de retirada</Label>
          <Textarea value={form.pickup_message} onChange={(e) => setForm({ ...form, pickup_message: e.target.value })} rows={2} />
        </div>

        <div>
          <Label>Cor de destaque</Label>
          <div className="flex items-center gap-2">
            <Input type="color" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="h-10 w-16 p-1" />
            <Input value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="flex-1" />
          </div>
        </div>

        {publicUrl && (
          <div className="flex items-center gap-2 rounded-lg border p-2 bg-secondary/30">
            <span className="text-xs flex-1 truncate">{publicUrl}</span>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Copiado"); }}>
              <Copy className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /></a>
            </Button>
          </div>
        )}

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" /> Salvar</>}
        </Button>

        <div className="rounded-lg border border-dashed border-warning/40 bg-warning/5 p-3 text-xs">
          <strong>Mercado Pago:</strong> a integração de pagamento está pronta no back-end mas o token ainda não foi configurado. Quando estiver pronto, é só pedir para conectar.
        </div>
      </CardContent>
    </Card>
  );
}
