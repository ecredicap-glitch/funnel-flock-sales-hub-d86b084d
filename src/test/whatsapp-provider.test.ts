import { describe, expect, it } from "vitest";
import { mapEvolutionState, normalizeEventName, validateGatewayUrl } from "@/lib/whatsapp/provider";

describe("gateway URL rules", () => {
  it("accepts a public domain and strips the trailing slash", () => {
    expect(validateGatewayUrl("https://evo.empresa.com.br/")).toEqual({
      ok: true,
      url: "https://evo.empresa.com.br",
    });
  });
  it("rejects bare IPs, localhost and URLs with credentials", () => {
    expect(validateGatewayUrl("http://192.168.0.10:8080").ok).toBe(false);
    expect(validateGatewayUrl("http://localhost:8080").ok).toBe(false);
    expect(validateGatewayUrl("https://user:pass@evo.empresa.com").ok).toBe(false);
  });
});

describe("Evolution events", () => {
  it("normalizes event names from both formats", () => {
    expect(normalizeEventName("CONNECTION_UPDATE")).toBe("connection.update");
    expect(normalizeEventName("qrcode.updated")).toBe("qrcode.updated");
  });
  it("maps connection states", () => {
    expect(mapEvolutionState("open")).toBe("connected");
    expect(mapEvolutionState("connecting")).toBe("connecting");
    expect(mapEvolutionState("close")).toBe("disconnected");
  });
});
