import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Hash, Loader2, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { syncInstance } from "@/lib/whatsapp.functions";
import { instancesQuery } from "@/lib/whatsapp/queries";
import { normalizeBrPhone, formatBrPhone } from "@/lib/phone";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const POLL_MS = 4000;

export function QrDialog({
  instanceId,
  onClose,
}: {
  instanceId: string | null;
  onClose: () => void;
}) {
  const { current } = useWorkspace();
  const wsId = current?.workspace.id ?? "";
  const qc = useQueryClient();
  const sync = useServerFn(syncInstance);
  const { data: instances = [] } = useQuery({ ...instancesQuery(wsId), enabled: !!wsId });
  const inst = instances.find((i) => i.id === instanceId) ?? null;
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [pairing, setPairing] = useState(false);
  const busy = useRef(false);

  async function tick(phoneNumber?: string) {
    if (!instanceId || busy.current) return;
    busy.current = true;
    try {
      const res = await sync({
        data: { instanceId, wantQr: true, ...(phoneNumber ? { phoneNumber } : {}) },
      });
      setError(res.ok ? null : res.error);
      await qc.invalidateQueries({ queryKey: ["whatsapp-instances", wsId] });
    } catch {
      setError("Não foi possível falar com o servidor.");
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    if (!instanceId) return;
    setError(null);
    setPhone("");
    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  const connected = inst?.status === "connected";
  useEffect(() => {
    if (connected && instanceId) toast.success(`${inst?.display_name} conectado!`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  async function requestPairing() {
    const n = normalizeBrPhone(phone);
    if (!n) {
      toast.error("Informe o número com DDD.");
      return;
    }
    setPairing(true);
    await tick(n);
    setPairing(false);
  }

  return (
    <Dialog open={!!instanceId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar {inst?.display_name ?? "número"}</DialogTitle>
          <DialogDescription>
            No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho.
          </DialogDescription>
        </DialogHeader>

        {connected ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle2 className="size-12 text-success" />
            <p className="text-lg font-bold">Número conectado</p>
            {inst?.phone_number && (
              <p className="font-mono text-sm text-muted-foreground">
                {formatBrPhone(inst.phone_number)}
              </p>
            )}
          </div>
        ) : (
          <Tabs defaultValue="qr">
            <TabsList className="grid w-full grid-cols-2 rounded-2xl">
              <TabsTrigger value="qr" className="rounded-xl">
                <QrCode className="mr-1.5 size-4" />
                QR Code
              </TabsTrigger>
              <TabsTrigger value="code" className="rounded-xl">
                <Hash className="mr-1.5 size-4" />
                Código
              </TabsTrigger>
            </TabsList>
            <TabsContent value="qr" className="flex flex-col items-center gap-3 pt-3">
              <div className="grid size-64 place-items-center rounded-3xl bg-white p-3">
                {inst?.qr_code ? (
                  <img
                    src={inst.qr_code}
                    alt="QR Code para conectar o WhatsApp"
                    className="size-full"
                  />
                ) : (
                  <Loader2 className="size-8 animate-spin text-primary-ink" />
                )}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <RefreshCw className="size-3" /> O código se renova sozinho. Mantenha esta janela
                aberta.
              </p>
            </TabsContent>
            <TabsContent value="code" className="space-y-3 pt-3">
              <p className="text-sm text-muted-foreground">
                Sem câmera? Gere um código e digite no celular em “Conectar com número de telefone”.
              </p>
              <div className="flex gap-2">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(91) 98765-4321"
                  inputMode="tel"
                  className="h-11 rounded-xl font-mono"
                  aria-label="Número do WhatsApp"
                />
                <Button onClick={requestPairing} disabled={pairing}>
                  {pairing && <Loader2 className="animate-spin" />} Gerar
                </Button>
              </div>
              {inst?.pairing_code && (
                <p className="rounded-2xl bg-muted p-4 text-center font-mono text-2xl font-bold tracking-[0.3em]">
                  {inst.pairing_code}
                </p>
              )}
            </TabsContent>
          </Tabs>
        )}

        {error && !connected && (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}
        <DialogFooter>
          <Button variant={connected ? "default" : "ghost"} onClick={onClose}>
            {connected ? "Concluir" : "Fechar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
