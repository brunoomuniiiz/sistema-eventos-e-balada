import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";

export type OperationWindow = {
  isOpen: boolean;
  eventName: string | null;
  eventDate: Date | null;
  opensAt: Date | null;
  closesAt: Date | null;
};

const EMPTY: OperationWindow = {
  isOpen: false,
  eventName: null,
  eventDate: null,
  opensAt: null,
  closesAt: null,
};

/**
 * Janela de operação do bar:
 *   abre 1h antes do próximo evento e fecha em `auto_close_hours_after + 1h` após o horário.
 */
export function useOperationWindow() {
  const { ownerId } = usePermissions();

  const { data } = useQuery({
    queryKey: ["operation-window", ownerId],
    enabled: !!ownerId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<OperationWindow> => {
      const now = new Date();
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status, auto_open_minutes_before, auto_close_hours_after")
        .in("status", ["upcoming", "ongoing"])
        .gte("date", new Date(now.getTime() - 24 * 3600_000).toISOString())
        .order("date", { ascending: true })
        .limit(5);
      if (error) throw error;
      const events = data ?? [];

      // Ongoing tem prioridade
      const ongoing = events.find((e) => e.status === "ongoing");
      const target = ongoing ?? events.find((e) => e.status === "upcoming");
      if (!target) return EMPTY;

      const eventDate = new Date(target.date);
      const opensAt = new Date(
        eventDate.getTime() - (target.auto_open_minutes_before ?? 60) * 60_000,
      );
      const closesAt = new Date(
        eventDate.getTime() + ((target.auto_close_hours_after ?? 8) + 1) * 3600_000,
      );
      const isOpen = now >= opensAt && now <= closesAt;

      return {
        isOpen,
        eventName: target.name,
        eventDate,
        opensAt,
        closesAt,
      };
    },
  });

  return data ?? EMPTY;
}
