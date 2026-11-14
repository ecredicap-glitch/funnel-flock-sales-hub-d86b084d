import { describe, it, expect } from "vitest";
import { isOptOut, parseInbound } from "@/lib/inbound";

describe("inbound", () => {
  it("SAIR descadastra", () => { expect(isOptOut(" Sair! ")).toBe(true); expect(isOptOut("quero sair depois")).toBe(false); });
  it("ignora mensagens enviadas por nós e grupos", () => {
    expect(parseInbound({ key: { fromMe: true, remoteJid: "5591980257959@s.whatsapp.net" }, message: { conversation: "oi" } })).toEqual([]);
    expect(parseInbound({ key: { remoteJid: "123@g.us" }, message: { conversation: "oi" } })).toEqual([]);
  });
  it("lê resposta do cliente", () => {
    const [r] = parseInbound({ key: { id: "A1", remoteJid: "5591980257959@s.whatsapp.net" }, message: { conversation: "Tenho interesse" } });
    expect(r?.body).toBe("Tenho interesse");
    expect(r?.phone.startsWith("55")).toBe(true);
  });
});
