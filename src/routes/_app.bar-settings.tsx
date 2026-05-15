import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Save, Upload, Image as ImageIcon } from "lucide-react";

export const Route = createFileRoute("/_app/bar-settings")({
  component: BarSettingsPage,
});

function BarSettingsPage() {
  const { isOwner, ownerId, loading } = usePermissions();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["bar-settings", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bar_settings")
        .select("id, bar_name, logo_url, instagram_handle, accent_color")
        .eq("user_id", ownerId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [barName, setBarName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [instagram, setInstagram] = useState("");
  const [accent, setAccent] = useState("#a855f7");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (data) {
      setBarName(data.bar_name ?? "");
      setLogoUrl(data.logo_url ?? "");
      setInstagram(data.instagram_handle ?? "");
      setAccent(data.accent_color ?? "#a855f7");
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!ownerId) throw new Error("Sem owner");
      const payload = {
        user_id: ownerId,
        bar_name: barName.trim() || null,
        logo_url: logoUrl.trim() || null,
        instagram_handle: instagram.trim() || null,
        accent_color: accent,
      };
      if (data?.id) {
        const { error } = await supabase.from("bar_settings").update(payload).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bar_settings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["bar-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadLogo = async (file: File) => {
    if (!ownerId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${ownerId}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("bar-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("bar-assets").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
      toast.success("Logo enviada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  if (loading) return null;
  if (!isOwner) {
    return <PageHeader title="Configuração do bar" subtitle="Apenas o dono pode editar" />;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Configuração do bar" subtitle="Logo, nome e cor que aparecem na landing pública dos eventos" />

      <Card>
        <CardHeader>
          <CardTitle>Identidade visual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome do bar</Label>
            <Input value={barName} onChange={(e) => setBarName(e.target.value)} placeholder="Ex: NightOps Lounge" />
          </div>

          <div>
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 rounded-xl border bg-secondary/30 grid place-items-center overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="logo" className="h-full w-full object-contain" />
                ) : (
                  <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
              />
              <div className="flex-1 space-y-2">
                <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading}>
                  <Upload className="h-4 w-4" /> {uploading ? "Enviando..." : "Enviar logo"}
                </Button>
                <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="ou cole a URL" />
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Instagram</Label>
              <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@seubar" />
            </div>
            <div>
              <Label>Cor de destaque</Label>
              <div className="flex gap-2">
                <Input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-16 p-1 h-10" />
                <Input value={accent} onChange={(e) => setAccent(e.target.value)} className="flex-1" />
              </div>
            </div>
          </div>

          <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
            <Save className="h-4 w-4" /> {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
