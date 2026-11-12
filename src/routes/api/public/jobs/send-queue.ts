import { createFileRoute } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { inWindow, brDayStart, nextDelaySeconds, shouldAutoPause, MAX_ATTEMPTS } from "@/lib/send-engine";
import { contactVariables, renderMessage } from "@/lib/spintax";

// Runs every minute: sends at most ONE message per running campaign, respecting anti-ban rules.
export const Route = createFileRoute("/api/public/jobs/send-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { adminClient, providerFor, friendlyError } = await import("@/lib/whatsapp/gateway.server");
        const db = await adminClient();
        const now = new Date();
        const { data: camps } = await db.from("campaigns").select("*").eq("status", "running");
        const results: string[] = [];
        for (const c of camps ?? []) {
          if (c.next_send_at && new Date(c.next_send_at) > now) continue;
          if (!inWindow(now, c.window_start, c.window_end, c.window_days)) continue;
          const pause = (reason: string) =>
            db.from("campaigns").update({ status: "paused", pause_reason: reason }).eq("id", c.id);
          const { data: inst } = c.instance_id
            ? await db.from("whatsapp_instances").select("id, provider_instance, status").eq("id", c.instance_id).maybeSingle()
            : { data: null };
          if (!inst) { await pause("Escolha um número de WhatsApp."); continue; }
          const { count: today } = await db.from("campaign_messages").select("id", { count: "exact", head: true })
            .eq("workspace_id", c.workspace_id).eq("status", "sent").gte("sent_at", brDayStart(now).toISOString());
          if ((today ?? 0) >= c.daily_limit) continue;
          const { data: msg } = await db.from("campaign_messages").select("*").eq("campaign_id", c.id)
            .eq("status", "queued").order("created_at").limit(1).maybeSingle();
          if (!msg) { await db.from("campaigns").update({ status: "completed" }).eq("id", c.id); continue; }
          // Consent re-checked at send time: contact may have opted out after enqueue.
          const { data: ct } = msg.contact_id
            ? await db.from("contacts").select("name, phone, email, custom_fields, eligible").eq("id", msg.contact_id).maybeSingle()
            : { data: null };
          if (!ct || !ct.eligible) {
            await db.from("campaign_messages").update({ status: "skipped", error: "Contato sem opt-in ou descadastrado" }).eq("id", msg.id);
            continue;
          }
          let provider;
          try { provider = await providerFor(db, c.workspace_id); }
          catch (e) { await pause(friendlyError(e)); continue; }
          const state = await provider.state(inst.provider_instance).catch(() => "disconnected");
          if (state !== "connected") { await pause("Número desconectado."); continue; }
          const text = renderMessage(c.body, contactVariables({
            name: ct.name, phone: ct.phone, email: ct.email,
            custom_fields: (ct.custom_fields ?? {}) as Record<string, string>,
          }));
          let ok = false, err = "";
          try { await provider.sendText(inst.provider_instance, msg.phone, text); ok = true; }
          catch (e) { err = friendlyError(e).slice(0, 200); }
          const attempts = msg.attempts + 1;
          let sent = c.sent, failed = c.failed;
          if (ok) { sent++; await db.from("campaign_messages").update({ status: "sent", body: text, attempts, sent_at: now.toISOString(), error: null }).eq("id", msg.id); }
          else if (attempts < MAX_ATTEMPTS) await db.from("campaign_messages").update({ attempts, error: err }).eq("id", msg.id);
          else { failed++; await db.from("campaign_messages").update({ status: "failed", attempts, error: err }).eq("id", msg.id); }
          const d = nextDelaySeconds(c.sent_in_batch + 1, c);
          const upd: Database["public"]["Tables"]["campaigns"]["Update"] = {
            sent, failed, sent_in_batch: d.resetBatch ? 0 : c.sent_in_batch + 1,
            next_send_at: new Date(now.getTime() + d.seconds * 1000).toISOString(),
          };
          if (shouldAutoPause(sent, failed)) Object.assign(upd, { status: "paused", pause_reason: "Taxa de falhas acima de 15%." });
          await db.from("campaigns").update(upd).eq("id", c.id);
          results.push(`${c.id}:${ok ? "sent" : "fail"}`);
        }
        return Response.json({ ok: true, results });
      },
    },
  },
});
