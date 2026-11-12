import {
  ProviderError,
  mapEvolutionState,
  type ConnectionState,
  type InstanceInfo,
  type QrPayload,
  type WebhookConfig,
  type WhatsAppProvider,
} from "./provider";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

function errorText(body: unknown, status: number): string {
  const b = obj(body);
  const r = obj(b["response"]);
  const msg = r["message"] ?? b["message"] ?? b["error"];
  const text = Array.isArray(msg)
    ? msg.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join("; ")
    : str(msg);
  if (status === 401 || status === 403) return "Chave de API recusada pelo gateway.";
  if (status === 404) return text ?? "Recurso não encontrado no gateway.";
  return text ?? `O gateway respondeu com erro ${status}.`;
}

function qrFrom(body: unknown): QrPayload {
  const b = obj(body);
  const q = obj(b["qrcode"] ?? b);
  const base64 = str(q["base64"]);
  const stateRaw = obj(b["instance"])["state"] ?? b["state"];
  return {
    qr: base64 ? (base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`) : null,
    pairingCode: str(q["pairingCode"]),
    state: stateRaw ? mapEvolutionState(stateRaw) : null,
  };
}

/** Evolution API v2 adapter (header `apikey`, Baileys integration). */
export class EvolutionProvider implements WhatsAppProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async call(method: string, path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          apikey: this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new ProviderError(
        timeout
          ? "O gateway não respondeu a tempo."
          : "Não foi possível alcançar o gateway. Confira a URL.",
        502,
      );
    }
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) throw new ProviderError(errorText(parsed, res.status), res.status);
    return parsed;
  }

  async health() {
    const root = obj(await this.call("GET", "/"));
    // `/` is public on Evolution; this one proves the key is valid.
    await this.call("GET", "/instance/fetchInstances?instanceName=__zappilot_healthcheck__").catch(
      (e: unknown) => {
        if (e instanceof ProviderError && e.status === 404) return null;
        throw e;
      },
    );
    return { version: str(root["version"]) };
  }

  async createInstance(name: string, webhook: WebhookConfig | null) {
    const body = obj(
      await this.call("POST", "/instance/create", {
        instanceName: name,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        ...(webhook
          ? {
              webhook: { url: webhook.url, byEvents: false, base64: false, events: webhook.events },
            }
          : {}),
      }),
    );
    const hash = body["hash"];
    const instanceToken = str(hash) ?? str(obj(hash)["apikey"]);
    if (webhook) await this.setWebhook(name, webhook).catch(() => undefined);
    return { instanceToken, qr: qrFrom(body) };
  }

  async setWebhook(name: string, webhook: WebhookConfig) {
    const n = encodeURIComponent(name);
    try {
      await this.call("POST", `/webhook/set/${n}`, {
        webhook: {
          enabled: true,
          url: webhook.url,
          byEvents: false,
          base64: false,
          events: webhook.events,
        },
      });
    } catch (e) {
      if (!(e instanceof ProviderError) || e.status !== 400) throw e;
      // older v2 builds take a flat body
      await this.call("POST", `/webhook/set/${n}`, {
        enabled: true,
        url: webhook.url,
        webhookByEvents: false,
        webhookBase64: false,
        events: webhook.events,
      });
    }
  }

  async connect(name: string, phoneNumber?: string) {
    const q = phoneNumber ? `?number=${encodeURIComponent(phoneNumber)}` : "";
    return qrFrom(await this.call("GET", `/instance/connect/${encodeURIComponent(name)}${q}`));
  }

  async state(name: string): Promise<ConnectionState> {
    const b = obj(await this.call("GET", `/instance/connectionState/${encodeURIComponent(name)}`));
    return mapEvolutionState(obj(b["instance"])["state"] ?? b["state"]);
  }

  async info(name: string): Promise<InstanceInfo | null> {
    const list = await this.call(
      "GET",
      `/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`,
    );
    const first = obj(Array.isArray(list) ? list[0] : list);
    const i = first["instance"] ? obj(first["instance"]) : first;
    if (!Object.keys(i).length) return null;
    const jid = str(i["ownerJid"]) ?? str(i["owner"]) ?? str(i["number"]);
    return {
      state: mapEvolutionState(i["connectionStatus"] ?? i["status"] ?? i["state"]),
      phoneNumber: jid ? jid.split("@")[0]!.split(":")[0]!.replace(/\D/g, "") || null : null,
      profileName: str(i["profileName"]),
      profilePicUrl: str(i["profilePicUrl"]) ?? str(i["profilePictureUrl"]),
    };
  }

  async restart(name: string) {
    const path = `/instance/restart/${encodeURIComponent(name)}`;
    await this.call("POST", path).catch((e: unknown) => {
      if (e instanceof ProviderError && (e.status === 404 || e.status === 405))
        return this.call("PUT", path);
      throw e;
    });
  }

  async logout(name: string) {
    await this.call("DELETE", `/instance/logout/${encodeURIComponent(name)}`);
  }

  async deleteInstance(name: string) {
    await this.call("DELETE", `/instance/delete/${encodeURIComponent(name)}`).catch(
      (e: unknown) => {
        if (e instanceof ProviderError && e.status === 404) return null; // already gone
        throw e;
      },
    );
  }

  async sendText(name: string, phone: string, text: string) {
    await this.call("POST", `/message/sendText/${encodeURIComponent(name)}`, {
      number: phone,
      text,
      delay: 1500 + Math.floor(Math.random() * 2500),
    });
  }
}
