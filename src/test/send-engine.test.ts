import { describe, expect, it } from "vitest";
import { inWindow, nextDelaySeconds, shouldAutoPause, brDayStart } from "@/lib/send-engine";

const rules = { min_interval_s: 15, max_interval_s: 45, batch_size: 20, batch_pause_min: 3, batch_pause_max: 8 };
describe("send-engine", () => {
  it("respeita a janela de horário (UTC-3)", () => {
    // Seg 12/11/2026 10:00 BRT = 13:00 UTC (quinta) — usa dia real
    const d = new Date("2026-11-12T13:00:00Z"); // quinta 10h
    expect(inWindow(d, 8, 19, [4])).toBe(true);
    expect(inWindow(new Date("2026-11-12T23:00:00Z"), 8, 19, [4])).toBe(false); // 20h
    expect(inWindow(d, 8, 19, [0])).toBe(false);
  });
  it("intervalo entre 15 e 45s e pausa longa após o lote", () => {
    expect(nextDelaySeconds(1, rules, () => 0).seconds).toBe(15);
    expect(nextDelaySeconds(1, rules, () => 0.999).seconds).toBe(45);
    const p = nextDelaySeconds(20, rules, () => 0);
    expect(p).toEqual({ seconds: 180, resetBatch: true });
  });
  it("pausa sozinha acima de 15% de falhas", () => {
    expect(shouldAutoPause(8, 2)).toBe(true);
    expect(shouldAutoPause(9, 1)).toBe(false);
    expect(shouldAutoPause(1, 2)).toBe(false);
  });
  it("início do dia em horário de Brasília", () => {
    expect(brDayStart(new Date("2026-11-13T02:00:00Z")).toISOString()).toBe("2026-11-12T03:00:00.000Z");
  });
});
