import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { decryptSecret } from "./crypto.server";
import { EvolutionProvider } from "./evolution.server";
import { ProviderError, WEBHOOK_EVENTS, type WhatsAppProvider } from "./provider";

type Admin = SupabaseClient<Database>;

export async function adminClient(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function buildProvider(provider: string, baseUrl: string, apiKey: string): WhatsAppProvider {
  if (provider === "evolution") return new EvolutionProvider(baseUrl, apiKey);
  throw new ProviderError("Provedor não suportado.", 400);
}

/** Provider for a workspace, or a friendly error when the gateway isn't configured. */
export async function providerFor(admin: Admin, workspaceId: string): Promise<WhatsAppProvider> {
  const [{ data: gw }, { data: secret }] = await Promise.all([
    admin
      .from("whatsapp_gateways")
      .select("provider, base_url")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    admin
      .from("whatsapp_gateway_secrets")
      .select("api_key_enc")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  if (!gw || !secret)
    throw new ProviderError("Configure o gateway em Configurações → Gateway.", 412);
  return buildProvider(gw.provider, gw.base_url, await decryptSecret(secret.api_key_enc));
}

/**
 * Public base URL the gateway can call back. Editor previews are behind a login,
 * so they map to the project's stable public preview host.
 */
export function publicBaseUrl(request: Request): string | null {
  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return null;
  }
  const preview = /^id-preview--([0-9a-f-]{36})\.lovable\.app$/.exec(u.hostname);
  if (preview) return `https://project--${preview[1]}-dev.lovable.app`;
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return null;
  return u.origin;
}

export function webhookConfig(base: string | null, instanceId: string, token: string) {
  if (!base) return null;
  return {
    url: `${base}/api/public/whatsapp/webhook/${instanceId}?token=${token}`,
    events: WEBHOOK_EVENTS,
  };
}

export function friendlyError(e: unknown): string {
  if (e instanceof ProviderError) return e.message;
  console.error(e);
  return "Algo deu errado ao falar com o gateway. Tente novamente.";
}
