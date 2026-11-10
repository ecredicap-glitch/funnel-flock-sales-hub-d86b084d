import { normalizeBrPhone } from "./phone";

export type ImportField =
  "ignore" | "name" | "phone" | "email" | "tags" | "opt_in" | "opt_in_at" | "custom";

export const FIELD_LABEL: Record<ImportField, string> = {
  ignore: "Ignorar coluna",
  name: "Nome",
  phone: "Telefone",
  email: "E-mail",
  tags: "Tags",
  opt_in: "Opt-in (sim/não)",
  opt_in_at: "Data do opt-in",
  custom: "Campo personalizado",
};

export type OptInMode = "all" | "column" | "none";

export type ImportRow = {
  phone: string;
  name?: string;
  email?: string;
  tags?: string[];
  custom?: Record<string, string>;
  opt_in?: boolean;
  opt_in_at?: string;
};

export type InvalidRow = { line: number; value: string };

export const MAX_IMPORT_ROWS = 50_000;
export const BATCH_SIZE = 500;

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Guess a field from a spreadsheet header. */
export function guessField(header: string): ImportField {
  const h = strip(header);
  if (!h) return "ignore";
  if (/(data|date).*(opt|consent)|(opt|consent).*(data|date)/.test(h)) return "opt_in_at";
  if (/opt ?in|consent|autoriz|aceite/.test(h)) return "opt_in";
  if (/whats|celular|telefone|fone|phone|mobile|numero|contato tel|^tel/.test(h)) return "phone";
  if (/e ?mail/.test(h)) return "email";
  if (/^tags?$|etiqueta|marcador/.test(h)) return "tags";
  if (/^nome|^name|cliente|razao social|^contato$/.test(h)) return "name";
  return "custom";
}

/** Custom field key from a header: "Cidade de Origem" → "cidade_de_origem". */
export function customKey(header: string): string {
  return strip(header).replace(/ /g, "_").slice(0, 40) || "campo";
}

const YES = new Set([
  "sim",
  "s",
  "yes",
  "y",
  "true",
  "1",
  "x",
  "ok",
  "verdadeiro",
  "aceito",
  "autorizado",
]);

export function parseOptIn(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const v = strip(String(value ?? ""));
  return YES.has(v) || v === "✓";
}

/** Excel serial, dd/mm/yyyy[ hh:mm], or ISO → ISO string. */
export function parseDate(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === "number") {
    if (value < 20000 || value > 80000) return undefined;
    const ms = Math.round((value - 25569) * 86400 * 1000);
    return new Date(ms).toISOString();
  }
  const s = String(value).trim();
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (br) {
    const [, dd, mm, yy, hh = "12", mi = "00"] = br;
    const year = yy!.length === 2 ? 2000 + Number(yy) : Number(yy);
    const d = new Date(Date.UTC(year, Number(mm) - 1, Number(dd), Number(hh) + 3, Number(mi)));
    return Number.isNaN(d.getTime()) || Number(mm) > 12 || Number(dd) > 31
      ? undefined
      : d.toISOString();
  }
  const iso = new Date(s);
  return Number.isNaN(iso.getTime()) ? undefined : iso.toISOString();
}

export function splitTags(value: unknown): string[] {
  return String(value ?? "")
    .split(/[,;|]/)
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean);
}

/**
 * Turns spreadsheet rows (array of cells, header excluded) into import rows using the
 * column mapping. Phones are normalized; invalid phones and in-file duplicates are dropped.
 * `firstLine` is the spreadsheet line number of the first data row (for error messages).
 */
export function buildImportRows(
  records: unknown[][],
  headers: string[],
  mapping: ImportField[],
  firstLine = 2,
): { rows: ImportRow[]; invalid: InvalidRow[]; duplicates: number; empty: number } {
  const phoneCol = mapping.indexOf("phone");
  const rows: ImportRow[] = [];
  const invalid: InvalidRow[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let empty = 0;
  if (phoneCol < 0) return { rows, invalid, duplicates, empty };

  records.forEach((rec, i) => {
    if (!rec || rec.every((c) => c == null || String(c).trim() === "")) {
      empty++;
      return;
    }
    const rawPhone = rec[phoneCol];
    const phone = normalizeBrPhone(rawPhone);
    if (!phone) {
      invalid.push({ line: firstLine + i, value: String(rawPhone ?? "").trim() || "(vazio)" });
      return;
    }
    if (seen.has(phone)) {
      duplicates++;
      return;
    }
    seen.add(phone);

    const row: ImportRow = { phone };
    mapping.forEach((field, col) => {
      const cell = rec[col];
      const text = cell == null ? "" : String(cell).trim();
      switch (field) {
        case "name":
          if (text) row.name = text.slice(0, 120);
          break;
        case "email":
          if (text && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) row.email = text.toLowerCase();
          break;
        case "tags":
          row.tags = [...(row.tags ?? []), ...splitTags(text)];
          break;
        case "opt_in":
          row.opt_in = parseOptIn(cell);
          break;
        case "opt_in_at": {
          const iso = parseDate(cell);
          if (iso) row.opt_in_at = iso;
          break;
        }
        case "custom":
          if (text)
            row.custom = {
              ...(row.custom ?? {}),
              [customKey(headers[col] ?? `coluna_${col + 1}`)]: text.slice(0, 500),
            };
          break;
        default:
          break;
      }
    });
    rows.push(row);
  });
  return { rows, invalid, duplicates, empty };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
