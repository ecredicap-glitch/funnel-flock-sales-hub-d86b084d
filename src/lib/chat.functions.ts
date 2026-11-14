import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Res = { ok: true } | { ok: false; error: string };

/** Sends a manual reply from the inbox and records it in the conversation history. */
export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workspaceId: z.string().uuid(), phone: z.string().min(8).max(30), body: z.string().trim().min(1).max(4000) }))
  .handler(async ({ data, context }): Promise<Res> => {
    const { data: isMember } = await context.supabase.rpc("is_workspace_member", { _workspace_id: data.workspaceId });
    if (!isMember) return { ok: false, error: "Sem acesso a este espaço." };
    const { data: contact } = await context.supabase.from("contacts").select("id, status").eq("workspace_id", data.workspaceId).eq("phone", data.phone).maybeSingle();
    if (contact && contact.status !== "active") return { ok: false, error: "Este contato pediu para não receber mensagens." };
    const { data: inst } = await context.supabase.from("whatsapp_instances").select("id, provider_instance").eq("workspace_id", data.workspaceId).eq("status", "connected").order("connected_at", { ascending: false }).limit(1).maybeSingle();
    if (!inst) return { ok: false, error: "Nenhum número de WhatsApp conectado." };
    const g = await import("./whatsapp/gateway.server");
    try {
      const admin = await g.adminClient();
      await (await g.providerFor(admin, data.workspaceId)).sendText(inst.provider_instance, data.phone, data.body);
      await admin.from("outbound_messages").insert({ workspace_id: data.workspaceId, instance_id: inst.id, contact_id: contact?.id ?? null, phone: data.phone, body: data.body, sent_by: context.userId });
      return { ok: true };
    } catch (e) { return { ok: false, error: g.friendlyError(e) }; }
  });
