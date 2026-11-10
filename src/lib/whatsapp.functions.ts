import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = {
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >;
  userId: string;
};
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function assertRole(ctx: Ctx, workspaceId: string, admin: boolean) {
  const { data, error } = admin
    ? await ctx.supabase.rpc("has_workspace_role", { _workspace_id: workspaceId, _role: "admin" })
    : await ctx.supabase.rpc("is_workspace_member", { _workspace_id: workspaceId });
  if (error || !data)
    throw new Error(
      admin ? "Apenas administradores podem fazer isso." : "Sem acesso a este workspace.",
    );
}

/** Loads an instance the caller can see (RLS) and checks the role. */
async function loadInstance(ctx: Ctx, instanceId: string, admin: boolean) {
  const { data, error } = await ctx.supabase
    .from("whatsapp_instances")
    .select(
      "id, workspace_id, provider_instance, status, phone_number, qr_updated_at, connected_at",
    )
    .eq("id", instanceId)
    .maybeSingle();
  if (error || !data) throw new Error("Número não encontrado.");
  await assertRole(ctx, data.workspace_id, admin);
  return data;
}

function fail(e: unknown, friendly: (e: unknown) => string): { ok: false; error: string } {
  if (e instanceof Error && !("status" in e)) {
    if (/administradores|Sem acesso|não encontrado|Configure o gateway/.test(e.message))
      return { ok: false, error: e.message };
  }
  return { ok: false, error: friendly(e) };
}

const uuid = z.string().uuid();

/* ------------------------------ Gateway ------------------------------ */

export const saveGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: uuid,
        baseUrl: z.string().min(8).max(300),
        apiKey: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<Result<{ version: string | null }>> => {
    const g = await import("./whatsapp/gateway.server");
    const { validateGatewayUrl } = await import("./whatsapp/provider");
    const { encryptSecret, decryptSecret } = await import("./whatsapp/crypto.server");
    try {
      await assertRole(context, data.workspaceId, true);
      const url = validateGatewayUrl(data.baseUrl);
      if (!url.ok) return { ok: false, error: url.error };
      const admin = await g.adminClient();
      let apiKey = data.apiKey?.trim() ?? "";
      if (!apiKey) {
        const { data: s } = await admin
          .from("whatsapp_gateway_secrets")
          .select("api_key_enc")
          .eq("workspace_id", data.workspaceId)
          .maybeSingle();
        if (!s) return { ok: false, error: "Informe a chave de API." };
        apiKey = await decryptSecret(s.api_key_enc);
      }
      const provider = g.buildProvider("evolution", url.url, apiKey);
      const { version } = await provider.health();
      const now = new Date().toISOString();
      const { error: e1 } = await admin.from("whatsapp_gateways").upsert({
        workspace_id: data.workspaceId,
        provider: "evolution",
        base_url: url.url,
        api_key_hint: `••••${apiKey.slice(-4)}`,
        status: "ok",
        provider_version: version,
        last_error: null,
        last_checked_at: now,
        updated_by: context.userId,
      });
      if (e1) throw e1;
      const { error: e2 } = await admin.from("whatsapp_gateway_secrets").upsert({
        workspace_id: data.workspaceId,
        api_key_enc: await encryptSecret(apiKey),
        updated_at: now,
      });
      if (e2) throw e2;
      return { ok: true, version };
    } catch (e) {
      return fail(e, g.friendlyError);
    }
  });

export const testGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ workspaceId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<Result<{ version: string | null }>> => {
    const g = await import("./whatsapp/gateway.server");
    const admin = await g.adminClient();
    try {
      await assertRole(context, data.workspaceId, false);
      const provider = await g.providerFor(admin, data.workspaceId);
      const { version } = await provider.health();
      await admin
        .from("whatsapp_gateways")
        .update({
          status: "ok",
          provider_version: version,
          last_error: null,
          last_checked_at: new Date().toISOString(),
        })
        .eq("workspace_id", data.workspaceId);
      return { ok: true, version };
    } catch (e) {
      const res = fail(e, g.friendlyError);
      await admin
        .from("whatsapp_gateways")
        .update({
          status: "error",
          last_error: res.error,
          last_checked_at: new Date().toISOString(),
        })
        .eq("workspace_id", data.workspaceId);
      return res;
    }
  });

/* ------------------------------ Instances ------------------------------ */

export const createInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: uuid,
        displayName: z.string().trim().min(1).max(60),
        dailyLimit: z.number().int().min(1).max(5000),
        warmup: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<Result<{ id: string; webhook: boolean }>> => {
    const g = await import("./whatsapp/gateway.server");
    const { encryptSecret, randomToken, sha256Hex } = await import("./whatsapp/crypto.server");
    const admin = await g.adminClient();
    let createdId: string | null = null;
    try {
      await assertRole(context, data.workspaceId, true);
      const provider = await g.providerFor(admin, data.workspaceId);
      const name = `zp-${data.workspaceId.slice(0, 8)}-${randomToken(4)}`;
      const token = randomToken();
      const { data: row, error } = await admin
        .from("whatsapp_instances")
        .insert({
          workspace_id: data.workspaceId,
          provider_instance: name,
          display_name: data.displayName,
          daily_limit: data.dailyLimit,
          warmup_enabled: data.warmup,
          status: "connecting",
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      createdId = row.id;
      const hook = g.webhookConfig(g.publicBaseUrl(getRequest()), row.id, token);
      const created = await provider.createInstance(name, hook);
      await admin.from("whatsapp_instance_secrets").insert({
        instance_id: row.id,
        webhook_token_hash: await sha256Hex(token),
        instance_token_enc: created.instanceToken
          ? await encryptSecret(created.instanceToken)
          : null,
      });
      await admin
        .from("whatsapp_instances")
        .update({
          webhook_url: hook ? hook.url.split("?")[0]! : null,
          qr_code: created.qr.qr,
          pairing_code: created.qr.pairingCode,
          qr_updated_at: created.qr.qr ? new Date().toISOString() : null,
        })
        .eq("id", row.id);
      await admin.from("whatsapp_events").insert({
        workspace_id: data.workspaceId,
        instance_id: row.id,
        event: "instance.created",
        actor: context.userId,
      });
      return { ok: true, id: row.id, webhook: !!hook };
    } catch (e) {
      if (createdId) await admin.from("whatsapp_instances").delete().eq("id", createdId);
      return fail(e, g.friendlyError);
    }
  });

/** Refreshes status; when not connected and the QR is stale, asks the gateway for a fresh one. */
export const syncInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        instanceId: uuid,
        wantQr: z.boolean().default(false),
        phoneNumber: z
          .string()
          .regex(/^55\d{10,11}$/)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<Result<{ status: string }>> => {
    const g = await import("./whatsapp/gateway.server");
    const admin = await g.adminClient();
    try {
      const inst = await loadInstance(context, data.instanceId, false);
      const provider = await g.providerFor(admin, inst.workspace_id);
      const state = await provider.state(inst.provider_instance);
      const now = new Date();
      const patch: import("@/integrations/supabase/types").Database["public"]["Tables"]["whatsapp_instances"]["Update"] =
        { status: state, last_error: null };
      if (state === "connected") {
        patch["qr_code"] = null;
        patch["pairing_code"] = null;
        if (inst.status !== "connected" || !inst.phone_number) {
          const info = await provider.info(inst.provider_instance).catch(() => null);
          if (info) {
            patch["phone_number"] = info.phoneNumber;
            patch["profile_name"] = info.profileName;
            patch["profile_pic_url"] = info.profilePicUrl;
          }
          if (inst.status !== "connected") patch["connected_at"] = now.toISOString();
        }
      } else if (data.wantQr) {
        const stale =
          !inst.qr_updated_at || now.getTime() - new Date(inst.qr_updated_at).getTime() > 25_000;
        if (stale || data.phoneNumber) {
          const qr = await provider.connect(inst.provider_instance, data.phoneNumber);
          if (qr.state === "connected") patch["status"] = "connected";
          else {
            patch["status"] = "connecting";
            patch["qr_code"] = qr.qr;
            patch["pairing_code"] = qr.pairingCode;
            patch["qr_updated_at"] = now.toISOString();
          }
        }
      }
      if (inst.status === "connected" && patch["status"] !== "connected")
        patch["disconnected_at"] = now.toISOString();
      await admin.from("whatsapp_instances").update(patch).eq("id", inst.id);
      if (patch["status"] !== inst.status) {
        await admin.from("whatsapp_events").insert({
          workspace_id: inst.workspace_id,
          instance_id: inst.id,
          event: "connection.update",
          detail: { from: inst.status, to: patch["status"] ?? null, via: "sync" },
          actor: context.userId,
        });
      }
      return { ok: true, status: String(patch["status"]) };
    } catch (e) {
      const res = fail(e, g.friendlyError);
      await admin
        .from("whatsapp_instances")
        .update({ last_error: res.error })
        .eq("id", data.instanceId);
      return res;
    }
  });

const actionInput = (input: unknown) =>
  z
    .object({ instanceId: uuid, action: z.enum(["logout", "restart", "delete", "webhook"]) })
    .parse(input);

export const instanceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(actionInput)
  .handler(async ({ data, context }): Promise<Result> => {
    const g = await import("./whatsapp/gateway.server");
    const admin = await g.adminClient();
    try {
      const inst = await loadInstance(context, data.instanceId, data.action !== "restart");
      const provider = await g.providerFor(admin, inst.workspace_id);
      const now = new Date().toISOString();
      const log = (event: string) =>
        admin.from("whatsapp_events").insert({
          workspace_id: inst.workspace_id,
          instance_id: inst.id,
          event,
          actor: context.userId,
        });

      if (data.action === "logout") {
        await provider.logout(inst.provider_instance).catch((e: unknown) => {
          if (
            (e as { status?: number }).status !== 400 &&
            (e as { status?: number }).status !== 404
          )
            throw e;
        });
        await admin
          .from("whatsapp_instances")
          .update({
            status: "disconnected",
            qr_code: null,
            pairing_code: null,
            disconnected_at: now,
          })
          .eq("id", inst.id);
        await log("instance.logout");
      } else if (data.action === "restart") {
        await provider.restart(inst.provider_instance);
        await log("instance.restart");
      } else if (data.action === "delete") {
        await provider.deleteInstance(inst.provider_instance);
        await admin.from("whatsapp_instances").delete().eq("id", inst.id);
      } else {
        const { randomToken, sha256Hex } = await import("./whatsapp/crypto.server");
        const token = randomToken();
        const hook = g.webhookConfig(g.publicBaseUrl(getRequest()), inst.id, token);
        if (!hook)
          return {
            ok: false,
            error: "Abra o app pelo endereço publicado para registrar o webhook.",
          };
        await provider.setWebhook(inst.provider_instance, hook);
        await admin
          .from("whatsapp_instance_secrets")
          .update({ webhook_token_hash: await sha256Hex(token), updated_at: now })
          .eq("instance_id", inst.id);
        await admin
          .from("whatsapp_instances")
          .update({ webhook_url: hook.url.split("?")[0]! })
          .eq("id", inst.id);
        await log("webhook.updated");
      }
      return { ok: true };
    } catch (e) {
      return fail(e, g.friendlyError);
    }
  });
