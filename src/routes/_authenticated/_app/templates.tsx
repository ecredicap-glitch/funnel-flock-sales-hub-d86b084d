import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, LayoutTemplate, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { CATEGORIES, CATEGORY_LABEL, STARTER_TEMPLATES, templatesQuery, type MessageTemplate, type TemplateCategory } from "@/lib/templates";
import { countVariations } from "@/lib/spintax";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/templates")({
  head: () => ({
    meta: [
      { title: "Templates — ZapPilot" },
      { name: "description", content: "Modelos de mensagem por categoria com variáveis e variações." },
      { property: "og:title", content: "Templates — ZapPilot" },
      { property: "og:description", content: "Modelos de mensagem por categoria com variáveis e variações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const { current } = useWorkspace();
  const wsId = current?.workspace.id ?? "";
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useQuery({ ...templatesQuery(wsId), enabled: !!wsId });
  const [filter, setFilter] = useState<TemplateCategory | "all">("all");
  const [editing, setEditing] = useState<Partial<MessageTemplate> | null>(null);
  const [open, setOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const shown = filter === "all" ? templates : templates.filter((t) => t.category === filter);

  function edit(t: Partial<MessageTemplate> | null) {
    setEditing(t);
    setOpen(true);
  }

  async function addStarters() {
    setSeeding(true);
    const existing = new Set(templates.map((t) => t.name));
    const rows = STARTER_TEMPLATES.filter((t) => !existing.has(t.name)).map((t) => ({ ...t, workspace_id: wsId }));
    const { error } = rows.length ? await supabase.from("message_templates").insert(rows) : { error: null };
    setSeeding(false);
    if (error) { toast.error("Não foi possível adicionar os exemplos."); return; }
    await qc.invalidateQueries({ queryKey: ["templates", wsId] });
    toast.success(rows.length ? `${rows.length} modelos adicionados.` : "Os exemplos já estão na sua biblioteca.");
  }

  async function remove(t: MessageTemplate) {
    if (!confirm(`Excluir o template “${t.name}”?`)) return;
    const { error } = await supabase.from("message_templates").delete().eq("id", t.id);
    if (error) { toast.error("Não foi possível excluir."); return; }
    await qc.invalidateQueries({ queryKey: ["templates", wsId] });
    toast.success("Template excluído.");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Biblioteca"
        title="Templates"
        description="Modelos com variáveis e variações de texto — cada contato recebe uma versão diferente, o que reduz o risco de bloqueio."
        actions={
          <>
            <Button variant="glass" onClick={addStarters} disabled={seeding || !wsId}>
              <Sparkles /> Adicionar exemplos
            </Button>
            <Button variant="hero" onClick={() => edit(null)} disabled={!wsId}>
              <Plus /> Novo template
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(["all", ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              filter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {c === "all" ? "Todos" : CATEGORY_LABEL[c]}
            <span className="tabular ml-1 opacity-70">
              {c === "all" ? templates.length : templates.filter((t) => t.category === c).length}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? null : shown.length === 0 ? (
        <section className="glass rounded-3xl">
          <EmptyState
            icon={LayoutTemplate}
            title={templates.length ? "Nada nesta categoria" : "Nenhum template ainda"}
            description="Comece pelos 8 modelos para o setor financeiro (crédito, consórcio, limpa nome e rating), em tom consultivo e sem promessa de aprovação."
          >
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="hero" onClick={addStarters} disabled={seeding}>
                <Sparkles /> Adicionar os 8 exemplos
              </Button>
              <Button variant="glass" onClick={() => edit(null)}>
                <Plus /> Criar do zero
              </Button>
            </div>
          </EmptyState>
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => (
            <article key={t.id} className="glass flex flex-col rounded-3xl p-5 animate-fade-up">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-primary-ink">
                    {CATEGORY_LABEL[t.category as TemplateCategory] ?? t.category}
                  </span>
                  <h3 className="truncate font-bold">{t.name}</h3>
                </div>
                <span className="tabular shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {countVariations(t.body).toLocaleString("pt-BR")} versões
                </span>
              </div>
              <p className="mt-3 line-clamp-4 flex-1 whitespace-pre-wrap font-mono text-xs text-muted-foreground">{t.body}</p>
              <div className="mt-4 flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => edit(t)}><Pencil /> Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => edit({ name: `${t.name} (cópia)`, category: t.category, body: t.body })}>
                  <Copy /> Duplicar
                </Button>
                <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => remove(t)} aria-label="Excluir">
                  <Trash2 />
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}

      <TemplateEditor open={open} onOpenChange={setOpen} workspaceId={wsId} template={editing} />
    </div>
  );
}
