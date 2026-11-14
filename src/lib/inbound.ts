// Pure helpers for inbound WhatsApp messages (Evolution MESSAGES_UPSERT).
import { normalizeBrPhone } from "@/lib/phone";

export const OPT_OUT_WORDS = ["sair", "parar", "pare", "cancelar", "descadastrar", "stop"];

export function isOptOut(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[.!?\s]+$/g, "");
  return OPT_OUT_WORDS.includes(t);
}

export type Inbound = { phone: string; id: string | null; body: string | null };

export function parseInbound(data: unknown): Inbound[] {
  const list = Array.isArray(data) ? data : Array.isArray((data as any)?.messages) ? (data as any).messages : [data];
  const out: Inbound[] = [];
  for (const m of list as any[]) {
    const key = m?.key ?? {};
    if (key.fromMe) continue;
    const jid = typeof key.remoteJid === "string" ? key.remoteJid : "";
    if (!jid.endsWith("@s.whatsapp.net")) continue; // ignore groups/status
    const phone = normalizeBrPhone(jid.split("@")[0]);
    if (!phone) continue;
    const msg = m?.message ?? {};
    const body = msg.conversation ?? msg.extendedTextMessage?.text ?? msg.buttonsResponseMessage?.selectedDisplayText ?? null;
    out.push({ phone, id: typeof key.id === "string" ? key.id : null, body: typeof body === "string" ? body.slice(0, 4000) : null });
  }
  return out;
}
