import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type ActiveEventResult =
  | { kind: "single"; event: { id: string; name: string; date: string; status: string } }
  | { kind: "none" }
  | { kind: "multiple"; events: { id: string; name: string }[] };

export function useActiveEvent() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<ActiveEventResult>({
    queryKey: ["active-event", user?.id],
    enabled: !!user,
    refetchInterval: 60000, // re-verifica a cada 60s
    queryFn: async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      // Busca eventos upcoming/ongoing do dia (ou próximos)
      const { data: events, error } = await supabase
        .from("events")
        .select("id, name, date, status, auto_open_minutes_before, auto_close_hours_after")
        .in("status", ["upcoming", "ongoing"])
        .gte("date", todayStart.toISOString())
        .lte("date", todayEnd.toISOString())
        .order("date", { ascending: true });

      if (error) throw error;

      const list = events ?? [];
      const ongoing = list.filter((e) => e.status === "ongoing");

      // Se já há evento em andamento, retorna ele (ou múltiplos)
      if (ongoing.length === 1) {
        return { kind: "single", event: ongoing[0] } as ActiveEventResult;
      }
      if (ongoing.length > 1) {
        return {
          kind: "multiple",
          events: ongoing.map((e) => ({ id: e.id, name: e.name })),
        } as ActiveEventResult;
      }

      // Nenhum ongoing: verifica se algum upcoming precisa auto-abrir
      for (const ev of list) {
        if (ev.status !== "upcoming") continue;
        const eventDate = new Date(ev.date);
        const openThreshold = new Date(
          eventDate.getTime() - (ev.auto_open_minutes_before ?? 60) * 60000,
        );
        const closeThreshold = new Date(
          eventDate.getTime() + (ev.auto_close_hours_after ?? 8) * 3600000,
        );

        if (now >= openThreshold && now < closeThreshold && now < eventDate) {
          // Auto-abre
          const { error: openErr } = await supabase
            .from("events")
            .update({ status: "ongoing" })
            .eq("id", ev.id);
          if (!openErr) {
            toast.info(`Evento "${ev.name}" aberto automaticamente.`);
            qc.invalidateQueries({ queryKey: ["active-event"] });
            return { kind: "single", event: { ...ev, status: "ongoing" } } as ActiveEventResult;
          }
        }
      }

      return { kind: "none" } as ActiveEventResult;
    },
  });

  return { activeEvent: data ?? { kind: "none" }, loading: isLoading };
}
