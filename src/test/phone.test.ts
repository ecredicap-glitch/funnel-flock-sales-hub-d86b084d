import { describe, expect, it } from "vitest";
import { formatBrPhone, normalizeBrPhone } from "@/lib/phone";

describe("normalizeBrPhone → 55 + DDD + número", () => {
  it("accepts a masked mobile without country code", () => {
    expect(normalizeBrPhone("(91) 98765-4321")).toBe("5591987654321");
  });
  it("keeps +55 numbers", () => {
    expect(normalizeBrPhone("+55 11 98765-4321")).toBe("5511987654321");
  });
  it("strips the 00 international prefix", () => {
    expect(normalizeBrPhone("0055 11 98765 4321")).toBe("5511987654321");
  });
  it("strips trunk 0 and carrier code", () => {
    expect(normalizeBrPhone("011 98765-4321")).toBe("5511987654321");
    expect(normalizeBrPhone("0 15 11 98765-4321")).toBe("5511987654321");
  });
  it("adds the 9 to old 8-digit mobiles", () => {
    expect(normalizeBrPhone("91 8765-4321")).toBe("5591987654321");
  });
  it("keeps landlines with 8 digits", () => {
    expect(normalizeBrPhone("(11) 3456-7890")).toBe("551134567890");
  });
  it("accepts numbers coming from spreadsheets as numeric cells", () => {
    expect(normalizeBrPhone(5511987654321)).toBe("5511987654321");
  });
  it("rejects invalid area codes, short numbers and 9-digit numbers not starting with 9", () => {
    expect(normalizeBrPhone("(20) 98765-4321")).toBeNull();
    expect(normalizeBrPhone("98765-4321")).toBeNull();
    expect(normalizeBrPhone("(11) 88765-4321")).toBeNull();
    expect(normalizeBrPhone("")).toBeNull();
  });
  it("formats for display", () => {
    expect(formatBrPhone("5511987654321")).toBe("+55 (11) 98765-4321");
  });
});
