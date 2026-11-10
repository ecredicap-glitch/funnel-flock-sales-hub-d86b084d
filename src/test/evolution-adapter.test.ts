import { afterEach, describe, expect, it, vi } from "vitest";
import { EvolutionProvider } from "@/lib/whatsapp/evolution.server";
import { decryptSecret, encryptSecret } from "@/lib/whatsapp/crypto.server";

function mockFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: { method: string; url: string; body?: unknown; apikey: string | null }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const path = url.replace("https://evo.test", "");
    calls.push({
      method,
      url: path,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      apikey: new Headers(init.headers).get("apikey"),
    });
    const hit = routes[`${method} ${path.split("?")[0]}`];
    if (!hit) return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("Evolution adapter", () => {
  const p = new EvolutionProvider("https://evo.test", "global-key");

  it("creates an instance, sends the global key and registers the webhook", async () => {
    const calls = mockFetch({
      "POST /instance/create": {
        body: {
          instance: { instanceName: "zp-1" },
          hash: "inst-token",
          qrcode: { base64: "data:image/png;base64,AAA", pairingCode: null },
        },
      },
      "POST /webhook/set/zp-1": { body: { ok: true } },
    });
    const res = await p.createInstance("zp-1", {
      url: "https://app.test/hook",
      events: ["CONNECTION_UPDATE"],
    });
    expect(res.instanceToken).toBe("inst-token");
    expect(res.qr.qr).toBe("data:image/png;base64,AAA");
    expect(calls.every((c) => c.apikey === "global-key")).toBe(true);
    expect(calls.map((c) => c.url)).toEqual(["/instance/create", "/webhook/set/zp-1"]);
  });

  it("reads the connection state and the owner number", async () => {
    mockFetch({
      "GET /instance/connectionState/zp-1": {
        body: { instance: { instanceName: "zp-1", state: "open" } },
      },
      "GET /instance/fetchInstances": {
        body: [
          {
            name: "zp-1",
            connectionStatus: "open",
            ownerJid: "5591987654321@s.whatsapp.net",
            profileName: "Loja",
          },
        ],
      },
    });
    expect(await p.state("zp-1")).toBe("connected");
    const info = await p.info("zp-1");
    expect(info?.phoneNumber).toBe("5591987654321");
    expect(info?.profileName).toBe("Loja");
  });

  it("turns a rejected key into a friendly message", async () => {
    mockFetch({
      "GET /": { body: { version: "2.2.3" } },
      "GET /instance/fetchInstances": { status: 401, body: { message: "Unauthorized" } },
    });
    await expect(p.health()).rejects.toThrow("Chave de API recusada pelo gateway.");
  });
});

describe("credential encryption", () => {
  it("round-trips and never stores the plain key", async () => {
    process.env["GATEWAY_ENCRYPTION_KEY"] = "x".repeat(64);
    const enc = await encryptSecret("minha-chave-123");
    expect(enc).not.toContain("minha-chave");
    expect(await decryptSecret(enc)).toBe("minha-chave-123");
  });
});
