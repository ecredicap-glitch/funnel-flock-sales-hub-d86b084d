import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Flame,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  RotateCw,
  Smartphone,
  Trash2,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";

import { instanceAction, syncInstance } from "@/lib/whatsapp.functions";
import {
  gatewayQuery,
  instancesQuery,
  STATUS_META,
  useInstancesRealtime,
  type WhatsAppInstance,
} from "@/lib/whatsapp/queries";
import { formatBrPhone } from "@/lib/phone";
import { useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { QrDialog } from "@/components/whatsapp/QrDialog";
import { CreateInstanceDialog, EditInstanceDialog } from "@/components/whatsapp/InstanceDialogs";

export const Route = createFileRoute("/_authenticated/_app/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp — ZapPilot" },
      {
        name: "description",
        content: "Conecte e monitore seus números, cada um com limite diário e saúde próprios.",
      },
      { property: "og:title", content: "WhatsApp — ZapPilot" },
      {
        property: "og:description",
        content: "Conecte e monitore seus números, cada um com limite diário e saúde próprios.",
      },
    ],
  }),
  component: WhatsappPage,
});

type Confirm = { inst: WhatsAppInstance; action: "logout" | "delete" } | null;

function WhatsappPage() {
  const { current, isAdmin } = useWorkspace();
  const wsId = current?.workspace.id ?? "";
  const qc = useQueryClient();
  const act = useServerFn(instanceAction);
  const sync = useServerFn(syncInstance);
  const { data: gateway, isLoading: gwLoading } = useQuery({
    ...gatewayQuery(wsId),
    enabled: !!wsId,
  });
  const { data: instances = [], isLoading } = useQuery({
    ...instancesQuery(wsId),
    enabled: !!wsId,
  });
  useInstancesRealtime(wsId);

  const [creating, setCreating] = useState(false);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<WhatsAppInstance | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["whatsapp-instances", wsId] });

  async function run(
    inst: WhatsAppInstance,
    action: "logout" | "restart" | "delete" | "webhook",
    ok: string,
  ) {
    setBusy(inst.id);
    try {
      const res = await act({ data: { instanceId: inst.id, action } });
      if (!res.ok) toast.error(res.error);
      else toast.success(ok);
      await refresh();
    } catch {
      toast.error("Não foi possível concluir a ação.");
    } finally {
      setBusy(null);
    }
  }

  async function check(inst: WhatsAppInstance) {
    setBusy(inst.id);
    try {
      const res = await sync({ data: { instanceId: inst.id, wantQr: false } });
      if (!res.ok) toast.error(res.error);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const connected = instances.filter((i) => i.status === "connected").length;

  return (
    <>
      <PageHeader
        eyebrow="Conexão"
        title="WhatsApp"
        description={
          instances.length
            ? `${connected} de ${instances.length} número(s) conectado(s). Cada número tem limite diário e saúde próprios.`
            : "Conecte e monitore seus números, cada um com limite diário e saúde próprios."
        }
        actions={
          isAdmin ? (
            <Button variant="hero" onClick={() => setCreating(true)}>
              <Plus /> Novo número
            </Button>
          ) : undefined
        }
      />

      {false && !gwLoading && !gateway ? (
        <section className="glass rounded-3xl animate-fade-up">
          <EmptyState
            icon={KeyRound}
            title="Configure o gateway primeiro"
            description={
              isAdmin
                ? "Informe a URL da sua Evolution API e a chave de acesso. A chave fica guardada só no servidor."
                : "Peça a um administrador do workspace para configurar o gateway da Evolution API."
            }
          >
            {isAdmin && (
              <Button asChild variant="hero">
                <Link to="/configuracoes" search={{ aba: "gateway" }}>
                  <KeyRound /> Configurar gateway
                </Link>
              </Button>
            )}
          </EmptyState>
        </section>
      ) : !isLoading && instances.length === 0 ? (
        <section className="glass rounded-3xl animate-fade-up">
          <EmptyState
            icon={Smartphone}
            title="Nenhum número conectado"
            description="Crie uma instância, leia o QR Code com o WhatsApp do celular e acompanhe o status em tempo real."
          >
            {isAdmin && (
              <Button variant="hero" onClick={() => setCreating(true)}>
                <Plus /> Conectar primeiro número
              </Button>
            )}
          </EmptyState>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="grid gap-3 sm:grid-cols-2">
            {instances.map((inst) => {
              const meta = STATUS_META[inst.status] ?? STATUS_META["disconnected"]!;
              return (
                <article
                  key={inst.id}
                  className="glass flex flex-col rounded-3xl p-5 animate-fade-up"
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      {inst.profile_pic_url ? (
                        <img
                          src={inst.profile_pic_url}
                          alt=""
                          className="size-12 rounded-2xl object-cover"
                        />
                      ) : (
                        <span className="grid size-12 place-items-center rounded-2xl bg-muted">
                          <Smartphone className="size-5 text-muted-foreground" />
                        </span>
                      )}
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card",
                          meta.dot,
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-bold">{inst.display_name}</h3>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {inst.phone_number
                          ? formatBrPhone(inst.phone_number)
                          : "Número ainda não vinculado"}
                      </p>
                      {inst.profile_name && (
                        <p className="truncate text-xs text-muted-foreground">
                          {inst.profile_name}
                        </p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Ações de ${inst.display_name}`}
                          disabled={busy === inst.id}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => check(inst)}>
                          <RefreshCw /> Atualizar status
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => run(inst, "restart", "Reinício solicitado.")}
                        >
                          <RotateCw /> Reiniciar conexão
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuItem onClick={() => setEditing(inst)}>
                              <Pencil /> Ajustar limite
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => run(inst, "webhook", "Webhook registrado.")}
                            >
                              <Webhook /> Registrar webhook
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {inst.status !== "disconnected" && (
                              <DropdownMenuItem
                                onClick={() => setConfirm({ inst, action: "logout" })}
                              >
                                <Power /> Desconectar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setConfirm({ inst, action: "delete" })}
                            >
                              <Trash2 /> Excluir
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn("rounded-full px-2 py-0.5 font-semibold", meta.pill)}>
                      {meta.label}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 tabular text-muted-foreground">
                      {inst.daily_limit}/dia
                    </span>
                    {inst.warmup_enabled && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-electric/15 px-2 py-0.5 font-medium text-electric">
                        <Flame className="size-3" /> Aquecimento
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {inst.status === "connected" && inst.connected_at
                      ? `Conectado ${formatDistanceToNow(new Date(inst.connected_at), { addSuffix: true, locale: ptBR })}`
                      : inst.disconnected_at
                        ? `Desconectado ${formatDistanceToNow(new Date(inst.disconnected_at), { addSuffix: true, locale: ptBR })}`
                        : "Aguardando primeira conexão"}
                  </p>
                  {inst.last_error && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-destructive/10 p-2 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {inst.last_error}
                    </p>
                  )}
                  {inst.status !== "connected" && (
                    <Button className="mt-4 self-start" size="sm" onClick={() => setQrFor(inst.id)}>
                      <QrCode /> Conectar com QR Code
                    </Button>
                  )}
                </article>
              );
            })}
          </div>

          <aside className="glass h-fit rounded-3xl p-5 text-sm animate-fade-up [animation-delay:80ms]">
            <h2 className="font-bold">Boas práticas anti-bloqueio</h2>
            <ul className="mt-3 space-y-2.5 text-muted-foreground">
              <li>Use um número secundário, nunca o principal da empresa.</li>
              <li>Deixe o aquecimento ligado nas primeiras duas semanas.</li>
              <li>Envie só para contatos com opt-in — descadastros derrubam a saúde do número.</li>
              <li>Mantenha o celular com internet; se cair, reconecte pelo QR Code.</li>
            </ul>
            {gateway && false && (
              <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                Gateway:{" "}
                <span className="font-mono">{gateway!.base_url.replace(/^https?:\/\//, "")}</span>
                {gateway!.provider_version ? ` · v${gateway!.provider_version}` : ""}
              </p>
            )}
          </aside>
        </div>
      )}

      <CreateInstanceDialog open={creating} onOpenChange={setCreating} onCreated={setQrFor} />
      <QrDialog instanceId={qrFor} onClose={() => setQrFor(null)} />
      <EditInstanceDialog instance={editing} onClose={() => setEditing(null)} />
      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "delete"
                ? `Excluir “${confirm.inst.display_name}”?`
                : `Desconectar “${confirm?.inst.display_name}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "delete"
                ? "A instância é removida do gateway e o número sai do ZapPilot. Para voltar, será preciso criar e ler o QR Code de novo."
                : "O aparelho é desconectado. Campanhas deste número param até você conectar de novo."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirm) return;
                void run(
                  confirm.inst,
                  confirm.action,
                  confirm.action === "delete" ? "Número excluído." : "Número desconectado.",
                );
                setConfirm(null);
              }}
            >
              {confirm?.action === "delete" ? "Excluir" : "Desconectar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
