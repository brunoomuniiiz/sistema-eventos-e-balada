import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

/**
 * A cada 60s, busca eventos com status 'upcoming' cuja hora de início já chegou.
 * Mostra um toast persistente para o dono/gerente confirmar a "abertura" (status -> 'live').
 */
export function useEventStartReminder() {
  const { ownerId, can, isOwner } = usePermissions();
  const notified = useRef<Set<string>>(new Set());

  const { data: pending = [], refetch } = useQuery({
    queryKey: ["event-start-reminders", ownerId],
    enabled: !!ownerId && (isOwner || can("eventos")),
    refetchInterval: 60_000,
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status")
        .eq("status", "upcoming")
        .lte("date", now);
      if (error) throw error;
      return data as { id: string; name: string; date: string; status: string }[];
    },
  });

  useEffect(() => {
    pending.forEach((ev) => {
      if (notified.current.has(ev.id)) return;
      notified.current.add(ev.id);
      toast(`Evento "${ev.name}" começou`, {
        description: "Está na hora marcada. Quer abrir agora?",
        duration: Infinity,
        action: {
          label: "Abrir evento",
          onClick: async () => {
            const { error } = await supabase.rpc("start_event", { _event_id: ev.id });
            if (error) {
              toast.error(error.message);
              notified.current.delete(ev.id);
            } else {
              toast.success("Evento aberto");
              refetch();
            }
          },
        },
      });
    });
  }, [pending, refetch]);
}
