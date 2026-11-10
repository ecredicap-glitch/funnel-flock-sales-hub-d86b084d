import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ContactStatus } from "@/lib/contacts";
import { Button } from "@/components/ui/button";
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
import { errorMessage, useRefreshContacts } from "./shared";

export type StatusAction = {
  ids: string[];
  to: ContactStatus;
  label: string;
  needsOptIn?: boolean;
} | null;

const COPY: Record<ContactStatus, { title: string; desc: string; reason: string }> = {
  blocked: {
    title: "Bloquear contato",
    desc: "Contatos bloqueados não recebem campanhas nem cadências.",
    reason: "Motivo (opcional)",
  },
  unsubscribed: {
    title: "Marcar como descadastrado",
    desc: "Use quando o contato pedir para não receber mais mensagens. Para reativar será preciso um novo opt-in.",
    reason: "Como o pedido chegou (opcional)",
  },
  active: {
    title: "Reativar contato",
    desc: "O contato volta para a base ativa.",
    reason: "",
  },
};

export function StatusDialog({ action, onClose }: { action: StatusAction; onClose: () => void }) {
  const refresh = useRefreshContacts();
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setReason("");
    setSource("");
  }, [action]);
  if (!action) return null;
  const copy = COPY[action.to];

  async function confirm() {
    if (!action) return;
    if (action.needsOptIn && !source.trim()) {
      toast.error("Informe a origem do novo consentimento.");
      return;
    }

    setSaving(true);
    const patch =
      action.to === "active"
        ? {
            status: "active" as const,
            ...(action.needsOptIn
              ? { opt_in_at: new Date().toISOString(), opt_in_source: source.trim() }
              : {}),
          }
        : { status: action.to, status_reason: reason.trim() || null };
    const { error } = await supabase.from("contacts").update(patch).in("id", action.ids);
    setSaving(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }

    await refresh();
    toast.success(
      action.ids.length > 1 ? `${action.ids.length} contatos atualizados.` : "Contato atualizado.",
    );
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {copy.title}
            {action.ids.length > 1 ? ` (${action.ids.length})` : ""}
          </DialogTitle>
          <DialogDescription>
            {action.label} · {copy.desc}
          </DialogDescription>
        </DialogHeader>
        {action.to !== "active" && (
          <div className="space-y-1.5">
            <Label htmlFor="st-reason">{copy.reason}</Label>
            <Input
              id="st-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              className="h-11 rounded-xl"
            />
          </div>
        )}
        {action.needsOptIn && (
          <div className="space-y-1.5">
            <Label htmlFor="st-source">Origem do novo opt-in *</Label>
            <Input
              id="st-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={200}
              placeholder="Ex.: pediu para voltar pelo WhatsApp em 10/11"
              className="h-11 rounded-xl"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={action.to === "active" ? "default" : "destructive"}
            onClick={confirm}
            disabled={saving}
          >
            {saving && <Loader2 className="animate-spin" />} Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
