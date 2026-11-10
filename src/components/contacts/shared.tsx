import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { CONTACT_KEYS } from "@/lib/contacts";
import { cn } from "@/lib/utils";

export function useRefreshContacts() {
  const qc = useQueryClient();
  return () =>
    Promise.all(CONTACT_KEYS.map((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] })));
}

export function fmtDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return "—";
  return format(new Date(iso), withTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy", { locale: ptBR });
}

export function parseTagInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,;]/)
        .map((t) => t.trim().slice(0, 40))
        .filter(Boolean),
    ),
  );
}

export function OptInBadge({
  optInAt,
  source,
}: {
  optInAt: string | null;
  source?: string | null;
}) {
  const ok = !!optInAt;
  return (
    <span
      title={
        ok
          ? `Opt-in em ${fmtDate(optInAt)}${source ? ` · ${source}` : ""}`
          : "Sem consentimento: fica fora das campanhas"
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        ok ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
      )}
    >
      {ok ? <ShieldCheck className="size-3" /> : <ShieldOff className="size-3" />}
      {ok ? "Opt-in" : "Sem opt-in"}
    </span>
  );
}

export function TagChips({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (!tags.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, max).map((t) => (
        <span
          key={t}
          className="rounded-md bg-electric/12 px-1.5 py-0.5 text-[11px] font-medium text-electric"
        >
          {t}
        </span>
      ))}
      {tags.length > max && (
        <span className="text-[11px] text-muted-foreground">+{tags.length - max}</span>
      )}
    </div>
  );
}

export function errorMessage(error: unknown, fallback = "Algo deu errado. Tente novamente.") {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === "23505") return "Já existe um contato com este telefone neste workspace.";
  if (e?.code === "42501") return "Você não tem permissão para esta ação.";
  if (e?.message && /registre um novo opt-in|mesmo workspace|lote/.test(e.message))
    return e.message;
  return fallback;
}
