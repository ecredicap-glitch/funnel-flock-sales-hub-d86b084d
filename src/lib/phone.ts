/** Brazilian area codes (DDD) in use. */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Normalizes a Brazilian phone to `55 + DDD + number` (digits only).
 * Accepts masks, +55/0055 prefixes, trunk "0" and carrier codes, and old 8-digit
 * mobiles (adds the 9). Returns null when the number can't be a valid BR phone.
 */
export function normalizeBrPhone(input: unknown): string | null {
  if (input == null) return null;
  let raw =
    typeof input === "number"
      ? Number.isFinite(input)
        ? Math.round(input).toString()
        : ""
      : String(input);
  raw = raw.trim();
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2); // international prefix 00 55 ...
  if (d.startsWith("0")) {
    // 0 + carrier(2) + DDD + number  |  0 + DDD + number
    if (d.length === 13 || d.length === 14) d = d.slice(3);
    else if (d.length === 11 || d.length === 12) d = d.slice(1);
    else return null;
  }
  let national: string;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) national = d.slice(2);
  else if (d.length === 10 || d.length === 11) national = d;
  else return null;

  const ddd = Number(national.slice(0, 2));
  if (!DDDS.has(ddd)) return null;
  let num = national.slice(2);
  if (num.length === 9) {
    if (num[0] !== "9") return null;
  } else if (num.length === 8) {
    const first = Number(num[0]);
    if (first >= 6)
      num = `9${num}`; // old mobile without the leading 9
    else if (first < 2) return null;
  } else {
    return null;
  }
  return `55${national.slice(0, 2)}${num}`;
}

/** "5511987654321" → "+55 (11) 98765-4321" */
export function formatBrPhone(phone: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(phone);
  if (!m) return phone;
  return `+55 (${m[1]}) ${m[2]}-${m[3]}`;
}
