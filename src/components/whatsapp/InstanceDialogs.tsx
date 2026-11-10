import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { createInstance } from "@/lib/whatsapp.functions";
import type { WhatsAppInstance } from "@/lib/whatsapp/queries";
import { useWorkspace } from "@/lib/workspace";
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
import { Switch } from "@/components/ui/switch";

function Fields({
  name,
  setName,
  limit,
  setLimit,
  warmup,
  setWarmup,
}: {
  name: string;
  setName: (v: string) => void;
  limit: string;
  setLimit: (v: string) => void;
  warmup: boolean;
  setWarmup: (v: boolean) => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="wa-name">Nome do número *</Label>
        <Input
          id="wa-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Comercial 01"
          required
          className="h-11 rounded-xl"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wa-limit">Limite diário de envios</Label>
        <Input
          id="wa-limit"
          type="number"
          min={1}
          max={5000}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          className="h-11 rounded-xl tabular"
        />
        <p className="text-xs text-muted-foreground">
          Números novos: comece com 50–100 por dia e aumente aos poucos.
        </p>
      </div>
      <label className="flex items-start justify-between gap-4 rounded-2xl border p-3">
        <span>
          <span className="block text-sm font-semibold">Aquecimento gradual</span>
          <span className="block text-xs text-muted-foreground">
            Aumenta o volume diário aos poucos nos primeiros dias para reduzir o risco de bloqueio.
          </span>
        </span>
        <Switch checked={warmup} onCheckedChange={setWarmup} aria-label="Aquecimento gradual" />
      </label>
    </>
  );
}

export function CreateInstanceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { current } = useWorkspace();
  const qc = useQueryClient();
  const create = useServerFn(createInstance);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("100");
  const [warmup, setWarmup] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setLimit("100");
      setWarmup(true);
    }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!current || !name.trim()) return;
    const dailyLimit = Math.min(5000, Math.max(1, Number(limit) || 100));
    setSaving(true);
    try {
      const res = await create({
        data: { workspaceId: current.workspace.id, displayName: name.trim(), dailyLimit, warmup },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (!res.webhook)
        toast.message(
          "Atualizações automáticas ficam ativas quando o app é aberto pelo endereço publicado.",
        );
      await qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      onOpenChange(false);
      onCreated(res.id);
    } catch {
      toast.error("Não foi possível criar o número.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo número</DialogTitle>
          <DialogDescription>
            Depois de criar, leia o QR Code com o WhatsApp do celular. Prefira um número secundário.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Fields
            name={name}
            setName={setName}
            limit={limit}
            setLimit={setLimit}
            warmup={warmup}
            setWarmup={setWarmup}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="hero" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="animate-spin" />} Criar e conectar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditInstanceDialog({
  instance,
  onClose,
}: {
  instance: WhatsAppInstance | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [warmup, setWarmup] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (instance) {
      setName(instance.display_name);
      setLimit(String(instance.daily_limit));
      setWarmup(instance.warmup_enabled);
    }
  }, [instance]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!instance) return;
    setSaving(true);
    const { error } = await supabase
      .from("whatsapp_instances")
      .update({
        display_name: name.trim(),
        daily_limit: Math.min(5000, Math.max(1, Number(limit) || 1)),
        warmup_enabled: warmup,
      })
      .eq("id", instance.id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    toast.success("Número atualizado.");
    onClose();
  }

  return (
    <Dialog open={!!instance} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar número</DialogTitle>
          <DialogDescription>Nome, limite diário e aquecimento.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Fields
            name={name}
            setName={setName}
            limit={limit}
            setLimit={setLimit}
            warmup={warmup}
            setWarmup={setWarmup}
          />
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
