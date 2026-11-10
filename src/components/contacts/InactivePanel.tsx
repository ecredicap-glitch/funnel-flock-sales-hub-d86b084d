import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RotateCcw, ShieldOff } from "lucide-react";
import { contactsQuery, PAGE_SIZE, STATUS_LABEL, type ContactFilters } from "@/lib/contacts";
import { formatBrPhone } from "@/lib/phone";
import { useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { fmtDate } from "./shared";
import { StatusDialog, type StatusAction } from "./StatusDialog";

export function InactivePanel() {
  const { current } = useWorkspace();
  const wsId = current?.workspace.id ?? "";
  const [filters, setFilters] = useState<ContactFilters>({
    search: "",
    listId: null,
    tag: null,
    consent: "all",
    page: 0,
  });
  const [action, setAction] = useState<StatusAction>(null);
  const { data, isLoading } = useQuery({
    ...contactsQuery(wsId, filters, "inactive"),
    enabled: !!wsId,
  });
  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  if (!isLoading && count === 0) {
    return (
      <section className="glass rounded-3xl">
        <EmptyState
          icon={ShieldOff}
          title="Ninguém bloqueado ou descadastrado"
          description="Quando um contato pedir para sair ou for bloqueado, ele aparece aqui e deixa de receber mensagens automaticamente."
        />
      </section>
    );
  }

  return (
    <section className="glass rounded-3xl p-4 sm:p-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b">
              <th className="px-2 py-2">Contato</th>
              <th className="px-2 py-2">WhatsApp</th>
              <th className="px-2 py-2">Situação</th>
              <th className="px-2 py-2">Motivo</th>
              <th className="px-2 py-2">Desde</th>
              <th className="px-2 py-2">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-2 py-2.5 font-semibold">{c.name || "Sem nome"}</td>
                <td className="whitespace-nowrap px-2 py-2.5 font-mono text-xs">
                  {formatBrPhone(c.phone)}
                </td>
                <td className="px-2 py-2.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      c.status === "blocked"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-warning/15 text-warning",
                    )}
                  >
                    {STATUS_LABEL[c.status]}
                  </span>
                </td>
                <td className="max-w-[14rem] truncate px-2 py-2.5 text-muted-foreground">
                  {c.status_reason || "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 tabular">
                  {fmtDate(c.status_changed_at)}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <Button
                    size="sm"
                    variant="glass"
                    onClick={() =>
                      setAction({
                        ids: [c.id],
                        to: "active",
                        label: c.name ?? formatBrPhone(c.phone),
                        needsOptIn: c.status === "unsubscribed",
                      })
                    }
                  >
                    <RotateCcw /> Reativar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular">{count.toLocaleString("pt-BR")} contato(s)</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Página anterior"
            disabled={filters.page === 0}
            onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
          >
            <ChevronLeft />
          </Button>
          <span className="tabular">
            {filters.page + 1} / {pages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Próxima página"
            disabled={filters.page + 1 >= pages}
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <StatusDialog action={action} onClose={() => setAction(null)} />
    </section>
  );
}
