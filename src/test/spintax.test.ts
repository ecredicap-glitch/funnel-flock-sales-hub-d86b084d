import { describe, expect, it } from "vitest";
import { checkSpintax, contactVariables, countVariations, extractVariables, renderMessage } from "@/lib/spintax";
import { STARTER_TEMPLATES } from "@/lib/templates";

const first = () => 0;
const last = () => 0.999;

describe("spintax", () => {
  it("fills variables and picks one option per group", () => {
    const body = "{Olá|Oi}, {{primeiro_nome}}!";
    expect(renderMessage(body, { primeiro_nome: "Ana" }, first)).toBe("Olá, Ana!");
    expect(renderMessage(body, { primeiro_nome: "Ana" }, last)).toBe("Oi, Ana!");
  });

  it("resolves nested groups", () => {
    expect(renderMessage("{a {x|y}|b}", {}, first)).toBe("a x");
    expect(countVariations("{a {x|y}|b}")).toBe(3);
  });

  it("multiplies independent groups", () => {
    expect(countVariations("{Olá|Oi} {tudo bem|como vai|e aí}")).toBe(6);
  });

  it("does not treat {{variavel}} as a variation", () => {
    expect(countVariations("Oi {{nome}}")).toBe(1);
    expect(checkSpintax("Oi {{nome}}")).toBeNull();
  });

  it("flags unbalanced braces", () => {
    expect(checkSpintax("{Olá|Oi")).not.toBeNull();
    expect(checkSpintax("Olá}")).not.toBeNull();
    expect(countVariations("{Olá|Oi")).toBe(0);
  });

  it("removes the gap left by an empty variable", () => {
    expect(renderMessage("Olá {{nome}}, tudo bem?", {}, first)).toBe("Olá, tudo bem?");
  });

  it("variable values never take part in spintax", () => {
    expect(renderMessage("Oi {{nome}}", { nome: "{A|B}" }, first)).toBe("Oi {A|B}");
  });

  it("builds first name and custom fields from a contact", () => {
    const v = contactVariables({ name: "Ana Souza", phone: "5591988887777", custom_fields: { cidade: "Belém" } });
    expect(v["primeiro_nome"]).toBe("Ana");
    expect(extractVariables("{{Cidade}} {{nome}}")).toEqual(["cidade", "nome"]);
    expect(renderMessage("{{cidade}}", v)).toBe("Belém");
  });

  it("ships 8 valid starter templates, each with an opt-out line", () => {
    expect(STARTER_TEMPLATES).toHaveLength(8);
    for (const t of STARTER_TEMPLATES) {
      expect(checkSpintax(t.body)).toBeNull();
      expect(t.body).toContain("SAIR");
    }
  });
});
