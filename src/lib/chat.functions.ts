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

const INTENTS = ["Interessado", "Dúvida", "Objeção", "Descadastro", "Neutro"] as const;
type Suggest = { ok: true; intent: string; reply: string } | { ok: false; error: string };

/** Classifies the lead's intent and drafts a reply from the recent conversation (Lovable AI). */
export const suggestChatReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    workspaceId: z.string().uuid(),
    name: z.string().max(120).optional(),
    history: z.array(z.object({ dir: z.enum(["in", "out"]), body: z.string().max(4000) })).min(1).max(20),
  }))
  .handler(async ({ data, context }): Promise<Suggest> => {
    const { data: isMember } = await context.supabase.rpc("is_workspace_member", { _workspace_id: data.workspaceId });
    if (!isMember) return { ok: false, error: "Sem acesso a este espaço." };
    const { generateResponse } = await import("@lovable.dev/ai-gateway");
    const convo = data.history.map((m) => `${m.dir === "in" ? "Cliente" : "Atendente"}: ${m.body}`).join("\n");
    try {
      const r = await generateResponse({
        model: "openai/gpt-6.1-terra",
        instructions: `Você é assistente de vendas de uma consultoria financeira brasileira (negociação de dívidas, limpa nome, crédito). Analise a conversa de WhatsApp e responda SOMENTE um JSON {"intent": um de ${INTENTS.join(", ")}, "reply": "resposta curta, cordial e consultiva em português do Brasil, sem prometer resultados garantidos"}. Se o cliente pediu para sair, a reply deve apenas confirmar o descadastro.`,
        input: `Nome do cliente: ${data.name || "não informado"}\n\n${convo}`,
      });
      const raw = (r as { output_text?: string }).output_text ?? "";
      const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { intent?: string; reply?: string };
      const intent = INTENTS.includes(j.intent as (typeof INTENTS)[number]) ? j.intent! : "Neutro";
      return j.reply ? { ok: true, intent, reply: j.reply } : { ok: false, error: "A IA não sugeriu resposta. Tente novamente." };
    } catch (e) {
      console.error("suggestChatReply", e);
      return { ok: false, error: "Não foi possível gerar a sugestão agora." };
    }
  });
