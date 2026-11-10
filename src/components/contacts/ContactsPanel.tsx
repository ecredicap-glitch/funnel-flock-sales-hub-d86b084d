import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  ListPlus,
  ListX,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  contactsQuery,
  listsQuery,
  PAGE_SIZE,
  tagsQuery,
  type ConsentFilter,
  type ContactFilters,
  type ContactRow,
} from "@/lib/contacts";
import { formatBrPhone } from "@/lib/phone";
import { useWorkspace } from "@/lib/workspace";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OptInBadge, TagChips, errorMessage, fmtDate, useRefreshContacts } from "./shared";
import { StatusDialog, type StatusAction } from "./StatusDialog";

export function ContactsPanel({
  listId,
  onListChange,
  onEdit,
  onNew,
  onImport,
}: {
  listId: string | null;
  onListChange: (id: string | null) => void;
  onEdit: (c: ContactRow) => void;
  onNew: () => void;
  onImport: () => void;
}) {
  const { current, isAdmin } = useWorkspace();
  const wsId = current?.workspace.id ?? "";
  const refresh = useRefreshContacts();
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<ContactFilters>({
    search: "",
    listId,
    tag: null,
    consent: "all",
    page: 0,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [statusAction, setStatusAction] = useState<StatusAction>(null);
  const [toDelete, setToDelete] = useState<string[] | null>(null);

  useEffect(() => setFilters((f) => ({ ...f, listId, page: 0 })), [listId]);
  useEffect(() => {
    const t = setTimeout(
      () =>
        setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput, page: 0 })),
      300,
    );
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => setSelected([]), [filters]);

  const { data, isLoading, isFetching } = useQuery({
    ...contactsQuery(wsId, filters),
    enabled: !!wsId,
  });
  const { data: lists = [] } = useQuery({ ...listsQuery(wsId), enabled: !!wsId });
  const { data: tags = [] } = useQuery({ ...tagsQuery(wsId), enabled: !!wsId });
  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const listName = new Map(lists.map((l) => [l.id, l.name]));
  const filtering = !!(
    filters.search ||
    filters.listId ||
    filters.tag ||
    filters.consent !== "all"
  );
  const allChecked = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  async function addToList(ids: string[], targetList: string) {
    const { error } = await supabase.from("contact_list_members").upsert(
      ids.map((contact_id) => ({ list_id: targetList, contact_id, workspace_id: wsId })),
      { onConflict: "list_id,contact_id", ignoreDuplicates: true },
    );
    if (error) {
      toast.error(errorMessage(error));
      return;
    }

    await refresh();
    toast.success(`${ids.length} contato(s) adicionados a “${listName.get(targetList)}”.`);
    setSelected([]);
  }

  async function removeFromList(ids: string[]) {
    if (!filters.listId) return;
    const { error } = await supabase
      .from("contact_list_members")
      .delete()
      .eq("list_id", filters.listId)
      .in("contact_id", ids);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }

    await refresh();
    toast.success("Removidos da lista.");
    setSelected([]);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const { error } = await supabase.from("contacts").delete().in("id", toDelete);
    setToDelete(null);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }

    await refresh();
    setSelected([]);
    toast.success("Contato(s) excluído(s).");
  }

  if (!isLoading && count === 0 && !filtering) {
    return (
      <section className="glass rounded-3xl">
        <EmptyState
          icon={Users}
          title="Sua base está vazia"
          description="Importe uma planilha CSV/XLSX ou cadastre um contato. Telefones são normalizados para 55 + DDD + número e contatos sem opt-in ficam fora das campanhas."
        >
          <Button variant="hero" onClick={onImport}>
            <Upload /> Importar planilha
          </Button>
          <Button variant="glass" onClick={onNew}>
            <UserPlus /> Novo contato
          </Button>
        </EmptyState>
      </section>
    );
  }

  const ListMenu = ({ ids }: { ids: string[] }) => (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">
        Adicionar à lista
      </DropdownMenuLabel>
      {lists.length === 0 && <DropdownMenuItem disabled>Nenhuma lista criada</DropdownMenuItem>}
      {lists.map((l) => (
        <DropdownMenuItem key={l.id} onClick={() => addToList(ids, l.id)}>
          <ListPlus /> {l.name}
        </DropdownMenuItem>
      ))}
    </>
  );

  return (
    <section className="glass rounded-3xl p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail"
            className="h-10 rounded-xl pl-9"
            aria-label="Buscar contatos"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 lg:flex">
          <Select
            value={filters.listId ?? "all"}
            onValueChange={(v) => onListChange(v === "all" ? null : v)}
          >
            <SelectTrigger className="h-10 rounded-xl lg:w-44" aria-label="Filtrar por lista">
              <SelectValue placeholder="Lista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as listas</SelectItem>
              {lists.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.tag ?? "all"}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, tag: v === "all" ? null : v, page: 0 }))
            }
          >
            <SelectTrigger className="h-10 rounded-xl lg:w-36" aria-label="Filtrar por tag">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.consent}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, consent: v as ConsentFilter, page: 0 }))
            }
          >
            <SelectTrigger
              className="h-10 rounded-xl lg:w-40"
              aria-label="Filtrar por consentimento"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo consentimento</SelectItem>
              <SelectItem value="eligible">Com opt-in</SelectItem>
              <SelectItem value="no_optin">Sem opt-in</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-primary/10 px-3 py-2 text-sm">
          <span className="font-semibold tabular">{selected.length} selecionado(s)</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="glass">
                <ListPlus /> Adicionar à lista
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <ListMenu ids={selected} />
            </DropdownMenuContent>
          </DropdownMenu>
          {filters.listId && (
            <Button size="sm" variant="glass" onClick={() => removeFromList(selected)}>
              <ListX /> Remover da lista
            </Button>
          )}
          <Button
            size="sm"
            variant="glass"
            onClick={() =>
              setStatusAction({
                ids: selected,
                to: "blocked",
                label: `${selected.length} contato(s)`,
              })
            }
          >
            <Ban /> Bloquear
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="glass"
              className="text-destructive"
              onClick={() => setToDelete(selected)}
            >
              <Trash2 /> Excluir
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Limpar
          </Button>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b">
              <th className="w-10 px-2 py-2">
                <Checkbox
                  aria-label="Selecionar todos"
                  checked={allChecked}
                  onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])}
                />
              </th>
              <th className="px-2 py-2">Contato</th>
              <th className="px-2 py-2">WhatsApp</th>
              <th className="px-2 py-2">Tags</th>
              <th className="px-2 py-2">Listas</th>
              <th className="px-2 py-2">Consentimento</th>
              <th className="w-10 px-2 py-2">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className={isFetching && !isLoading ? "opacity-60 transition-opacity" : ""}>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td colSpan={7} className="px-2 py-3">
                    <div className="h-5 animate-pulse rounded bg-muted" />
                  </td>
                </tr>
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-10 text-center text-muted-foreground">
                  Nenhum contato com estes filtros.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-accent/40">
                <td className="px-2 py-2.5">
                  <Checkbox
                    aria-label={`Selecionar ${c.name ?? c.phone}`}
                    checked={selected.includes(c.id)}
                    onCheckedChange={(v) =>
                      setSelected((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))
                    }
                  />
                </td>
                <td className="px-2 py-2.5">
                  <button type="button" className="text-left" onClick={() => onEdit(c)}>
                    <span className="block font-semibold hover:underline">
                      {c.name || "Sem nome"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {c.email || `desde ${fmtDate(c.created_at)}`}
                    </span>
                  </button>
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 font-mono text-xs tabular">
                  {formatBrPhone(c.phone)}
                </td>
                <td className="px-2 py-2.5">
                  <TagChips tags={c.tags} />
                </td>
                <td className="px-2 py-2.5 text-xs text-muted-foreground">
                  {c.lists.length
                    ? c.lists
                        .map((l) => listName.get(l.list_id))
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(", ") + (c.lists.length > 2 ? ` +${c.lists.length - 2}` : "")
                    : "—"}
                </td>
                <td className="px-2 py-2.5">
                  <OptInBadge optInAt={c.opt_in_at} source={c.opt_in_source} />
                </td>
                <td className="px-2 py-2.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Ações para ${c.name ?? c.phone}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(c)}>
                        <Pencil /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <ListMenu ids={[c.id]} />
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          setStatusAction({
                            ids: [c.id],
                            to: "blocked",
                            label: c.name ?? formatBrPhone(c.phone),
                          })
                        }
                      >
                        <Ban /> Bloquear
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setStatusAction({
                            ids: [c.id],
                            to: "unsubscribed",
                            label: c.name ?? formatBrPhone(c.phone),
                          })
                        }
                      >
                        <UserMinus /> Marcar descadastro
                      </DropdownMenuItem>
                      {isAdmin && (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setToDelete([c.id])}
                        >
                          <Trash2 /> Excluir
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
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

      <StatusDialog
        action={statusAction}
        onClose={() => {
          setStatusAction(null);
          setSelected([]);
        }}
      />
      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {toDelete?.length === 1 ? "contato" : `${toDelete?.length} contatos`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Remove os dados de forma definitiva (direito de exclusão da LGPD). Para apenas parar
              de enviar mensagens, prefira bloquear ou marcar descadastro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
