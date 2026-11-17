/** Funnel stages, in board order. Mirrors the database enum `deal_stage`. */
export const STAGES = [
  { id: "novo", label: "Novo", hint: "Lead adicionado, ainda sem mensagem." },
  { id: "contatado", label: "Contatado", hint: "Recebeu mensagem de campanha. Entra aqui sozinho." },
  { id: "respondeu", label: "Respondeu", hint: "Respondeu no WhatsApp. Entra aqui sozinho." },
  { id: "interessado", label: "Interessado", hint: "Mostrou interesse real no serviço." },
  { id: "proposta", label: "Proposta", hint: "Proposta ou orçamento enviado." },
  { id: "fechado", label: "Fechado", hint: "Virou cliente." },
  { id: "perdido", label: "Perdido", hint: "Desistiu ou pediu SAIR (entra aqui sozinho)." },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const PRODUCTS = ["Limpa Nome", "Crédito", "Consórcio", "Rating", "Contabilidade"] as const;

/** Count and total estimated value per stage. */
export function stageTotals(deals: { stage: StageId; value: number | null }[]) {
  const out = Object.fromEntries(STAGES.map((s) => [s.id, { count: 0, value: 0 }])) as Record<StageId, { count: number; value: number }>;
  for (const d of deals) {
    out[d.stage].count++;
    out[d.stage].value += Number(d.value ?? 0);
  }
  return out;
}

/** Share of decided leads (fechado + perdido) that were won, 0–100; null when none decided. */
export function winRate(deals: { stage: StageId }[]) {
  const won = deals.filter((d) => d.stage === "fechado").length;
  const lost = deals.filter((d) => d.stage === "perdido").length;
  return won + lost === 0 ? null : Math.round((won / (won + lost)) * 100);
}

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
