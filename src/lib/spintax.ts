/**
 * Message rendering: {{variavel}} placeholders + spintax variations {a|b|c} (nestable).
 * Pure functions — shared by the template editor preview and, later, the campaign sender.
 */
export type TemplateVars = Record<string, string | null | undefined>;

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const MAX_COUNT = 1_000_000;

export const BUILTIN_VARIABLES = ["nome", "primeiro_nome", "telefone", "email"] as const;

/** Variable names used in a body, lower-cased, without duplicates. */
export function extractVariables(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(VAR_RE)) out.add((m[1] ?? "").toLowerCase());
  return [...out];
}

function stripVariables(body: string) {
  return body.replace(VAR_RE, "");
}

/** Returns a pt-BR error when the variation braces are not balanced, otherwise null. */
export function checkSpintax(body: string): string | null {
  let depth = 0;
  for (const c of stripVariables(body)) {
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth < 0) return "Há um “}” sem o “{” correspondente.";
    }
  }
  return depth > 0 ? "Há um “{” sem o “}” correspondente." : null;
}

function countSeq(s: string, pos: number, inGroup: boolean): [number, number] {
  let count = 1;
  while (pos < s.length) {
    const c = s[pos];
    if (c === "{") {
      const [g, next] = countGroup(s, pos + 1);
      count = Math.min(count * g, MAX_COUNT);
      pos = next;
    } else if (inGroup && (c === "|" || c === "}")) break;
    else pos++;
  }
  return [count, pos];
}

function countGroup(s: string, pos: number): [number, number] {
  let total = 0;
  for (;;) {
    const [c, next] = countSeq(s, pos, true);
    total = Math.min(total + c, MAX_COUNT);
    pos = next;
    if (s[pos] === "|") pos++;
    else return [total, pos + 1];
  }
}

/** How many distinct texts the variations can produce (capped at 1,000,000). */
export function countVariations(body: string): number {
  if (checkSpintax(body)) return 0;
  return countSeq(stripVariables(body), 0, false)[0];
}

/** Picks one option per {a|b} group, innermost first. */
export function spin(text: string, rng: () => number = Math.random): string {
  const inner = /\{([^{}]*)\}/;
  let out = text;
  for (let guard = 0; guard < 10_000 && inner.test(out); guard++) {
    out = out.replace(inner, (_, group: string) => {
      const options = group.split("|");
      return options[Math.min(options.length - 1, Math.floor(rng() * options.length))] ?? "";
    });
  }
  return out;
}

/** Final text for one contact: variables filled, one variation chosen, spacing tidied. */
export function renderMessage(body: string, vars: TemplateVars, rng: () => number = Math.random): string {
  const values: string[] = [];
  const lower: TemplateVars = {};
  for (const [k, v] of Object.entries(vars)) lower[k.toLowerCase()] = v;
  // Protect variables so their braces (and values) never take part in spintax.
  const protectedBody = body.replace(VAR_RE, (_, name: string) => {
    values.push((lower[name.toLowerCase()] ?? "").trim());
    return `\u0000${values.length - 1}\u0000`;
  });
  return spin(protectedBody, rng)
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => values[Number(i)] ?? "")
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "");
}

/** Standard variables for a contact. */
export function contactVariables(c: {
  name: string | null;
  phone: string;
  email?: string | null;
  custom_fields?: Record<string, string> | null;
}): TemplateVars {
  const name = (c.name ?? "").trim();
  return {
    ...(c.custom_fields ?? {}),
    nome: name,
    primeiro_nome: name.split(/\s+/)[0] ?? "",
    telefone: c.phone,
    email: c.email ?? "",
  };
}
