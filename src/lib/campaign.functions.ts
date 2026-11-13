import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Res = { ok: true } | { ok: false; error: string };

/** Sends one test message right away through a workspace instance. */
export const sendTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ instanceId: z.string().uuid(), phone: z.string().min(8).max(30), body: z.string().min(1).max(4000) }))
  .handler(async ({ data, context }): Promise<Res> => {
    const { normalizeBrPhone } = await import("./phone");
    const { renderMessage } = await import("./spintax");
    const phone = normalizeBrPhone(data.phone);
    if (!phone) return { ok: false, error: "Telefone inválido. Use DDD + número." };
    const { data: inst } = await context.supabase.from("whatsapp_instances").select("id, workspace_id, provider_instance, status").eq("id", data.instanceId).maybeSingle();
    if (!inst) return { ok: false, error: "Número não encontrado." };
    if (inst.status !== "connected") return { ok: false, error: "Esse número de WhatsApp está desconectado." };
    const g = await import("./whatsapp/gateway.server");
    try {
      const provider = await g.providerFor(await g.adminClient(), inst.workspace_id);
      const text = renderMessage(data.body, { nome: "Teste", primeiro_nome: "Teste", telefone: phone, email: "" });
      await provider.sendText(inst.provider_instance, phone, text);
      return { ok: true };
    } catch (e) { return { ok: false, error: g.friendlyError(e) }; }
  });

const editInput = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(120), instance_id: z.string().uuid(), body: z.string().min(1).max(4000),
  min_interval_s: z.number().int().min(5).max(3600), max_interval_s: z.number().int().min(5).max(3600),
  batch_size: z.number().int().min(1).max(1000), batch_pause_min: z.number().int().min(0).max(240), batch_pause_max: z.number().int().min(0).max(240),
  daily_limit: z.number().int().min(1).max(5000), window_start: z.number().int().min(0).max(23), window_end: z.number().int().min(1).max(24),
  window_days: z.array(z.number().int().min(0).max(6)).min(1), dedupe_days: z.number().int().min(0).max(365),
}).refine((v) => v.max_interval_s >= v.min_interval_s && v.batch_pause_max >= v.batch_pause_min && v.window_end > v.window_start, "Revise intervalos e horário.");

/** Edits a draft/paused campaign's settings (list is fixed once enqueued). */
export const updateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(editInput)
  .handler(async ({ data, context }): Promise<Res> => {
    const { data: c } = await context.supabase.from("campaigns").select("id, workspace_id, status").eq("id", data.id).maybeSingle();
    if (!c) return { ok: false, error: "Campanha não encontrada." };
    if (!["draft", "paused"].includes(c.status)) return { ok: false, error: "Pause a campanha antes de editar." };
    const { data: inst } = await context.supabase.from("whatsapp_instances").select("id").eq("id", data.instance_id).eq("workspace_id", c.workspace_id).maybeSingle();
    if (!inst) return { ok: false, error: "Número inválido." };
    const { id, ...patch } = data;
    const { adminClient } = await import("./whatsapp/gateway.server");
    const { error } = await (await adminClient()).from("campaigns").update(patch).eq("id", id).eq("workspace_id", c.workspace_id);
    return error ? { ok: false, error: error.message } : { ok: true };
  });
