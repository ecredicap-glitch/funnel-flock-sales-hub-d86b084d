import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { saveGateway, testGateway } from "@/lib/whatsapp.functions";
import { gatewayQuery } from "@/lib/whatsapp/queries";
import { Building2, KeyRound, Loader2, UserRound, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { profileQuery, ROLE_LABEL, useWorkspace, type MemberRole } from "@/lib/workspace";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/** Only the platform owner sees the server settings; customers use it transparently. */
const PLATFORM_WS = "0120a8da-c574-448a-93fa-3413feaaf316";

type SettingsTab = "workspace" | "perfil" | "equipe" | "gateway";
const SETTINGS_TABS: SettingsTab[] = ["workspace", "perfil", "equipe", "gateway"];

export const Route = createFileRoute("/_authenticated/_app/configuracoes")({
  validateSearch: (s: Record<string, unknown>): { aba?: SettingsTab } =>
    SETTINGS_TABS.includes(s["aba"] as SettingsTab) ? { aba: s["aba"] as SettingsTab } : {},
  head: () => ({
    meta: [
      { title: "Configurações — ZapPilot" },
      { name: "description", content: "Workspace, perfil, equipe e gateway de WhatsApp." },
      { property: "og:title", content: "Configurações — ZapPilot" },
      { property: "og:description", content: "Workspace, perfil, equipe e gateway de WhatsApp." },
    ],
  }),
  component: SettingsPage,
});

const teamQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["team", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, role, user_id, created_at, profile:profiles(full_name, email, avatar_url)")
        .eq("workspace_id", workspaceId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

function SettingsPage() {
  const { aba } = Route.useSearch();
  const { current } = useWorkspace();
  const navigate = Route.useNavigate();
  return (
    <>
      <PageHeader
        eyebrow="Conta"
        title="Configurações"
        description="Workspace, perfil e equipe."
      />
      <Tabs
        value={aba ?? "workspace"}
        onValueChange={(v) => navigate({ search: { aba: v as SettingsTab }, replace: true })}
        className="animate-fade-up"
      >
        <TabsList className="h-auto flex-wrap rounded-2xl p-1">
          <TabsTrigger value="workspace" className="rounded-xl">
            <Building2 className="mr-1.5 size-4" />
            Workspace
          </TabsTrigger>
          <TabsTrigger value="perfil" className="rounded-xl">
            <UserRound className="mr-1.5 size-4" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="equipe" className="rounded-xl">
            <Users className="mr-1.5 size-4" />
            Equipe
          </TabsTrigger>
          {current?.id === PLATFORM_WS && (
          <TabsTrigger value="gateway" className="rounded-xl">
            <KeyRound className="mr-1.5 size-4" />
            Gateway
          </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="workspace">
          <WorkspaceTab />
        </TabsContent>
        <TabsContent value="perfil">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="equipe">
          <TeamTab />
        </TabsContent>
        {current?.id === PLATFORM_WS && (
        <TabsContent value="gateway">
          <GatewayTab />
        </TabsContent>
        )}
      </Tabs>
    </>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="glass mt-3 max-w-3xl rounded-3xl p-6">{children}</section>;
}

function WorkspaceTab() {
  const { current, isAdmin } = useWorkspace();
  const queryClient = useQueryClient();
  const [name, setName] = useState(current?.workspace.name ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setName(current?.workspace.name ?? ""), [current?.workspace.name]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!current || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("workspaces")
      .update({ name: name.trim() })
      .eq("id", current.workspace.id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["memberships"] });
    toast.success("Workspace atualizado.");
  }

  return (
    <Panel>
      <form onSubmit={save} className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ws-name">Nome do workspace</Label>
          <Input
            id="ws-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isAdmin}
            maxLength={80}
            className="h-11 rounded-xl"
          />
          {!isAdmin && (
            <p className="text-xs text-muted-foreground">
              Apenas administradores podem alterar o nome.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Fuso horário</Label>
          <Input
            value={current?.workspace.timezone ?? ""}
            disabled
            className="h-11 rounded-xl font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Usado na janela de envio e nos relatórios.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Seu papel</Label>
          <Input
            value={current ? ROLE_LABEL[current.role] : ""}
            disabled
            className="h-11 rounded-xl"
          />
        </div>
        {isAdmin && (
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} Salvar alterações
            </Button>
          </div>
        )}
      </form>
    </Panel>
  );
}

function ProfileTab() {
  const { userId } = useWorkspace();
  const queryClient = useQueryClient();
  const { data: profile } = useQuery(profileQuery(userId));
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setName(profile?.full_name ?? ""), [profile?.full_name]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name.trim() || null })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    toast.success("Perfil atualizado.");
  }

  return (
    <Panel>
      <form onSubmit={save} className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="full-name">Nome</Label>
          <Input
            id="full-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input value={profile?.email ?? ""} disabled className="h-11 rounded-xl" />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} Salvar perfil
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function TeamTab() {
  const { current, isAdmin, userId } = useWorkspace();
  const queryClient = useQueryClient();
  const { data: team = [], isLoading } = useQuery({
    ...teamQuery(current?.workspace.id ?? ""),
    enabled: !!current,
  });

  async function changeRole(memberId: string, role: MemberRole) {
    const { error } = await supabase.from("members").update({ role }).eq("id", memberId);
    if (error) {
      toast.error(
        error.message.includes("administrador")
          ? "O workspace precisa de pelo menos um Admin."
          : "Não foi possível alterar o papel.",
      );
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["team"] });
    await queryClient.invalidateQueries({ queryKey: ["memberships"] });
    toast.success("Papel atualizado.");
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Equipe</h2>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Admin</strong> gerencia equipe, gateway e
            configurações. <strong className="text-foreground">Operador</strong> atende conversas e
            opera campanhas.
          </p>
        </div>
        <Button variant="outline" disabled title="Convites chegam na etapa de equipe e auditoria">
          Convidar membro
        </Button>
      </div>
      <ul className="mt-5 divide-y">
        {isLoading && <li className="py-4 text-sm text-muted-foreground">Carregando…</li>}
        {team.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-3">
            <Avatar className="size-9 border">
              <AvatarImage src={m.profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-electric text-xs font-bold text-electric-foreground">
                {(m.profile?.full_name ?? "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {m.profile?.full_name ?? "Sem nome"}
                {m.user_id === userId && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(você)</span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">{m.profile?.email}</p>
            </div>
            {isAdmin ? (
              <Select value={m.role} onValueChange={(v) => changeRole(m.id, v as MemberRole)}>
                <SelectTrigger className="w-32 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operator">Operador</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                {ROLE_LABEL[m.role]}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function GatewayTab() {
  const { current, isAdmin } = useWorkspace();
  const wsId = current?.workspace.id ?? "";
  const queryClient = useQueryClient();
  const save = useServerFn(saveGateway);
  const test = useServerFn(testGateway);
  const { data: gateway, isLoading } = useQuery({ ...gatewayQuery(wsId), enabled: !!wsId });
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => setBaseUrl(gateway?.base_url ?? ""), [gateway?.base_url]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!wsId) return;
    setSaving(true);
    try {
      const res = await save({
        data: {
          workspaceId: wsId,
          baseUrl: baseUrl.trim(),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setApiKey("");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-gateway", wsId] });
      toast.success(`Gateway conectado${res.version ? ` (Evolution v${res.version})` : ""}.`);
    } catch {
      toast.error("Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    try {
      const res = await test({ data: { workspaceId: wsId } });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-gateway", wsId] });
      if (res.ok) toast.success("Gateway respondendo normalmente.");
      else toast.error(res.error);
    } finally {
      setTesting(false);
    }
  }

  if (isLoading)
    return (
      <Panel>
        <Loader2 className="size-5 animate-spin" />
      </Panel>
    );

  return (
    <Panel>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Gateway Evolution API</h2>
          <p className="text-sm text-muted-foreground">
            A chave fica guardada criptografada no servidor — nunca no navegador.
          </p>
        </div>
        {gateway && (
          <span
            className={
              "rounded-full px-2.5 py-1 text-xs font-semibold " +
              (gateway.status === "ok"
                ? "bg-success/15 text-success"
                : gateway.status === "error"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-muted text-muted-foreground")
            }
          >
            {gateway.status === "ok"
              ? "Conectado"
              : gateway.status === "error"
                ? "Com erro"
                : "Não verificado"}
            {gateway.provider_version ? ` · v${gateway.provider_version}` : ""}
          </span>
        )}
      </div>
      <form onSubmit={submit} className="grid gap-5">
        <div className="space-y-1.5">
          <Label htmlFor="gw-url">URL base</Label>
          <Input
            id="gw-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://evolution.suaempresa.com.br"
            disabled={!isAdmin}
            required
            className="h-11 rounded-xl font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Endereço público do seu servidor Evolution (com domínio, não IP).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gw-key">Chave de API global</Label>
          <Input
            id="gw-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              gateway?.api_key_hint
                ? `Guardada (${gateway.api_key_hint}) — deixe em branco para manter`
                : "AUTHENTICATION_API_KEY do servidor"
            }
            disabled={!isAdmin}
            required={!gateway}
            className="h-11 rounded-xl font-mono"
          />
          <p className="text-xs text-muted-foreground">
            É o valor de AUTHENTICATION_API_KEY configurado no seu servidor Evolution.
          </p>
        </div>
        {gateway?.status === "error" && gateway.last_error && (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {gateway.last_error}
          </p>
        )}
        {gateway?.last_checked_at && (
          <p className="text-xs text-muted-foreground">
            Última verificação: {new Date(gateway.last_checked_at).toLocaleString("pt-BR")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Button type="submit" disabled={saving || !baseUrl.trim()}>
              {saving && <Loader2 className="animate-spin" />}{" "}
              {gateway ? "Salvar e testar" : "Conectar gateway"}
            </Button>
          )}
          {gateway && (
            <Button type="button" variant="glass" onClick={runTest} disabled={testing}>
              {testing && <Loader2 className="animate-spin" />} Testar conexão
            </Button>
          )}
        </div>
        {!isAdmin && (
          <p className="text-xs text-muted-foreground">
            Apenas administradores podem alterar o gateway.
          </p>
        )}
      </form>
    </Panel>
  );
}
