import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { UserCog, KeyRound, Phone, Banknote, Camera, Loader2, ShieldCheck, Check, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { setOwnerPin, hasOwnerPin } from "@/lib/owner-pin.functions";

export const Route = createFileRoute("/_app/minha-conta")({
  component: MinhaContaPage,
});

export function MinhaContaPage() {
  const { user } = useAuth();
  const { rolePreset, isOwner } = usePermissions();
  const setPinFn = useServerFn(setOwnerPin);
  const hasPinFn = useServerFn(hasOwnerPin);
  const { data: pinStatus, refetch: refetchPin } = useQuery({
    queryKey: ["has-owner-pin", user?.id],
    enabled: !!user && isOwner,
    queryFn: () => hasPinFn(),
  });
  const [opPin, setOpPin] = useState("");
  const [opPin2, setOpPin2] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  const saveOpPin = async () => {
    if (!/^[0-9]{4,8}$/.test(opPin)) return toast.error("PIN deve ter 4 a 8 dígitos");
    if (opPin !== opPin2) return toast.error("Os PINs não coincidem");
    setSavingPin(true);
    try {
      await setPinFn({ data: { pin: opPin } });
      toast.success("PIN cadastrado");
      setOpPin(""); setOpPin2("");
      refetchPin();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingPin(false);
    }
  };

  const removeOpPin = async () => {
    if (!confirm("Remover o PIN de operação? Todas as autorizações voltarão a pedir e-mail e senha.")) return;
    setSavingPin(true);
    try {
      await setPinFn({ data: { pin: "" } });
      toast.success("PIN removido");
      refetchPin();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingPin(false);
    }
  };
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: row } = useQuery({
    queryKey: ["my-role-row", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("id, display_name, email, whatsapp, pix_key, pix_enabled, avatar_url")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [pixEnabled, setPixEnabled] = useState(false);
  const [pixKey, setPixKey] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (row) {
      setName(row.display_name ?? "");
      setWhatsapp(row.whatsapp ?? "");
      setPixEnabled(row.pix_enabled ?? false);
      setPixKey(row.pix_key ?? "");
    }
  }, [row]);

  const saveProfile = async () => {
    if (!row) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("user_roles")
        .update({
          display_name: name.trim() || null,
          whatsapp: whatsapp.trim() || null,
          pix_enabled: pixEnabled,
          pix_key: pixEnabled ? (pixKey.trim() || null) : null,
        })
        .eq("id", row.id);
      if (error) throw error;
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["my-role-row"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    if (pwd.length < 6) return toast.error("Senha mínima de 6 caracteres");
    if (pwd !== pwd2) return toast.error("As senhas não coincidem");
    setSavingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      toast.success("Senha alterada");
      setPwd(""); setPwd2("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingPwd(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!user || !row) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Imagem muito grande (máx 5MB)");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error } = await supabase.from("user_roles").update({ avatar_url: pub.publicUrl }).eq("id", row.id);
      if (error) throw error;
      toast.success("Foto atualizada");
      qc.invalidateQueries({ queryKey: ["my-role-row"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const initials = (name || row?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6 max-w-xl">
      <PageHeader title="Configuração" subtitle={rolePreset === "promoter" ? "Sua área de promoter" : "Dados pessoais"} />

      {/* Avatar */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-20 w-20 ring-2 ring-primary/30">
              <AvatarImage src={row?.avatar_url ?? undefined} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-md hover:scale-105 transition"
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{name || "Sem nome"}</div>
            <div className="text-xs text-muted-foreground truncate">{row?.email ?? user?.email}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Toque na câmera para mudar a foto</div>
          </div>
        </CardContent>
      </Card>

      {/* Identificação */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><UserCog className="h-4 w-4 text-primary" /> Identificação</div>
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={row?.email ?? user?.email ?? ""} disabled />
            <p className="text-[11px] text-muted-foreground">Troca de email em breve.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> WhatsApp</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(11) 99999-9999" inputMode="tel" />
            <p className="text-[11px] text-muted-foreground">Usado pelos convidados e pela equipe pra te contatar.</p>
          </div>

          {/* Pix opcional */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5 m-0"><Banknote className="h-3.5 w-3.5" /> Receber por Pix</Label>
              <Switch checked={pixEnabled} onCheckedChange={setPixEnabled} />
            </div>
            {pixEnabled ? (
              <Input
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder="CPF, telefone, email ou chave aleatória"
              />
            ) : (
              <p className="text-[11px] text-muted-foreground">Desligado. Ligue para cadastrar uma chave Pix e receber comissões.</p>
            )}
          </div>

          <Button onClick={saveProfile} disabled={savingProfile} className="bg-gradient-primary text-primary-foreground">
            {savingProfile ? "Salvando..." : "Salvar"}
          </Button>
        </CardContent>
      </Card>

      {/* Senha */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" /> Trocar senha</div>
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Confirmar nova senha</Label>
            <Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
          </div>
          <Button onClick={savePassword} disabled={savingPwd} variant="outline">
            {savingPwd ? "Alterando..." : "Alterar senha"}
          </Button>
        </CardContent>
      </Card>

      {/* PIN de operação (só owner) */}
      {isOwner && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-primary" /> Senha de operação (PIN)
              </div>
              {pinStatus?.exists && (
                <span className="text-[11px] flex items-center gap-1 text-emerald-500">
                  <Check className="h-3 w-3" /> Cadastrado
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Um PIN curto (4 a 8 dígitos) que autoriza ações sensíveis em qualquer dispositivo da equipe sem precisar digitar seu e-mail:
              relatório da portaria, estorno, reimpressão de cupom, abertura/fechamento de caixa.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>{pinStatus?.exists ? "Novo PIN" : "PIN"}</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={opPin}
                  onChange={(e) => setOpPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="text-center tracking-[0.4em] font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={opPin2}
                  onChange={(e) => setOpPin2(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="text-center tracking-[0.4em] font-bold"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveOpPin} disabled={savingPin} className="bg-gradient-primary text-primary-foreground">
                {savingPin ? "Salvando..." : pinStatus?.exists ? "Trocar PIN" : "Cadastrar PIN"}
              </Button>
              {pinStatus?.exists && (
                <Button onClick={removeOpPin} disabled={savingPin} variant="outline">
                  <Trash2 className="h-4 w-4" /> Remover
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

