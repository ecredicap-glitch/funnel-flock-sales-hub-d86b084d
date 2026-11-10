import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { listsQuery, type ContactRow } from "@/lib/contacts";
import { formatBrPhone, normalizeBrPhone } from "@/lib/phone";
import { useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage, fmtDate, parseTagInput, useRefreshContacts } from "./shared";

export function ContactFormDialog({
  open,
  onOpenChange,
  contact,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: ContactRow | null;
}) {
  const { current } = useWorkspace();
  const wsId = current?.workspace.id ?? "";
  const refresh = useRefreshContacts();
  const { data: lists = [] } = useQuery({ ...listsQuery(wsId), enabled: open && !!wsId });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tags, setTags] = useState("");
  const [listIds, setListIds] = useState<string[]>([]);
  const [optIn, setOptIn] = useState(false);
  const [optInSource, setOptInSource] = useState("");
  const [custom, setCustom] = useState<{ key: string; value: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(contact?.name ?? "");
    setPhone(contact ? formatBrPhone(contact.phone) : "");
    setEmail(contact?.email ?? "");
    setTags(contact?.tags.join(", ") ?? "");
    setListIds(contact?.lists.map((l) => l.list_id) ?? []);
    setOptIn(false);
    setOptInSource("");
    setCustom(
      Object.entries(contact?.custom_fields ?? {}).map(([key, value]) => ({
        key,
        value: String(value),
      })),
    );
  }, [open, contact]);

  const normalized = normalizeBrPhone(phone);
  const hasOptIn = !!contact?.opt_in_at;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (!normalized) {
      toast.error("Telefone inválido. Use DDD + número, ex.: (91) 98765-4321.");
      return;
    }

    if (optIn && !optInSource.trim()) {
      toast.error("Informe a origem do consentimento.");
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("E-mail inválido.");
      return;
    }

    setSaving(true);
    const customFields = Object.fromEntries(
      custom
        .filter((c) => c.key.trim())
        .map((c) => [c.key.trim().slice(0, 40), c.value.trim().slice(0, 500)]),
    );
    const payload = {
      name: name.trim() || null,
      phone: normalized,
      email: email.trim().toLowerCase() || null,
      tags: parseTagInput(tags),
      custom_fields: customFields,
      ...(optIn && !hasOptIn
        ? { opt_in_at: new Date().toISOString(), opt_in_source: optInSource.trim() }
        : {}),
    };

    let contactId = contact?.id;
    if (contact) {
      const { error } = await supabase.from("contacts").update(payload).eq("id", contact.id);
      if (error) {
        setSaving(false);
        {
          toast.error(errorMessage(error));
          return;
        }
      }
    } else {
      const { data, error } = await supabase
        .from("contacts")
        .insert({ ...payload, workspace_id: current.workspace.id })
        .select("id")
        .single();
      if (error) {
        setSaving(false);
        {
          toast.error(errorMessage(error));
          return;
        }
      }
      contactId = data.id;
    }

    const before = new Set(contact?.lists.map((l) => l.list_id) ?? []);
    const toAdd = listIds.filter((id) => !before.has(id));
    const toRemove = [...before].filter((id) => !listIds.includes(id));
    if (contactId && toAdd.length) {
      const { error } = await supabase
        .from("contact_list_members")
        .insert(
          toAdd.map((list_id) => ({
            list_id,
            contact_id: contactId!,
            workspace_id: current.workspace.id,
          })),
        );
      if (error)
        toast.error(
          errorMessage(error, "Contato salvo, mas não foi possível atualizar as listas."),
        );
    }
    if (contactId && toRemove.length) {
      await supabase
        .from("contact_list_members")
        .delete()
        .eq("contact_id", contactId)
        .in("list_id", toRemove);
    }

    setSaving(false);
    await refresh();
    toast.success(contact ? "Contato atualizado." : "Contato criado.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{contact ? "Editar contato" : "Novo contato"}</DialogTitle>
          <DialogDescription>Telefones são salvos no formato 55 + DDD + número.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-name">Nome</Label>
              <Input
                id="c-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">WhatsApp *</Label>
              <Input
                id="c-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(91) 98765-4321"
                inputMode="tel"
                required
                className="h-11 rounded-xl font-mono"
              />
              <p className="text-xs text-muted-foreground tabular">
                {phone
                  ? normalized
                    ? `Será salvo como ${normalized}`
                    : "Número inválido"
                  : "Com DDD"}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">E-mail</Label>
              <Input
                id="c-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-tags">Tags</Label>
              <Input
                id="c-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="cliente, vip, belém"
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          {lists.length > 0 && (
            <div className="space-y-2">
              <Label>Listas</Label>
              <div className="grid max-h-36 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">
                {lists.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={listIds.includes(l.id)}
                      onCheckedChange={(v) =>
                        setListIds((ids) => (v ? [...ids, l.id] : ids.filter((i) => i !== l.id)))
                      }
                    />
                    <span className="truncate">{l.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Campos personalizados</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCustom((c) => [...c, { key: "", value: "" }])}
              >
                <Plus /> Campo
              </Button>
            </div>
            {custom.map((c, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  aria-label="Nome do campo"
                  placeholder="cidade"
                  value={c.key}
                  onChange={(e) =>
                    setCustom((all) =>
                      all.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)),
                    )
                  }
                  className="h-10 rounded-xl font-mono text-xs"
                />
                <Input
                  aria-label="Valor"
                  placeholder="Belém"
                  value={c.value}
                  onChange={(e) =>
                    setCustom((all) =>
                      all.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                    )
                  }
                  className="h-10 rounded-xl"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remover campo"
                  onClick={() => setCustom((all) => all.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            {hasOptIn ? (
              <p className="text-sm">
                <span className="font-semibold">Opt-in registrado</span> em{" "}
                {fmtDate(contact?.opt_in_at)}
                {contact?.opt_in_source ? ` · ${contact.opt_in_source}` : ""}.
              </p>
            ) : (
              <div className="space-y-3">
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox
                    checked={optIn}
                    onCheckedChange={(v) => setOptIn(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-semibold">Este contato autorizou receber mensagens</span>
                    <span className="block text-xs text-muted-foreground">
                      Sem opt-in o contato fica fora das campanhas.
                    </span>
                  </span>
                </label>
                {optIn && (
                  <Input
                    value={optInSource}
                    onChange={(e) => setOptInSource(e.target.value)}
                    maxLength={200}
                    placeholder="Origem: formulário do site, balcão, evento…"
                    className="h-10 rounded-xl"
                  />
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}{" "}
              {contact ? "Salvar" : "Criar contato"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
