import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History, ListChecks, ShieldOff, Upload, UserPlus, Users } from "lucide-react";

import { contactCountsQuery, type ContactRow } from "@/lib/contacts";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContactsPanel } from "@/components/contacts/ContactsPanel";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import { ImportDialog } from "@/components/contacts/ImportDialog";
import { ImportsPanel } from "@/components/contacts/ImportsPanel";
import { InactivePanel } from "@/components/contacts/InactivePanel";
import { ListsPanel } from "@/components/contacts/ListsPanel";

type Tab = "contatos" | "listas" | "bloqueados" | "importacoes";
const TABS: Tab[] = ["contatos", "listas", "bloqueados", "importacoes"];

export const Route = createFileRoute("/_authenticated/_app/contatos")({
  validateSearch: (s: Record<string, unknown>): { aba?: Tab; importar?: boolean } => ({
    ...(TABS.includes(s["aba"] as Tab) ? { aba: s["aba"] as Tab } : {}),
    ...(s["importar"] === true || s["importar"] === "1" || s["importar"] === 1
      ? { importar: true }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "Contatos e listas — ZapPilot" },
      {
        name: "description",
        content: "Importe, organize e segmente contatos com consentimento (opt-in).",
      },
      { property: "og:title", content: "Contatos e listas — ZapPilot" },
      {
        property: "og:description",
        content: "Importe, organize e segmente contatos com consentimento (opt-in).",
      },
    ],
  }),
  component: ContatosPage,
});

function ContatosPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { current } = useWorkspace();
  const wsId = current?.workspace.id ?? "";
  const { data: counts } = useQuery({ ...contactCountsQuery(wsId), enabled: !!wsId });

  const tab = search.aba ?? "contatos";
  const setTab = (aba: Tab) => navigate({ search: (s) => ({ ...s, aba }), replace: true });
  const importOpen = !!search.importar;
  const setImportOpen = (v: boolean) =>
    navigate({
      search: ({ importar: _drop, ...rest }) => (v ? { ...rest, importar: true } : rest),
      replace: true,
    });

  const [listId, setListId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (c: ContactRow) => {
    setEditing(c);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        eyebrow="Base de contatos"
        title="Contatos e listas"
        description={
          counts ? (
            <>
              <b className="tabular text-foreground">{counts.active.toLocaleString("pt-BR")}</b>{" "}
              ativos ·{" "}
              <b className="tabular text-foreground">{counts.eligible.toLocaleString("pt-BR")}</b>{" "}
              com opt-in e aptos para campanhas
            </>
          ) : (
            "Importe, organize e segmente contatos com consentimento (opt-in)."
          )
        }
        actions={
          <>
            <Button variant="glass" onClick={openNew}>
              <UserPlus /> Novo contato
            </Button>
            <Button variant="hero" onClick={() => setImportOpen(true)}>
              <Upload /> Importar planilha
            </Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="animate-fade-up">
        <TabsList className="mb-3 h-auto flex-wrap rounded-2xl p-1">
          <TabsTrigger value="contatos" className="rounded-xl">
            <Users className="mr-1.5 size-4" />
            Contatos
          </TabsTrigger>
          <TabsTrigger value="listas" className="rounded-xl">
            <ListChecks className="mr-1.5 size-4" />
            Listas
          </TabsTrigger>
          <TabsTrigger value="bloqueados" className="rounded-xl">
            <ShieldOff className="mr-1.5 size-4" />
            Bloqueados e descadastrados
            {!!counts?.inactive && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[11px] tabular">
                {counts.inactive}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="importacoes" className="rounded-xl">
            <History className="mr-1.5 size-4" />
            Importações
          </TabsTrigger>
        </TabsList>
        <TabsContent value="contatos">
          <ContactsPanel
            listId={listId}
            onListChange={setListId}
            onEdit={openEdit}
            onNew={openNew}
            onImport={() => setImportOpen(true)}
          />
        </TabsContent>
        <TabsContent value="listas">
          <ListsPanel
            onOpenList={(id) => {
              setListId(id);
              setTab("contatos");
            }}
          />
        </TabsContent>
        <TabsContent value="bloqueados">
          <InactivePanel />
        </TabsContent>
        <TabsContent value="importacoes">
          <ImportsPanel />
        </TabsContent>
      </Tabs>

      <ContactFormDialog open={formOpen} onOpenChange={setFormOpen} contact={editing} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}
