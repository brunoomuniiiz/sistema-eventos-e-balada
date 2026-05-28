import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Sparkles, Users, Check, MessageCircle, Download, Share2, MapPin, Instagram } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";


export const Route = createFileRoute("/lista/$slug")({
  component: GuestListPage,
});

function GuestListPage() {
  const { slug } = Route.useParams();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [done, setDone] = useState(false);
  const [showCountRequested, setShowCountRequested] = useState(false);
  const [fakeViewing, setFakeViewing] = useState(() => 6 + Math.floor(Math.random() * 19));

  useEffect(() => {
    const id = setInterval(() => setFakeViewing(6 + Math.floor(Math.random() * 19)), 15000);
    return () => clearInterval(id);
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["public-list", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_guest_list_info", {
        _slug: slug,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("add_guest_to_list", {
        _slug: slug,
        _name: name,
        _phone: phone,
        _gender: gender,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDone(true);
      refetch();
      toast.success("Você está na lista!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Informe seu nome");
    addMut.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <Card className="glass max-w-md w-full">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Lista não encontrada.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const closed = data.event_status !== "upcoming" && data.event_status !== "ongoing" && data.event_status !== "live";
  const eventDate = new Date(data.event_date);
  const isEventDay = isSameDay(eventDate, new Date());
  const showRealCount = Boolean(data.show_real_count_when_big) && isEventDay && Number(data.total_entries) >= 400 && showCountRequested;
  const waGroup = (data as { event_whatsapp_group_url?: string | null }).event_whatsapp_group_url ?? null;

  const d = data as {
    promoter_avatar_url?: string | null;
    promoter_instagram?: string | null;
    promoter_guest_message?: string | null;
  };
  const promoterAvatar = d.promoter_avatar_url ?? null;
  const promoterInsta = (d.promoter_instagram ?? "").replace(/^@/, "").trim();
  const guestMessage = (d.promoter_guest_message ?? "").trim() || `Você é meu convidado no ${data.event_name}! 🔥`;
  const initials = String(data.promoter_name ?? "?").slice(0, 2).toUpperCase();

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `${guestMessage} Entra na minha lista: ${shareUrl}`;
  const waShareHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="min-h-screen px-4 py-10 grid place-items-center">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="h-10 w-10 rounded-2xl bg-gradient-primary grid place-items-center glow-primary">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
        </div>

        <Card className="glass overflow-hidden">
          {data.event_flyer_url && (
            <div className="relative bg-black/40 grid place-items-center">
              <img src={data.event_flyer_url} alt={data.event_name} className="w-full h-auto object-contain max-h-[80vh]" />
              <div className="absolute top-3 right-3 flex gap-2">
                <a
                  href={data.event_flyer_url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 grid place-items-center rounded-full bg-background/80 backdrop-blur border hover:bg-background"
                  title="Baixar flyer"
                >
                  <Download className="h-4 w-4" />
                </a>
                <a
                  href={waShareHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 grid place-items-center rounded-full bg-[#25D366] text-white hover:opacity-90"
                  title="Compartilhar no WhatsApp"
                >
                  <Share2 className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}

          <CardContent className="p-6 md:p-8">
            <h1 className="text-2xl font-bold text-gradient">{data.event_name}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
              <Calendar className="h-4 w-4" />
              {format(eventDate, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
              {(data as { event_end_date?: string | null }).event_end_date && (
                <span>· até {format(new Date((data as { event_end_date: string }).event_end_date), "HH:mm")}</span>
              )}
            </div>
            {data.event_location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <MapPin className="h-4 w-4" /> {data.event_location}
              </div>
            )}
            {data.event_description && (
              <p className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap">{data.event_description}</p>
            )}

            {/* Card destacado do promoter */}
            <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-14 w-14 ring-2 ring-primary/40">
                  <AvatarImage src={promoterAvatar ?? undefined} alt={data.promoter_name} />
                  <AvatarFallback className="bg-gradient-primary text-primary-foreground font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-wide text-primary font-semibold">Seu promoter</div>
                  <div className="font-bold truncate">{data.promoter_name}</div>
                  {promoterInsta && (
                    <a
                      href={`https://instagram.com/${promoterInsta}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-primary"
                    >
                      <Instagram className="h-3 w-3" /> @{promoterInsta}
                    </a>
                  )}
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{guestMessage}</p>
            </div>

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {showRealCount
                  ? <>{Number(data.total_entries)} confirmados</>
                  : <>{fakeViewing} pessoas vendo agora</>}
              </div>

              {!showCountRequested && Number(data.total_entries) >= 400 && data.show_real_count_when_big && (
                <button
                  onClick={() => setShowCountRequested(true)}
                  className="text-[10px] text-primary hover:underline font-medium"
                >
                  Ver quantidade de nomes
                </button>
              )}
            </div>


            {closed ? (
              <div className="mt-6 p-4 rounded-md bg-secondary/40 text-center text-sm text-muted-foreground">
                A lista deste evento está fechada.
              </div>
            ) : done ? (
              <div className="mt-6 space-y-3">
                <div className="p-6 rounded-md bg-success/10 border border-success/30 text-center">
                  <Check className="h-10 w-10 mx-auto text-success mb-2" />
                  <p className="font-semibold">Tudo certo!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Você está na lista de {data.promoter_name}.
                  </p>
                </div>
                {waGroup && (
                  <a
                    href={waGroup}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full h-11 rounded-md bg-[#25D366] text-white font-medium hover:opacity-90 transition"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Entrar no grupo do WhatsApp
                  </a>
                )}
                <a
                  href={waShareHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-11 rounded-md border font-medium hover:bg-muted transition"
                >
                  <Share2 className="h-4 w-4" />
                  Chamar os amigos no WhatsApp
                </a>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="g-name">Nome completo *</Label>
                  <Input
                    id="g-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="g-phone">WhatsApp</Label>
                  <Input
                    id="g-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="g-gender">Gênero</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger id="g-gender">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Feminino">Feminino</SelectItem>
                      <SelectItem value="Masculino">Masculino</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  disabled={addMut.isPending}
                  className="w-full bg-gradient-primary text-primary-foreground glow-primary"
                >
                  {addMut.isPending ? "Enviando..." : "Entrar na lista"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
