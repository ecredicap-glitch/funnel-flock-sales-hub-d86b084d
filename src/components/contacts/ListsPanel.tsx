import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ListChecks,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { listsQuery, type ListWithStats } from "@/lib/contacts";
import { useWorkspace } from "@/lib/workspace";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { errorMessage, useRefreshContacts } from "./shared";

export function ListsPanel({ onOpenList }: { onOpenList: (id: string) => void }) {
  const { current } = useWorkspace();
  const wsId = current?.workspace.id ?? "";
  const refresh = useRefreshContacts();
  const { data: lists = [], isLoading } = useQuery({ ...listsQuery(wsId), enabled: !!wsId });
  const [editing, setEditing] = useState<ListWithStats | "new" | null>(null);
  const [toDelete, setToDelete] = useState<ListWithStats | null>(null);

  async function remove() {
    if (!toDelete) return;
    const { error } = await supabase.from("contact_lists").delete().eq("id", toDelete.id);
    setToDelete(null);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }

    await refresh();
    toast.success("Lista excluída. Os contatos continuam na base.");
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus /> Nova lista
        </Button>
      </div>
      {!isLoading && lists.length === 0 ? (
        <section className="glass rounded-3xl">
          <EmptyState
            icon={ListChecks}
            title="Nenhuma lista ainda"
            description="Listas agrupam contatos para campanhas e cadências. Crie uma aqui ou durante a importação."
          >
            <Button variant="hero" onClick={() => setEditing("new")}>
              <Plus /> Criar lista
            </Button>
          </EmptyState>
        </section>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lists.map((l) => (
            <article key={l.id} className="glass flex flex-col rounded-3xl p-5 animate-fade-up">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => onOpenList(l.id)}
                >
                  <h3 className="truncate font-bold hover:underline">{l.name}</h3>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {l.description || "Sem descrição"}
                  </p>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Ações da lista ${l.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(l)}>
                      <Pencil /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => setToDelete(l)}>
                      <Trash2 /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-4 flex gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <Users className="size-4 text-muted-foreground" />
                  <b className="tabular">{l.total.toLocaleString("pt-BR")}</b> contatos
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-success" />
                  <b className="tabular">{l.eligible.toLocaleString("pt-BR")}</b> aptos
                </span>
              </div>
              <Button
                variant="glass"
                size="sm"
                className="mt-4 self-start"
                onClick={() => onOpenList(l.id)}
              >
                Ver contatos
              </Button>
            </article>
          ))}
        </div>
      )}

      <ListDialog
        value={editing}
        onClose={() => setEditing(null)}
        workspaceId={wsId}
        onSaved={refresh}
      />
      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a lista “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Os contatos não são apagados, apenas deixam de fazer parte desta lista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ListDialog({
  value,
  onClose,
  workspaceId,
  onSaved,
}: {
  value: ListWithStats | "new" | null;
  onClose: () => void;
  workspaceId: string;
  onSaved: () => Promise<unknown>;
}) {
  const existing = value && value !== "new" ? value : null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastValue, setLastValue] = useState<typeof value>(null);
  if (value !== lastValue) {
    setLastValue(value);
    setName(existing?.name ?? "");
    setDescription(existing?.description ?? "");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const payload = { name: name.trim().slice(0, 80), description: description.trim() || null };
    const { error } = existing
      ? await supabase.from("contact_lists").update(payload).eq("id", existing.id)
      : await supabase.from("contact_lists").insert({ ...payload, workspace_id: workspaceId });
    setSaving(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }

    await onSaved();
    toast.success(existing ? "Lista atualizada." : "Lista criada.");
    onClose();
  }

  return (
    <Dialog open={!!value} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Editar lista" : "Nova lista"}</DialogTitle>
          <DialogDescription>Use listas para segmentar campanhas e cadências.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="l-name">Nome *</Label>
            <Input
              id="l-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-desc">Descrição</Label>
            <Textarea
              id="l-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              className="rounded-xl"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
