import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Braces, RefreshCw, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BUILTIN_VARIABLES, checkSpintax, countVariations, extractVariables, renderMessage } from "@/lib/spintax";
import { CATEGORIES, CATEGORY_LABEL, type MessageTemplate, type TemplateCategory } from "@/lib/templates";

const SAMPLE = { nome: "Ana Souza", primeiro_nome: "Ana", telefone: "5591988887777", email: "ana@exemplo.com.br" };
const MAX = 4096;

export function TemplateEditor({
  open,
  onOpenChange,
  workspaceId,
  template,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string;
  /** null = new; an object without id = duplicate */
  template: Partial<MessageTemplate> | null;
}) {
  const qc = useQueryClient();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("first_contact");
  const [body, setBody] = useState("");
  const [seed, setSeed] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setCategory((template?.category as TemplateCategory) ?? "first_contact");
    setBody(template?.body ?? "");
    setSeed(0);
  }, [open, template]);

  const error = checkSpintax(body);
  const variations = countVariations(body);
  const unknownVars = extractVariables(body).filter((v) => !(BUILTIN_VARIABLES as readonly string[]).includes(v));
  const preview = useMemo(() => {
    if (error || !body.trim()) return "";
    let s = seed * 9301 + 49297;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return renderMessage(body, SAMPLE, seed === 0 ? () => 0 : rng);
  }, [body, seed, error]);

  function insert(text: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const selected = body.slice(start, end);
    const snippet = text === "{|}" ? `{${selected || "opção 1"}|opção 2}` : text;
    const next = body.slice(0, start) + snippet + body.slice(end);
    setBody(next.slice(0, MAX));
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + snippet.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  async function save() {
    if (!name.trim()) { toast.error("Dê um nome ao template."); return; }
    if (!body.trim()) { toast.error("Escreva a mensagem."); return; }
    if (error) { toast.error(error); return; }
    setSaving(true);
    const row = { name: name.trim(), category, body };
    const { error: e } = template?.id
      ? await supabase.from("message_templates").update(row).eq("id", template.id)
      : await supabase.from("message_templates").insert({ ...row, workspace_id: workspaceId });
    setSaving(false);
    if (e) { toast.error("Não foi possível salvar o template."); return; }
    await qc.invalidateQueries({ queryKey: ["templates", workspaceId] });
    toast.success(template?.id ? "Template atualizado." : "Template criado.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template?.id ? "Editar template" : "Novo template"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Nome</Label>
                <Input id="tpl-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Crédito — primeiro contato" />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="tpl-body">Mensagem</Label>
                <span className="tabular text-xs text-muted-foreground">{body.length}/{MAX}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BUILTIN_VARIABLES.map((v) => (
                  <Button key={v} type="button" size="sm" variant="outline" className="h-7 font-mono text-xs" onClick={() => insert(`{{${v}}}`)}>
                    {`{{${v}}}`}
                  </Button>
                ))}
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => insert("{|}")}>
                  <Braces className="size-3.5" /> Variação
                </Button>
              </div>
              <Textarea
                id="tpl-body"
                ref={ref}
                value={body}
                maxLength={MAX}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="font-mono text-sm"
                placeholder="{Olá|Oi}, {{primeiro_nome}}! {Tudo bem?|Como vai?}"
              />
              {error ? (
                <p className="text-xs font-medium text-destructive">{error}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  <strong className="tabular text-foreground">{variations.toLocaleString("pt-BR")}</strong>{" "}
                  {variations === 1 ? "versão possível" : "versões possíveis"}. Use {"{a|b|c}"} para variar o texto — cada contato recebe uma combinação.
                </p>
              )}
              {unknownVars.length > 0 && (
                <p className="text-xs text-warning">
                  Campos personalizados: {unknownVars.map((v) => `{{${v}}}`).join(", ")} — ficam em branco para contatos sem esse campo.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Pré-visualização</Label>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={!!error || !body.trim()} onClick={() => setSeed((s) => s + 1)}>
                <Shuffle className="size-3.5" /> Outra versão
              </Button>
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              {preview ? (
                <div className="ml-auto w-fit max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground shadow-sm">
                  {preview}
                </div>
              ) : (
                <p className="py-8 text-center text-xs text-muted-foreground">A mensagem aparece aqui como o contato vai ver.</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Exemplo com o contato “Ana Souza”.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="hero" onClick={save} disabled={saving}>
            {saving && <RefreshCw className="animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
