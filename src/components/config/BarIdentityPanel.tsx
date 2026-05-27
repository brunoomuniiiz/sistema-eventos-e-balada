import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { FONT_FAMILIES } from "@/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Upload, Image as ImageIcon, Sun, Moon } from "lucide-react";

const DEFAULTS = {
  font_family: "Space Grotesk",
  theme_mode: "dark" as "dark" | "light",
  bg_color: "#0a0a14",
  text_color: "#f5f5f7",
  button_color: "#1f6b3a",
};

export function BarIdentityPanel() {
  const { isOwner, ownerId } = usePermissions();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["bar-settings-full", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bar_settings")
        .select("id, bar_name, logo_url, instagram_handle, accent_color, font_family, theme_mode, bg_color, text_color, button_color")
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
  const [fontFamily, setFontFamily] = useState(DEFAULTS.font_family);
  const [themeMode, setThemeMode] = useState<"dark" | "light">(DEFAULTS.theme_mode);
  const [bgColor, setBgColor] = useState(DEFAULTS.bg_color);
  const [textColor, setTextColor] = useState(DEFAULTS.text_color);
  const [buttonColor, setButtonColor] = useState(DEFAULTS.button_color);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (data) {
      const d = data as {
        bar_name: string | null; logo_url: string | null; instagram_handle: string | null;
        accent_color: string | null; font_family?: string | null; theme_mode?: string | null;
        bg_color?: string | null; text_color?: string | null; button_color?: string | null;
      };
      setBarName(d.bar_name ?? "");
      setLogoUrl(d.logo_url ?? "");
      setInstagram(d.instagram_handle ?? "");
      setAccent(d.accent_color ?? "#a855f7");
      setFontFamily(d.font_family || DEFAULTS.font_family);
      setThemeMode((d.theme_mode === "light" ? "light" : "dark"));
      setBgColor(d.bg_color || DEFAULTS.bg_color);
      setTextColor(d.text_color || DEFAULTS.text_color);
      setButtonColor(d.button_color || DEFAULTS.button_color);
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
        font_family: fontFamily,
        theme_mode: themeMode,
        bg_color: bgColor,
        text_color: textColor,
        button_color: buttonColor,
      };
      const dataId = (data as { id?: string } | null)?.id;
      if (dataId) {
        const { error } = await supabase.from("bar_settings").update(payload).eq("id", dataId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bar_settings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Identidade salva");
      qc.invalidateQueries({ queryKey: ["bar-settings-full"] });
      qc.invalidateQueries({ queryKey: ["branding"] });
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

  if (!isOwner) {
    return <div className="text-sm text-muted-foreground">Apenas o dono pode editar a identidade do bar.</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identidade visual</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label>Nome exibido</Label>
          <Input value={barName} onChange={(e) => setBarName(e.target.value)} placeholder="Ex: Happy Beer" />
        </div>

        <div>
          <Label>Logo (canto superior)</Label>
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
            <Label>Fonte</Label>
            <Select value={fontFamily} onValueChange={setFontFamily}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONT_FAMILIES.map((f) => (
                  <SelectItem key={f} value={f} style={{ fontFamily: `"${f}", system-ui` }}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Modo</Label>
            <div className="flex gap-2">
              <Button type="button" variant={themeMode === "dark" ? "default" : "outline"} className="flex-1" onClick={() => setThemeMode("dark")}>
                <Moon className="h-4 w-4" /> Escuro
              </Button>
              <Button type="button" variant={themeMode === "light" ? "default" : "outline"} className="flex-1" onClick={() => setThemeMode("light")}>
                <Sun className="h-4 w-4" /> Claro
              </Button>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>Fundo</Label>
            <div className="flex gap-2">
              <Input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-14 p-1 h-10" />
              <Input value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="flex-1" />
            </div>
          </div>
          <div>
            <Label>Texto</Label>
            <div className="flex gap-2">
              <Input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-14 p-1 h-10" />
              <Input value={textColor} onChange={(e) => setTextColor(e.target.value)} className="flex-1" />
            </div>
          </div>
          <div>
            <Label>Botões</Label>
            <div className="flex gap-2">
              <Input type="color" value={buttonColor} onChange={(e) => setButtonColor(e.target.value)} className="w-14 p-1 h-10" />
              <Input value={buttonColor} onChange={(e) => setButtonColor(e.target.value)} className="flex-1" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border p-4" style={{ background: bgColor, color: textColor, fontFamily: `"${fontFamily}", system-ui` }}>
          <div className="text-xs opacity-70 mb-2">Pré-visualização</div>
          <div className="text-2xl font-bold mb-2">{barName || "Happy Beer"}</div>
          <button type="button" className="px-4 py-2 rounded-md font-medium" style={{ background: buttonColor, color: "#fff" }}>
            Botão de exemplo
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Instagram</Label>
            <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@seubar" />
          </div>
          <div>
            <Label>Cor de destaque (legado)</Label>
            <div className="flex gap-2">
              <Input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-14 p-1 h-10" />
              <Input value={accent} onChange={(e) => setAccent(e.target.value)} className="flex-1" />
            </div>
          </div>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
          <Save className="h-4 w-4" /> {save.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </CardContent>
    </Card>
  );
}
