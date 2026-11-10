import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  BATCH_SIZE,
  FIELD_LABEL,
  MAX_IMPORT_ROWS,
  buildImportRows,
  chunk,
  guessField,
  type ImportField,
  type OptInMode,
} from "@/lib/contact-import";
import { listsQuery } from "@/lib/contacts";
import { formatBrPhone } from "@/lib/phone";
import { useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";
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
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage, parseTagInput, useRefreshContacts } from "./shared";

type Sheet = { fileName: string; headers: string[]; records: unknown[][] };
type Step = "upload" | "map" | "consent" | "run";
const MAX_BYTES = 15 * 1024 * 1024;

async function readSpreadsheet(file: File): Promise<Sheet> {
  const XLSX = await import("xlsx");
  const isText = /\.(csv|txt)$/i.test(file.name);
  const buf = await file.arrayBuffer();
  let wb;
  if (isText) {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder("windows-1252").decode(buf); // Excel "CSV" exports on Windows
    }
    wb = XLSX.read(text.replace(/^\uFEFF/, ""), { type: "string", raw: true });
  } else {
    wb = XLSX.read(buf, { type: "array" });
  }
  const ws = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!ws) throw new Error("A planilha está vazia.");
  const all = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false,
  });
  const headerIdx = all.findIndex((r) => r.some((c) => String(c).trim() !== ""));
  if (headerIdx < 0) throw new Error("A planilha está vazia.");
  const width = Math.max(...all.slice(headerIdx, headerIdx + 50).map((r) => r.length));
  const headers = Array.from(
    { length: width },
    (_, i) => String(all[headerIdx]?.[i] ?? "").trim() || `Coluna ${i + 1}`,
  );
  return { fileName: file.name, headers, records: all.slice(headerIdx + 1) };
}

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { current } = useWorkspace();
  const wsId = current?.workspace.id ?? "";
  const refresh = useRefreshContacts();
  const { data: lists = [] } = useQuery({ ...listsQuery(wsId), enabled: open && !!wsId });
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [reading, setReading] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [mode, setMode] = useState<OptInMode>("all");
  const [source, setSource] = useState("");
  const [declared, setDeclared] = useState(false);
  const [listChoice, setListChoice] = useState<string>("none");
  const [newListName, setNewListName] = useState("");
  const [tags, setTags] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    inserted: number;
    updated: number;
    invalid: number;
    duplicates: number;
  } | null>(null);
  const [running, setRunning] = useState(false);

  function reset() {
    setStep("upload");
    setSheet(null);
    setMapping([]);
    setMode("all");
    setSource("");
    setDeclared(false);
    setListChoice("none");
    setNewListName("");
    setTags("");
    setProgress(0);
    setResult(null);
    setRunning(false);
  }

  function close(v: boolean) {
    if (running) return;
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(csv|txt|xlsx|xls)$/i.test(file.name)) {
      toast.error("Envie um arquivo .csv, .xlsx ou .xls.");
      return;
    }

    if (file.size > MAX_BYTES) {
      toast.error("Arquivo maior que 15 MB.");
      return;
    }

    setReading(true);
    try {
      const s = await readSpreadsheet(file);
      if (!s.records.length) throw new Error("Nenhuma linha de dados abaixo do cabeçalho.");
      if (s.records.length > MAX_IMPORT_ROWS)
        throw new Error(
          `Limite de ${MAX_IMPORT_ROWS.toLocaleString("pt-BR")} linhas por importação.`,
        );
      const guessed = s.headers.map(guessField);
      // keep only the first guess for single-value fields
      const seen = new Set<ImportField>();
      const m = guessed.map((g) => {
        if (g === "custom" || g === "tags" || g === "ignore") return g;
        if (seen.has(g)) return "custom";
        seen.add(g);
        return g;
      });
      setSheet(s);
      setMapping(m);
      setMode(m.includes("opt_in") ? "column" : "all");
      setStep("map");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const built = useMemo(
    () =>
      sheet && mapping.includes("phone")
        ? buildImportRows(sheet.records, sheet.headers, mapping)
        : null,
    [sheet, mapping],
  );
  const optedRows = built
    ? mode === "all"
      ? built.rows.length
      : mode === "column"
        ? built.rows.filter((r) => r.opt_in).length
        : 0
    : 0;

  async function run() {
    if (!current || !sheet || !built) return;
    if (mode === "all" && (!source.trim() || !declared)) {
      toast.error("Informe a origem e confirme o consentimento.");
      return;
    }

    if (listChoice === "new" && !newListName.trim()) {
      toast.error("Dê um nome para a nova lista.");
      return;
    }

    setStep("run");
    setRunning(true);
    setProgress(0);
    let importId: string | null = null;
    try {
      let listId: string | null = listChoice === "none" || listChoice === "new" ? null : listChoice;
      if (listChoice === "new") {
        const { data, error } = await supabase
          .from("contact_lists")
          .insert({ workspace_id: current.workspace.id, name: newListName.trim().slice(0, 80) })
          .select("id")
          .single();
        if (error) throw error;
        listId = data.id;
      }
      const { data: imp, error: impErr } = await supabase
        .from("contact_imports")
        .insert({
          workspace_id: current.workspace.id,
          file_name: sheet.fileName.slice(0, 255),
          list_id: listId,
          tags: parseTagInput(tags),
          opt_in_mode: mode,
          opt_in_source: mode === "none" ? null : source.trim() || null,
          total_rows: built.rows.length + built.invalid.length + built.duplicates,
          invalid: built.invalid.length,
          duplicates: built.duplicates,
        })
        .select("id")
        .single();
      if (impErr) throw impErr;
      importId = imp.id;

      const totals = {
        inserted: 0,
        updated: 0,
        invalid: built.invalid.length,
        duplicates: built.duplicates,
      };
      const batches = chunk(built.rows, BATCH_SIZE);
      for (let i = 0; i < batches.length; i++) {
        const { data, error } = await supabase.rpc("import_contacts_batch", {
          _import_id: imp.id,
          _rows: batches[i]!,
        });
        if (error) throw error;
        const r = data as { inserted: number; updated: number; invalid: number };
        totals.inserted += r.inserted;
        totals.updated += r.updated;
        totals.invalid += r.invalid;
        setProgress(Math.round(((i + 1) / batches.length) * 100));
      }
      await supabase
        .from("contact_imports")
        .update({ status: "done", finished_at: new Date().toISOString() })
        .eq("id", imp.id);
      setResult(totals);
      await refresh();
    } catch (e) {
      if (importId)
        await supabase
          .from("contact_imports")
          .update({ status: "failed", finished_at: new Date().toISOString() })
          .eq("id", importId);
      toast.error(
        errorMessage(e, "A importação foi interrompida. As linhas já processadas foram mantidas."),
      );
      await refresh();
      setStep("consent");
    } finally {
      setRunning(false);
    }
  }

  const phoneCount = mapping.filter((m) => m === "phone").length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar contatos</DialogTitle>
          <DialogDescription>
            {step === "upload" && "CSV, XLSX ou XLS com uma linha de cabeçalho."}
            {step === "map" &&
              `${sheet?.fileName} · ${sheet?.records.length.toLocaleString("pt-BR")} linhas. Diga o que é cada coluna.`}
            {step === "consent" && "Consentimento (opt-in) e destino dos contatos."}
            {step === "run" && (result ? "Importação concluída." : "Importando…")}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex gap-1.5" aria-label="Etapas">
          {(["upload", "map", "consent", "run"] as Step[]).map((s, i) => (
            <li
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                ["upload", "map", "consent", "run"].indexOf(step) >= i ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </ol>

        {step === "upload" && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
            className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-border px-6 py-14 text-center transition-colors hover:border-primary hover:bg-primary/5"
          >
            {reading ? (
              <Loader2 className="size-8 animate-spin text-primary-ink" />
            ) : (
              <Upload className="size-8 text-primary-ink" />
            )}
            <span className="font-semibold">
              {reading ? "Lendo planilha…" : "Arraste a planilha aqui ou clique para escolher"}
            </span>
            <span className="max-w-md text-sm text-muted-foreground">
              Telefones são normalizados para 55 + DDD + número, duplicados são removidos e quem não
              tem opt-in fica fora das campanhas.
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </button>
        )}

        {step === "map" && sheet && (
          <div className="space-y-4">
            <div className="max-h-[50vh] overflow-auto rounded-2xl border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Coluna</th>
                    <th className="px-3 py-2">Exemplos</th>
                    <th className="px-3 py-2 w-56">Campo</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.headers.map((h, col) => (
                    <tr key={col} className="border-t">
                      <td className="px-3 py-2 font-medium">{h}</td>
                      <td className="max-w-[16rem] truncate px-3 py-2 text-muted-foreground">
                        {sheet.records
                          .slice(0, 3)
                          .map((r) => String(r[col] ?? ""))
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={mapping[col] ?? "ignore"}
                          onValueChange={(v) =>
                            setMapping((m) => m.map((x, i) => (i === col ? (v as ImportField) : x)))
                          }
                        >
                          <SelectTrigger className="h-9 rounded-lg" aria-label={`Campo para ${h}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(FIELD_LABEL) as ImportField[]).map((f) => (
                              <SelectItem key={f} value={f}>
                                {FIELD_LABEL[f]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {phoneCount !== 1 && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="size-4" /> Escolha exatamente uma coluna como Telefone.
              </p>
            )}
            {built && phoneCount === 1 && <Summary built={built} />}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("upload")}>
                Trocar arquivo
              </Button>
              <Button
                onClick={() => setStep("consent")}
                disabled={phoneCount !== 1 || !built?.rows.length}
              >
                Continuar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "consent" && built && (
          <div className="space-y-5">
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as OptInMode)}
              className="gap-2"
            >
              <ModeOption
                value="all"
                current={mode}
                title="Todos deram consentimento"
                desc="Você confirma que cada contato autorizou receber mensagens."
              />
              <ModeOption
                value="column"
                current={mode}
                disabled={!mapping.includes("opt_in")}
                title="Usar a coluna de opt-in da planilha"
                desc={
                  mapping.includes("opt_in")
                    ? "Só as linhas marcadas como “sim” entram com consentimento."
                    : "Mapeie uma coluna como Opt-in para usar esta opção."
                }
              />
              <ModeOption
                value="none"
                current={mode}
                title="Sem consentimento"
                desc="Os contatos são salvos, mas ficam fora das campanhas até registrar o opt-in."
              />
            </RadioGroup>

            {mode !== "none" && (
              <div className="space-y-1.5">
                <Label htmlFor="imp-source">Origem do consentimento {mode === "all" && "*"}</Label>
                <Input
                  id="imp-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  maxLength={200}
                  placeholder="Ex.: formulário do site, cadastro na loja, evento"
                  className="h-11 rounded-xl"
                />
              </div>
            )}
            {mode === "all" && (
              <label className="flex items-start gap-2.5 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm">
                <Checkbox
                  checked={declared}
                  onCheckedChange={(v) => setDeclared(v === true)}
                  className="mt-0.5"
                />
                Declaro que estes contatos autorizaram receber mensagens pelo WhatsApp (LGPD) e que
                posso comprovar o consentimento.
              </label>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Adicionar à lista</Label>
                <Select value={listChoice} onValueChange={setListChoice}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma lista</SelectItem>
                    <SelectItem value="new">+ Nova lista</SelectItem>
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {listChoice === "new" && (
                  <Input
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    maxLength={80}
                    placeholder="Nome da lista"
                    className="h-10 rounded-xl"
                    aria-label="Nome da nova lista"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-tags">Tags para todos</Label>
                <Input
                  id="imp-tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="importado, nov-2026"
                  className="h-11 rounded-xl"
                />
              </div>
            </div>

            <p className="rounded-2xl bg-muted/60 p-3 text-sm">
              <span className="font-semibold tabular">
                {built.rows.length.toLocaleString("pt-BR")}
              </span>{" "}
              contatos válidos ·{" "}
              <span className="font-semibold tabular">{optedRows.toLocaleString("pt-BR")}</span> com
              opt-in. Contatos que já existem são atualizados sem perder o consentimento nem sair de
              bloqueados/descadastrados.
            </p>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("map")}>
                Voltar
              </Button>
              <Button
                variant="hero"
                onClick={run}
                disabled={mode === "all" && (!declared || !source.trim())}
              >
                Importar {built.rows.length.toLocaleString("pt-BR")} contatos
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "run" && (
          <div className="space-y-5 py-4">
            {!result ? (
              <>
                <Progress value={progress} />
                <p className="text-center text-sm text-muted-foreground tabular">
                  {progress}% · não feche esta janela
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-2 text-center">
                  <CheckCircle2 className="size-10 text-success" />
                  <p className="text-lg font-bold">Importação concluída</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Novos" value={result.inserted} />
                  <Stat label="Atualizados" value={result.updated} />
                  <Stat label="Inválidos" value={result.invalid} />
                  <Stat label="Duplicados" value={result.duplicates} />
                </div>
                <DialogFooter>
                  <Button onClick={() => close(false)}>Fechar</Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModeOption({
  value,
  current,
  title,
  desc,
  disabled,
}: {
  value: OptInMode;
  current: OptInMode;
  title: string;
  desc: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors",
        current === value && "border-primary bg-primary/5",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <RadioGroupItem value={value} disabled={disabled} className="mt-0.5" />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border p-3 text-center">
      <p className="text-2xl font-extrabold tabular">{value.toLocaleString("pt-BR")}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Summary({ built }: { built: NonNullable<ReturnType<typeof buildImportRows>> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Válidos" value={built.rows.length} />
        <Stat label="Inválidos" value={built.invalid.length} />
        <Stat label="Duplicados" value={built.duplicates} />
      </div>
      <div className="rounded-2xl border p-3 text-xs">
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold">
          <FileSpreadsheet className="size-3.5" /> Prévia
        </p>
        <ul className="space-y-1 font-mono">
          {built.rows.slice(0, 3).map((r) => (
            <li key={r.phone} className="truncate">
              {formatBrPhone(r.phone)} {r.name ? `· ${r.name}` : ""}
            </li>
          ))}
          {built.invalid.slice(0, 3).map((r) => (
            <li key={`bad-${r.line}`} className="truncate text-destructive">
              Linha {r.line}: {r.value}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
