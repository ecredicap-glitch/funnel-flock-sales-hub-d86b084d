import { createFileRoute } from "@tanstack/react-router";

const MAX_BODY = 1_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Gateway callbacks (Evolution). Authenticated by the per-instance token in the URL,
// compared against a stored SHA-256 hash. Never returns data.
export const Route = createFileRoute("/api/public/whatsapp/webhook/$instanceId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (!UUID.test(params.instanceId) || !/^[0-9a-f]{48}$/.test(token)) {
          return new Response("unauthorized", { status: 401 });
        }
        const len = Number(request.headers.get("content-length") ?? 0);
        if (len > MAX_BODY) return new Response("payload too large", { status: 413 });

        const { sha256Hex, timingSafeEqual } = await import("@/lib/whatsapp/crypto.server");
        const { adminClient, providerFor } = await import("@/lib/whatsapp/gateway.server");
        const { mapEvolutionState, normalizeEventName } = await import("@/lib/whatsapp/provider");
        const admin = await adminClient();

        const { data: secret } = await admin
          .from("whatsapp_instance_secrets")
          .select("webhook_token_hash")
          .eq("instance_id", params.instanceId)
          .maybeSingle();
        if (!secret || !timingSafeEqual(secret.webhook_token_hash, await sha256Hex(token))) {
          return new Response("unauthorized", { status: 401 });
        }

        const raw = await request.text();
        if (raw.length > MAX_BODY) return new Response("payload too large", { status: 413 });
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return new Response("bad request", { status: 400 });
        }

        const { data: inst } = await admin
          .from("whatsapp_instances")
          .select("id, workspace_id, provider_instance, status, phone_number")
          .eq("id", params.instanceId)
          .maybeSingle();
        if (!inst) return new Response("gone", { status: 410 });

        const event = normalizeEventName(payload["event"]);
        const data = (payload["data"] ?? {}) as Record<string, unknown>;
        const now = new Date().toISOString();

        if (event === "qrcode.updated") {
          const q = (data["qrcode"] ?? data) as Record<string, unknown>;
          const b64 = typeof q["base64"] === "string" ? q["base64"] : null;
          if (b64) {
            await admin
              .from("whatsapp_instances")
              .update({
                status: "connecting",
                qr_code: b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`,
                pairing_code: typeof q["pairingCode"] === "string" ? q["pairingCode"] : null,
                qr_updated_at: now,
                last_event_at: now,
              })
              .eq("id", inst.id);
          }
        } else if (event === "connection.update" || event === "logout.instance") {
          const next =
            event === "logout.instance" ? "disconnected" : mapEvolutionState(data["state"]);
          const patch: import("@/integrations/supabase/types").Database["public"]["Tables"]["whatsapp_instances"]["Update"] =
            { status: next, last_event_at: now };
          if (next === "connected") {
            patch["qr_code"] = null;
            patch["pairing_code"] = null;
            if (inst.status !== "connected") patch["connected_at"] = now;
            const wuid = typeof data["wuid"] === "string" ? data["wuid"] : null;
            if (wuid) patch["phone_number"] = wuid.split("@")[0]!.split(":")[0]!.replace(/\D/g, "");
            if (!inst.phone_number || !wuid) {
              try {
                const info = await (
                  await providerFor(admin, inst.workspace_id)
                ).info(inst.provider_instance);
                if (info) {
                  patch["phone_number"] = info.phoneNumber ?? patch["phone_number"] ?? null;
                  patch["profile_name"] = info.profileName;
                  patch["profile_pic_url"] = info.profilePicUrl;
                }
              } catch {
                /* best effort */
              }
            }
          } else if (inst.status === "connected") {
            patch["disconnected_at"] = now;
          }
          await admin.from("whatsapp_instances").update(patch).eq("id", inst.id);
          if (next !== inst.status) {
            await admin.from("whatsapp_events").insert({
              workspace_id: inst.workspace_id,
              instance_id: inst.id,
              event: "connection.update",
              detail: {
                from: inst.status,
                to: next,
                via: "webhook",
                reason: typeof data["statusReason"] === "number" ? data["statusReason"] : null,
              },
            });
          }
        } else if (event === "remove.instance") {
          await admin
            .from("whatsapp_instances")
            .update({
              status: "disconnected",
              last_event_at: now,
              last_error: "Instância removida no gateway.",
            })
            .eq("id", inst.id);
        } else {
          // Message events are handled by the inbox (roadmap step 5); just track liveness.
          await admin.from("whatsapp_instances").update({ last_event_at: now }).eq("id", inst.id);
        }
        return Response.json({ received: true });
      },
    },
  },
});
