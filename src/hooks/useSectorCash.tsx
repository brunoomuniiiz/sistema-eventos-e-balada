import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";

export type SectorKey = "bar" | "portaria";
export type SectorStatus = "closed" | "awaiting_open" | "open" | "awaiting_close";

export type SectorRow = {
  id: string;
  user_id: string;
  sector: SectorKey;
  status: SectorStatus;
  opening_amount: number;
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string | null;
  authorized_by: string | null;
  authorized_by_name: string | null;
  authorized_at: string | null;
  close_declared: Record<string, number> | null;
  notes: string | null;
  updated_at: string;
};

export function useSectorStatuses() {
  const { ownerId } = usePermissions();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["sector-statuses", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sector_statuses");
      if (error) throw error;
      return (data ?? []) as SectorRow[];
    },
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (!ownerId) return;
    const ch = supabase
      .channel(`cash-sectors-${ownerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_register_sectors", filter: `user_id=eq.${ownerId}` },
        () => qc.invalidateQueries({ queryKey: ["sector-statuses", ownerId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, qc]);

  return q;
}

export function useSectorStatus(sector: SectorKey) {
  const q = useSectorStatuses();
  const row = q.data?.find((r) => r.sector === sector) ?? null;
  return { ...q, row };
}
