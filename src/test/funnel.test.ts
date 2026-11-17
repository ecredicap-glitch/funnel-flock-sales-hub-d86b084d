import { describe, expect, it } from "vitest";
import { STAGES, stageTotals, winRate } from "@/lib/funnel";

describe("funil", () => {
  it("tem as 7 colunas na ordem combinada", () => {
    expect(STAGES.map((s) => s.label)).toEqual(["Novo", "Contatado", "Respondeu", "Interessado", "Proposta", "Fechado", "Perdido"]);
  });
  it("soma quantidade e valor por coluna", () => {
    const t = stageTotals([{ stage: "proposta", value: 1500 }, { stage: "proposta", value: null }, { stage: "fechado", value: 800 }]);
    expect(t.proposta).toEqual({ count: 2, value: 1500 });
    expect(t.fechado).toEqual({ count: 1, value: 800 });
    expect(t.novo).toEqual({ count: 0, value: 0 });
  });
  it("taxa de conversão = fechados ÷ (fechados + perdidos)", () => {
    expect(winRate([{ stage: "fechado" }, { stage: "perdido" }, { stage: "perdido" }, { stage: "perdido" }, { stage: "novo" }])).toBe(25);
    expect(winRate([{ stage: "novo" }])).toBeNull();
  });
});
