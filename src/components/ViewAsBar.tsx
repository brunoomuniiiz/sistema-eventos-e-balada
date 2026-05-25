import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, ExternalLink, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { getPersonaDestination, useViewAs, PERSONAS, type PersonaKey } from "@/hooks/useViewAs";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

export function ViewAsBar() {
  const { realIsOwner } = usePermissions();
  const { user } = useAuth();
  const { persona, setPersona } = useViewAs();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data: links } = useQuery({
    queryKey: ["view-as-links", user?.id],
    enabled: !!user && realIsOwner,
    queryFn: async () => {
      const [loja, evt] = await Promise.all([
        supabase.from("lojinha_settings").select("slug, enabled").eq("user_id", user!.id).maybeSingle(),
        supabase
          .from("events")
          .select("id, public_slug, name")
          .eq("user_id", user!.id)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      let promoterSlug: string | null = null;
      if (evt.data?.id) {
        const { data } = await supabase
          .from("event_promoters")
          .select("slug")
          .eq("event_id", evt.data.id)
          .limit(1)
          .maybeSingle();
        promoterSlug = data?.slug ?? null;
      }
      return {
        lojaSlug: loja.data?.enabled ? loja.data.slug : loja.data?.slug ?? null,
        eventoSlug: evt.data?.public_slug ?? null,
        promoterSlug,
      };
    },
  });

  if (!realIsOwner) return null;

  const isMasked = persona !== "dono";

  const select = (p: PersonaKey) => {
    setPersona(p);
    setOpen(false);
    const destination = getPersonaDestination(p);
    setTimeout(() => navigate({ ...destination, replace: true }), 0);
  };

  const exitMask = () => {
    setPersona("dono");
    setTimeout(() => navigate({ to: "/dashboard", replace: true }), 0);
  };

  const openExternal = (path: string | null) => {
    if (!path) return;
    window.open(path, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      {isMasked && (
        <div className="fixed top-0 left-0 right-0 z-[70] bg-amber-500 text-amber-950 text-sm font-semibold px-3 py-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 shadow-lg">
          <span>Visualizando como <span className="uppercase">{PERSONAS[persona].label}</span></span>
          <span className="text-xs opacity-80">→ {getPersonaDestination(persona).to}{getPersonaDestination(persona).search?.tab ? `?tab=${getPersonaDestination(persona).search?.tab}` : ""}</span>
          <button
            onClick={exitMask}
            className="inline-flex items-center gap-1 underline hover:no-underline"
          >
            <X className="h-3 w-3" /> sair
          </button>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            className="fixed z-40 bottom-24 md:bottom-6 left-4 md:left-auto md:right-4 h-10 md:h-12 px-3 md:px-4 rounded-full bg-primary/90 backdrop-blur text-primary-foreground shadow-lg flex items-center gap-1.5 md:gap-2 text-xs md:text-sm font-semibold hover:opacity-90 transition"
            aria-label="Ver como"
          >
            <Eye className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="hidden sm:inline">{isMasked ? PERSONAS[persona].label : "Ver como"}</span>
            <span className="sm:hidden">{isMasked ? PERSONAS[persona].label.slice(0,3) : "Ver"}</span>
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[340px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle>Pré-visualizar o sistema</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-2">
            <div className="text-xs uppercase text-muted-foreground font-semibold px-1">Painel interno</div>
            {(Object.keys(PERSONAS) as PersonaKey[])
              // "lojinha" fica em stand-by — vendedor online é Garçom com permissões individuais
              .filter((key) => key !== "lojinha")
              .map((key) => {
                const active = persona === key;
                return (
                  <button
                    key={key}
                    onClick={() => select(key)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition ${
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{PERSONAS[key].label}</span>
                      {active && <Badge variant="secondary">ativo</Badge>}
                    </div>
                  </button>
                );
              })}
          </div>

          <div className="mt-6 space-y-2">
            <div className="text-xs uppercase text-muted-foreground font-semibold px-1">Páginas do cliente</div>
            <Button
              variant="outline"
              className="w-full justify-between"
              disabled={!links?.lojaSlug}
              onClick={() => openExternal(links?.lojaSlug ? `/loja/${links.lojaSlug}` : null)}
            >
              <span>Lojinha online</span>
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between"
              disabled={!links?.eventoSlug}
              onClick={() => openExternal(links?.eventoSlug ? `/e/${links.eventoSlug}` : null)}
            >
              <span>Página do evento</span>
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between"
              disabled={!links?.promoterSlug}
              onClick={() => openExternal(links?.promoterSlug ? `/lista/${links.promoterSlug}` : null)}
            >
              <span>Lista do promoter</span>
              <ExternalLink className="h-4 w-4" />
            </Button>
            {(!links?.lojaSlug || !links?.eventoSlug || !links?.promoterSlug) && (
              <p className="text-xs text-muted-foreground px-1">
                Links cinzas precisam ser configurados primeiro (lojinha, evento publicado, promoter vinculado).
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
