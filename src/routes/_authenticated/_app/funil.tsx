import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MessagesSquare, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { formatBrPhone } from "@/lib/phone";
import { STAGES, PRODUCTS, stageTotals, winRate, brl, type StageId } from "@/lib/funnel";
import { PageHeader } from "@/components/app/PageHeader";
import { Info } from "@/components/app/Info";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_app/funil")({
  head: () => ({
    meta: [
      { title: "Funil — ZapPilot" },
      { name: "description", content: "Leads em colunas, do primeiro contato ao fechamento." },
      { property: "og:title", content: "Funil — ZapPilot" },
      { property: "og:description", content: "Leads em colunas, do primeiro contato ao fechamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FunilPage,
});

type Deal = {
  id: string; stage: StageId; value: number | null; product: string | null; notes: string | null; updated_at: string;
  contact: { id: string; name: string | null; phone: string; status: string } | null;
};

async function loadDeals(ws: string): Promise<Deal[]> {
  const { data, error } = await supabase
    .from("deals")
    .select("id, stage, value, product, notes, updated_at, contacts(id, name, phone, status)")
    .eq("workspace_id", ws).order("updated_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return (data ?? []).map((d) => ({ ...d, value: d.value === null ? null : Number(d.value), contact: d.contacts as Deal["contact"] }));
}

function FunilPage() {
  const { current } = useWorkspace();
  const ws = current?.workspace.id ?? "";
  const qc = useQueryClient();
  const key = ["deals", ws];
  const deals = useQuery({ queryKey: key, queryFn: () => loadDeals(ws), enabled: !!ws, refetchInterval: 30000 });
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<StageId | null>(null);
  const [edit, setEdit] = useState<Deal | null>(null);
  const [adding, setAdding] = useState(false);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase(); const digits = s.replace(/\D/g, "");
    return (deals.data ?? []).filter((d) => !s || (d.contact?.name ?? "").toLowerCase().includes(s) || (!!digits && (d.contact?.phone ?? "").includes(digits)) || (d.product ?? "").toLowerCase().includes(s));
  }, [deals.data, q]);
  const totals = stageTotals(list);
  const rate = winRate(list);
  const pipeline = list.filter((d) => !["fechado", "perdido"].includes(d.stage)).reduce((a, d) => a + (d.value ?? 0), 0);

  async function move(id: string, stage: StageId) {
    const prev = qc.getQueryData<Deal[]>(key);
    qc.setQueryData<Deal[]>(key, (old) => old?.map((d) => (d.id === id ? { ...d, stage } : d)));
    const { error } = await supabase.from("deals").update({ stage }).eq("id", id);
    if (error) { qc.setQueryData(key, prev); toast.error("Não foi possível mover o lead."); }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Funil de vendas"
        title="Funil"
        description="Arraste os cards entre as colunas. Envios de campanha e respostas no WhatsApp movem os leads sozinhos."
        actions={<Button onClick={() => setAdding(true)}><Plus className="size-4" /> Adicionar lead</Button>}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar nome, número ou produto" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Stat label="Em aberto" value={brl(pipeline)} info="Soma do valor estimado dos leads que ainda não foram fechados nem perdidos." />
        <Stat label="Conversão" value={rate === null ? "—" : `${rate}%`} info="Fechados ÷ (fechados + perdidos)." />
        <Stat label="Leads" value={String(list.length)} />
      </div>

      {deals.isError && <p className="text-sm text-destructive">Não foi possível carregar o funil.</p>}

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
        {STAGES.map((s) => (
          <section
            key={s.id}
            onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
            onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = drag ?? e.dataTransfer.getData("text/plain"); setDrag(null); if (id) void move(id, s.id); }}
            className={`flex w-64 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors ${over === s.id ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold">{s.label}<Info text={s.hint} /></div>
              <div className="text-right text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{totals[s.id].count}</span>
                {totals[s.id].value > 0 && <span> · {brl(totals[s.id].value)}</span>}
              </div>
            </header>
            <div className="flex min-h-32 flex-col gap-2 p-2">
              {list.filter((d) => d.stage === s.id).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  draggable
                  onDragStart={(e) => { setDrag(d.id); e.dataTransfer.setData("text/plain", d.id); }}
                  onDragEnd={() => setDrag(null)}
                  onClick={() => setEdit(d)}
                  className={`rounded-lg border border-border bg-card p-2.5 text-left shadow-sm transition hover:border-primary/60 ${drag === d.id ? "opacity-50" : ""}`}
                >
                  <div className="truncate text-sm font-medium">{d.contact?.name || formatBrPhone(d.contact?.phone ?? "")}</div>
                  {d.contact?.name && <div className="text-xs text-muted-foreground">{formatBrPhone(d.contact.phone)}</div>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    {d.product && <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">{d.product}</span>}
                    {d.value !== null && <span className="font-medium">{brl(d.value)}</span>}
                    {d.contact && d.contact.status !== "active" && <span className="text-destructive">não quer mensagens</span>}
                  </div>
                </button>
              ))}
              {totals[s.id].count === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Arraste um card para cá</p>}
            </div>
          </section>
        ))}
      </div>

      {deals.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">Seu funil está vazio. Clique em <b>Adicionar lead</b> ou dispare uma campanha: quem receber a mensagem aparece em Contatado.</p>
      )}

      <EditDialog deal={edit} onClose={() => setEdit(null)} onSaved={() => qc.invalidateQueries({ queryKey: key })} />
      <AddDialog open={adding} ws={ws} existing={new Set((deals.data ?? []).map((d) => d.contact?.id ?? ""))} onClose={() => setAdding(false)} onSaved={() => qc.invalidateQueries({ queryKey: key })} />
    </div>
  );
}

function Stat({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-1.5">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}{info && <Info text={info} />}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function EditDialog({ deal, onClose, onSaved }: { deal: Deal | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ stage: "novo" as StageId, value: "", product: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (deal && loadedId !== deal.id) {
    setLoadedId(deal.id);
    setForm({ stage: deal.stage, value: deal.value === null ? "" : String(deal.value), product: deal.product ?? "", notes: deal.notes ?? "" });
  }

  async function save() {
    if (!deal) return;
    const v = form.value.trim() === "" ? null : Number(form.value.replace(/\./g, "").replace(",", "."));
    if (v !== null && (!Number.isFinite(v) || v < 0)) { toast.error("Valor inválido."); return; }
    setBusy(true);
    const { error } = await supabase.from("deals").update({ stage: form.stage, value: v, product: form.product.trim() || null, notes: form.notes.trim() || null }).eq("id", deal.id);
    setBusy(false);
    if (error) { toast.error("Não foi possível salvar."); return; }
    toast.success("Lead atualizado."); onSaved(); onClose();
  }

  async function remove() {
    if (!deal || !confirm("Tirar este lead do funil? O contato continua cadastrado.")) return;
    const { error } = await supabase.from("deals").delete().eq("id", deal.id);
    if (error) { toast.error("Não foi possível remover."); return; }
    onSaved(); onClose();
  }

  return (
    <Dialog open={!!deal} onOpenChange={(o) => { if (!o) { onClose(); setLoadedId(null); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{deal?.contact?.name || formatBrPhone(deal?.contact?.phone ?? "")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Etapa</Label>
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v as StageId })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1">Valor estimado (R$)<Info text="Quanto esse cliente deve gerar. Soma no total da coluna e em 'Em aberto'." /></Label>
              <Input inputMode="decimal" placeholder="Ex.: 1500" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Produto</Label>
            <Input list="funil-produtos" placeholder="Ex.: Limpa Nome" maxLength={60} value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} />
            <datalist id="funil-produtos">{PRODUCTS.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="grid gap-1.5">
            <Label>Anotações</Label>
            <Textarea rows={4} maxLength={4000} placeholder="Próximo passo, combinados, objeções…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={remove}><Trash2 className="size-4" /> Tirar do funil</Button>
            <Button variant="outline" size="sm" asChild><Link to="/conversas"><MessagesSquare className="size-4" /> Conversas</Link></Button>
          </div>
          <Button onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDialog({ open, ws, existing, onClose, onSaved }: { open: boolean; ws: string; existing: Set<string>; onClose: () => void; onSaved: () => void }) {
  const [q, setQ] = useState("");
  const found = useQuery({
    queryKey: ["deal-contacts", ws, q],
    enabled: open && !!ws,
    queryFn: async () => {
      let r = supabase.from("contacts").select("id, name, phone").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(30);
      const s = q.trim(); const digits = s.replace(/\D/g, "");
      if (s) r = digits.length >= 3 ? r.ilike("phone", `%${digits}%`) : r.ilike("name", `%${s.replace(/[%_,()]/g, "")}%`);
      const { data, error } = await r;
      if (error) throw error;
      return data ?? [];
    },
  });

  async function add(contactId: string) {
    const { error } = await supabase.from("deals").insert({ workspace_id: ws, contact_id: contactId, stage: "novo" });
    if (error) { toast.error(error.code === "23505" ? "Esse contato já está no funil." : "Não foi possível adicionar."); return; }
    toast.success("Lead adicionado em Novo."); onSaved();
  }

  const rows = (found.data ?? []).filter((c) => !existing.has(c.id));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adicionar lead ao funil</DialogTitle></DialogHeader>
        <Input autoFocus placeholder="Buscar contato por nome ou número" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {rows.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{c.name || "Sem nome"}</div>
                <div className="text-xs text-muted-foreground">{formatBrPhone(c.phone)}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => add(c.id)}><Plus className="size-4" /> Adicionar</Button>
            </div>
          ))}
          {!found.isLoading && rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum contato fora do funil. <Link to="/contatos" className="underline">Cadastrar contatos</Link></p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
