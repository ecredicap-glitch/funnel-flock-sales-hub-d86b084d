import { useEffect } from "react";
import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type WhatsAppInstance = Database["public"]["Tables"]["whatsapp_instances"]["Row"];
export type WhatsAppGateway = Database["public"]["Tables"]["whatsapp_gateways"]["Row"];

export const gatewayQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["whatsapp-gateway", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_gateways")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const instancesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["whatsapp-instances", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

/** Keeps the instances cache live while the screen is open. */
export function useInstancesRealtime(workspaceId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`wa-instances-${workspaceId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_instances",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => void qc.invalidateQueries({ queryKey: ["whatsapp-instances", workspaceId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, qc]);
}

export const STATUS_META: Record<string, { label: string; dot: string; pill: string }> = {
  connected: { label: "Conectado", dot: "bg-success", pill: "bg-success/15 text-success" },
  connecting: {
    label: "Aguardando leitura",
    dot: "bg-warning animate-pulse",
    pill: "bg-warning/15 text-warning",
  },
  disconnected: {
    label: "Desconectado",
    dot: "bg-muted-foreground",
    pill: "bg-muted text-muted-foreground",
  },
};
