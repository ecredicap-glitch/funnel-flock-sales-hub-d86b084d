/**
 * Provider-agnostic WhatsApp gateway contract. Adapters (Evolution today) live in
 * `*.server.ts` files and are only loaded inside server handlers.
 */
export type ConnectionState = "connected" | "connecting" | "disconnected";

export type QrPayload = {
  /** data:image/png;base64,... */
  qr: string | null;
  pairingCode: string | null;
  state: ConnectionState | null;
};

export type InstanceInfo = {
  state: ConnectionState;
  phoneNumber: string | null;
  profileName: string | null;
  profilePicUrl: string | null;
};

export type WebhookConfig = { url: string; events: string[] };

export interface WhatsAppProvider {
  /** Checks URL + key. Returns the provider version when available. */
  health(): Promise<{ version: string | null }>;
  createInstance(
    name: string,
    webhook: WebhookConfig | null,
  ): Promise<{ instanceToken: string | null; qr: QrPayload }>;
  setWebhook(name: string, webhook: WebhookConfig): Promise<void>;
  connect(name: string, phoneNumber?: string): Promise<QrPayload>;
  state(name: string): Promise<ConnectionState>;
  info(name: string): Promise<InstanceInfo | null>;
  restart(name: string): Promise<void>;
  logout(name: string): Promise<void>;
  deleteInstance(name: string): Promise<void>;
  sendText(name: string, phone: string, text: string): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Events the gateway pushes to our webhook. */
export const WEBHOOK_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "LOGOUT_INSTANCE",
  "REMOVE_INSTANCE",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "SEND_MESSAGE",
];

/** "connection.update" | "CONNECTION_UPDATE" → "connection.update" */
export function normalizeEventName(event: unknown): string {
  return String(event ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, ".");
}

export function mapEvolutionState(state: unknown): ConnectionState {
  const s = String(state ?? "").toLowerCase();
  if (s === "open" || s === "connected") return "connected";
  if (s === "connecting") return "connecting";
  return "disconnected";
}

/** Rejects URLs the server must never call (local/private networks, bare IPs, credentials). */
export function validateGatewayUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "URL inválida. Exemplo: https://evolution.suaempresa.com.br" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:")
    return { ok: false, error: "Use http:// ou https://." };
  if (u.username || u.password) return { ok: false, error: "Não inclua usuário ou senha na URL." };
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.startsWith("[") ||
    !host.includes(".")
  ) {
    return {
      ok: false,
      error:
        "Use um domínio público (ex.: evolution.suaempresa.com.br), não um IP ou endereço local.",
    };
  }
  const path = u.pathname.replace(/\/+$/, "");
  return { ok: true, url: `${u.protocol}//${u.host}${path}` };
}
