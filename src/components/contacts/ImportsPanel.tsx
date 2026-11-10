import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { importsQuery } from "@/lib/contacts";
import { useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/app/EmptyState";
import { fmtDate } from "./shared";

const MODE_LABEL: Record<string, string> = {
  all: "Todos com opt-in",
  column: "Coluna da planilha",
  none: "Sem opt-in",
};
const STATUS: Record<string, { label: string; cls: string }> = {
  processing: { label: "Em andamento", cls: "bg-electric/15 text-electric" },
  done: { label: "Concluída", cls: "bg-success/15 text-success" },
  failed: { label: "Interrompida", cls: "bg-destructive/15 text-destructive" },
};

export function ImportsPanel() {
  const { current } = useWorkspace();
  const wsId = current?.workspace.id ?? "";
  const { data = [], isLoading } = useQuery({ ...importsQuery(wsId), enabled: !!wsId });

  if (!isLoading && data.length === 0) {
    return (
      <section className="glass rounded-3xl">
        <EmptyState
          icon={History}
          title="Nenhuma importação ainda"
          description="Cada planilha importada fica registrada aqui com a origem do consentimento — útil para comprovar o opt-in (LGPD)."
        />
      </section>
    );
  }

  return (
    <section className="glass overflow-x-auto rounded-3xl p-4 sm:p-5">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr className="border-b">
            <th className="px-2 py-2">Data</th>
            <th className="px-2 py-2">Arquivo</th>
            <th className="px-2 py-2">Consentimento</th>
            <th className="px-2 py-2">Lista</th>
            <th className="px-2 py-2 text-right">Novos</th>
            <th className="px-2 py-2 text-right">Atualiz.</th>
            <th className="px-2 py-2 text-right">Inválidos</th>
            <th className="px-2 py-2 text-right">Duplic.</th>
            <th className="px-2 py-2">Situação</th>
          </tr>
        </thead>
        <tbody>
          {data.map((i) => (
            <tr key={i.id} className="border-b last:border-0">
              <td className="whitespace-nowrap px-2 py-2.5 tabular">
                {fmtDate(i.created_at, true)}
              </td>
              <td className="max-w-[12rem] truncate px-2 py-2.5 font-medium">{i.file_name}</td>
              <td className="px-2 py-2.5">
                <span className="block">{MODE_LABEL[i.opt_in_mode] ?? i.opt_in_mode}</span>
                {i.opt_in_source && (
                  <span className="block text-xs text-muted-foreground">{i.opt_in_source}</span>
                )}
              </td>
              <td className="px-2 py-2.5 text-muted-foreground">{i.list?.name ?? "—"}</td>
              <td className="px-2 py-2.5 text-right tabular">
                {i.inserted.toLocaleString("pt-BR")}
              </td>
              <td className="px-2 py-2.5 text-right tabular">
                {i.updated.toLocaleString("pt-BR")}
              </td>
              <td className="px-2 py-2.5 text-right tabular">
                {i.invalid.toLocaleString("pt-BR")}
              </td>
              <td className="px-2 py-2.5 text-right tabular">
                {i.duplicates.toLocaleString("pt-BR")}
              </td>
              <td className="px-2 py-2.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    STATUS[i.status]?.cls,
                  )}
                >
                  {STATUS[i.status]?.label ?? i.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
