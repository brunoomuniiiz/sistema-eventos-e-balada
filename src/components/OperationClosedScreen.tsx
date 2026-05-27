import { LogOut, Moon, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "@tanstack/react-router";
import { usePermissions } from "@/hooks/usePermissions";
import { useViewAs } from "@/hooks/useViewAs";

function formatNext(date: Date | null): string {
  if (!date) return "sem evento programado";
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return fmt.format(date);
}

export function OperationClosedScreen({
  nextOpenAt,
  nextEventName,
}: {
  nextOpenAt: Date | null;
  nextEventName: string | null;
}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { realIsOwner } = usePermissions();
  const { persona, setPersona } = useViewAs();
  const masking = realIsOwner && persona !== "dono";

  return (
    <div className="min-h-screen grid place-items-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-6">
        {masking && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-left text-xs space-y-2">
            <div className="font-medium text-amber-500 flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Você está em modo "Ver como"
            </div>
            <p className="text-muted-foreground">
              Está simulando outro perfil — por isso o sistema te bloqueou junto. Volte pra visão de Dono pra entrar normalmente.
            </p>
            <Button size="sm" className="w-full" onClick={() => setPersona("dono")}>
              Voltar para visão de Dono
            </Button>
          </div>
        )}

        <div className="h-20 w-20 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 grid place-items-center">
          <Moon className="h-10 w-10 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Bar fechado</h1>
          <p className="text-sm text-muted-foreground">
            O acesso opera só entre 1h antes da abertura e 1h após o encerramento previsto.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card/60 p-4 space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Próxima abertura
          </div>
          <div className="font-semibold capitalize">{formatNext(nextOpenAt)}</div>
          {nextEventName && (
            <div className="text-xs text-muted-foreground">para "{nextEventName}"</div>
          )}
        </div>
        <Button
          variant="ghost"
          className="gap-2"
          onClick={async () => {
            await signOut();
            navigate({ to: "/auth" });
          }}
        >
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    </div>
  );
}
