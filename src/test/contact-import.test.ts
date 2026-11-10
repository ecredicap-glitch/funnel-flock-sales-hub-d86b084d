import { describe, expect, it } from "vitest";
import { buildImportRows, guessField, parseDate, parseOptIn } from "@/lib/contact-import";

describe("contact import", () => {
  it("guesses common Portuguese headers", () => {
    expect(guessField("Nome")).toBe("name");
    expect(guessField("WhatsApp")).toBe("phone");
    expect(guessField("Celular")).toBe("phone");
    expect(guessField("E-mail")).toBe("email");
    expect(guessField("Opt-in")).toBe("opt_in");
    expect(guessField("Data do opt-in")).toBe("opt_in_at");
    expect(guessField("Cidade")).toBe("custom");
  });

  it("drops duplicates inside the file (same number in different formats)", () => {
    const res = buildImportRows(
      [
        ["Ana", "(91) 98765-4321"],
        ["Ana B", "+55 91 98765-4321"],
        ["Bruno", "11 3456-7890"],
      ],
      ["Nome", "Telefone"],
      ["name", "phone"],
    );
    expect(res.rows.map((r) => r.phone)).toEqual(["5591987654321", "551134567890"]);
    expect(res.duplicates).toBe(1);
  });

  it("reports invalid phones with their spreadsheet line", () => {
    const res = buildImportRows(
      [
        ["Ana", "123"],
        ["Bia", "(91) 98765-4321"],
      ],
      ["Nome", "Tel"],
      ["name", "phone"],
    );
    expect(res.invalid).toEqual([{ line: 2, value: "123" }]);
    expect(res.rows).toHaveLength(1);
  });

  it("reads opt-in answers", () => {
    expect(parseOptIn("Sim")).toBe(true);
    expect(parseOptIn("não")).toBe(false);
    expect(parseOptIn("")).toBe(false);
  });

  it("parses Brazilian dates", () => {
    expect(parseDate("05/03/2026")?.slice(0, 10)).toBe("2026-03-05");
  });
});
