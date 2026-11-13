import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pause, Play, Plus, X, Loader2, Pencil, Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sendTestMessage, updateCampaign } from "@/lib/campaign.functions";
import { Info } from "@/components/app/Info";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { renderMessage, checkSpintax } from "@/lib/spintax";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/_app/campanhas")({
  head: () => ({
    meta: [
      { title: "Campanhas — ZapPilot" },
      { name: "description", content: "Envios em massa com fila anti-banimento e acompanhamento em tempo real." },
      { property: "og:title", content: "Campanhas — ZapPilot" },
      { property: "og:description", content: "Envios em massa com fila anti-banimento e acompanhamento em tempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampanhasPage,
});

const ST: Record<string, string> = { draft: "Rascunho", running: "Enviando", paused: "Pausada", completed: "Concluída", cancelled: "Cancelada" };
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const blank = { name: "", list_id: "", instance_id: "", body: "", min_interval_s: 15, max_interval_s: 45, batch_size: 20, batch_pause_min: 3, batch_pause_max: 8, daily_limit: 20, window_start: 8, window_end: 19, window_days: [1, 2, 3, 4, 5, 6], dedupe_days: 7 };
type Form = typeof blank & { id?: string };
const SAMPLE = { nome: "Maria Silva", primeiro_nome: "Maria", telefone: "5511999999999", email: "maria@exemplo.com" };

function CampanhasPage() {
  const { current } = useWorkspace();
  const ws = current?.workspace.id ?? "";
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const sendTest = useServerFn(sendTestMessage);
  const update = useServerFn(updateCampaign);
  const camps = useQuery({ queryKey: ["campaigns", ws], enabled: !!ws, refetchInterval: 15000,
    queryFn: async () => (await supabase.from("campaigns").select("*").eq("workspace_id", ws).order("created_at", { ascending: false })).data ?? [] });
  const lists = useQuery({ queryKey: ["lists-simple", ws], enabled: !!ws,
    queryFn: async () => (await supabase.from("contact_lists").select("id,name").eq("workspace_id", ws).order("name")).data ?? [] });
  const tpls = useQuery({ queryKey: ["templates-simple", ws], enabled: !!ws,
    queryFn: async () => (await supabase.from("message_templates").select("id,name,body").eq("workspace_id", ws).order("name")).data ?? [] });
  const insts = useQuery({ queryKey: ["instances-simple", ws], enabled: !!ws,
    queryFn: async () => (await supabase.from("whatsapp_instances").select("id,display_name,status").eq("workspace_id", ws)).data ?? [] });
  const refresh = () => qc.invalidateQueries({ queryKey: ["campaigns", ws] });
  const num = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => form && setForm({ ...form, [k]: Number(e.target.value) });

  async function create() {
    if (!form || !form.name.trim() || !form.list_id || !form.instance_id || !form.body.trim()) { toast.error("Preencha nome, número, lista e mensagem."); return; }
    const sp = checkSpintax(form.body); if (sp) { toast.error(sp); return; }
    if (form.max_interval_s < form.min_interval_s || form.min_interval_s < 5) { toast.error("Intervalo inválido (mínimo 5s)."); return; }
    if (!form.window_days.length || form.window_end <= form.window_start) { toast.error("Revise o horário e os dias permitidos."); return; }
    setBusy(true);
    if (form.id) {
      const { list_id: _l, ...rest } = form;
      const r = await update({ data: { ...rest, id: form.id } }).catch((e: Error) => ({ ok: false as const, error: e.message }));
      setBusy(false);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Campanha atualizada."); setForm(null); refresh(); return;
    }
    try {
      const { data: camp, error } = await supabase.from("campaigns").insert({ workspace_id: ws, ...form, name: form.name.trim() }).select("id").single();
      if (error || !camp) throw error;
      const { data: n, error: e2 } = await supabase.rpc("enqueue_campaign", { _campaign_id: camp.id });
      if (e2) throw e2;
      if (!n) { await supabase.from("campaigns").delete().eq("id", camp.id); toast.error("Nenhum contato apto nessa lista (precisa de opt-in, estar ativo e não ter recebido mensagem recentemente)."); return; }
      toast.success(`Campanha criada com ${n} contatos. Clique em Iniciar.`); setForm(null); refresh();
    } catch (e: unknown) { toast.error((e as { message?: string })?.message ?? "Erro ao criar campanha."); } finally { setBusy(false); }
  }
  async function test() {
    if (!form?.instance_id || !form.body.trim() || !testPhone.trim()) { toast.error("Escolha o número, escreva a mensagem e informe o telefone de teste."); return; }
    setBusy(true);
    const r = await sendTest({ data: { instanceId: form.instance_id, phone: testPhone, body: form.body } }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setBusy(false);
    if (r.ok) toast.success("Mensagem de teste enviada."); else toast.error(r.error);
  }
  function edit(c: Form & { id: string }) {
    const f: Form = { id: c.id } as Form;
    (Object.keys(blank) as (keyof typeof blank)[]).forEach((k) => { (f as Record<string, unknown>)[k] = (c as Record<string, unknown>)[k] ?? blank[k]; });
    setForm(f); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function setStatus(id: string, status: "running" | "paused" | "cancelled") {
    const { error } = await supabase.from("campaigns").update({ status, pause_reason: null }).eq("id", id);
    if (error) toast.error(error.message); refresh();
  }

  return (
    <>
      <PageHeader eyebrow="Disparos" title="Campanhas" description="Envio um a um, com intervalos aleatórios, pausas, limite diário e horário permitido (horário de Brasília)." />
      {!form && <Button className="mb-4" onClick={() => setForm({ ...blank, instance_id: insts.data?.[0]?.id ?? "" })}><Plus /> Nova campanha</Button>}
      {form && (
        <section className="glass mb-6 grid gap-6 rounded-3xl p-6 lg:grid-cols-2">
          <div className="space-y-3">
            <Input placeholder="Nome da campanha" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="h-10 w-full rounded-xl border bg-background px-3 text-sm" value={form.instance_id} onChange={(e) => setForm({ ...form, instance_id: e.target.value })}>
              <option value="">Escolha o número de WhatsApp…</option>
              {insts.data?.map((i) => <option key={i.id} value={i.id}>{i.display_name}{i.status !== "connected" ? " (desconectado)" : ""}</option>)}
            </select>
            <select disabled={!!form.id} title={form.id ? "A lista não pode ser trocada depois de criada" : undefined} className="h-10 w-full rounded-xl border bg-background px-3 text-sm disabled:opacity-60" value={form.list_id} onChange={(e) => setForm({ ...form, list_id: e.target.value })}>
              <option value="">Escolha a lista de contatos…</option>
              {lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select className="h-10 w-full rounded-xl border bg-background px-3 text-sm" value="" onChange={(e) => { const t = tpls.data?.find((x) => x.id === e.target.value); if (t) setForm({ ...form, body: t.body }); }}>
              <option value="">Usar um template…</option>
              {tpls.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Textarea rows={6} placeholder="{Olá|Oi} {{primeiro_nome}}…" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <p className="flex items-center gap-1 text-xs text-muted-foreground">Variáveis e variações <Info text="Use {{primeiro_nome}}, {{nome}}, {{telefone}} ou {{email}} para personalizar. Escreva {Olá|Oi} para o sistema sortear uma opção em cada envio — isso deixa as mensagens diferentes entre si e reduz o risco de bloqueio." /></p>
            {form.body && <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-primary/15 p-3 text-sm">{renderMessage(form.body, SAMPLE)}</div>}
            <div className="flex items-center gap-2">
              <Input placeholder="Seu telefone p/ teste (DDD + número)" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              <Button type="button" variant="outline" disabled={busy} onClick={test}><Send /> Testar envio</Button>
              <Info text="Envia agora uma única mensagem, já com as variações sorteadas, para o telefone informado. Não entra na fila nem conta na campanha." />
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-1 font-semibold">{form.id ? "Editando campanha — " : ""}Regras de envio (anti-banimento) <Info text="Só entram contatos com opt-in. A campanha pausa sozinha se as falhas passarem de 15% ou se o número desconectar." /></p>
            <Row label={"Intervalo entre mensagens (s)"} tip="Tempo aleatório de espera entre uma mensagem e outra. Intervalos variados imitam um envio humano e evitam bloqueio."><Input type="number" value={form.min_interval_s} onChange={num("min_interval_s")} /> a <Input type="number" value={form.max_interval_s} onChange={num("max_interval_s")} /></Row>
            <Row label={"Pausa a cada (mensagens)"} tip="Depois desse número de envios, a campanha faz uma pausa maior antes de continuar."><Input type="number" value={form.batch_size} onChange={num("batch_size")} /></Row>
            <Row label={"Duração da pausa (min)"} tip="Quanto tempo dura a pausa maior. O sistema sorteia um valor entre o mínimo e o máximo."><Input type="number" value={form.batch_pause_min} onChange={num("batch_pause_min")} /> a <Input type="number" value={form.batch_pause_max} onChange={num("batch_pause_max")} /></Row>
            <Row label={"Limite diário do número"} tip="Máximo de mensagens que este número envia por dia nesta campanha. Número novo: comece com 20 e aumente aos poucos."><Input type="number" value={form.daily_limit} onChange={num("daily_limit")} /></Row>
            <Row label={"Horário permitido (h)"} tip="Só envia dentro deste horário (Brasília) e nos dias marcados abaixo. Fora dele, a fila espera."><Input type="number" value={form.window_start} onChange={num("window_start")} /> às <Input type="number" value={form.window_end} onChange={num("window_end")} /></Row>
            <div className="flex flex-wrap gap-1">{DAYS.map((d, i) => (
              <Button key={d} type="button" size="sm" variant={form.window_days.includes(i) ? "default" : "outline"} onClick={() => setForm({ ...form, window_days: form.window_days.includes(i) ? form.window_days.filter((x) => x !== i) : [...form.window_days, i] })}>{d}</Button>
            ))}</div>
            <Row label={"Não repetir contato por (dias)"} tip="Quem recebeu mensagem nesse período fica de fora, para não incomodar o mesmo contato várias vezes."><Input type="number" value={form.dedupe_days} onChange={num("dedupe_days")} /></Row>
            <p className="text-xs text-muted-foreground">Número novo? Comece com 20/dia e aumente aos poucos. Só entram contatos com opt-in. A campanha pausa sozinha se as falhas passarem de 15% ou o número desconectar.</p>
            <div className="flex gap-2"><Button disabled={busy} onClick={create}>{busy && <Loader2 className="animate-spin" />} {form.id ? "Salvar alterações" : "Criar campanha"}</Button><Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button></div>
          </div>
        </section>
      )}
      <div className="grid gap-4">
        {camps.data?.length === 0 && !form && <p className="text-muted-foreground">Nenhuma campanha ainda.</p>}
        {camps.data?.map((c) => (
          <article key={c.id} className="glass rounded-3xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="font-bold">{c.name}</h3><p className="text-sm text-muted-foreground">{ST[c.status]}{c.pause_reason ? ` — ${c.pause_reason}` : ""}</p></div>
              <div className="flex gap-2">
                {(c.status === "draft" || c.status === "paused") && <Button size="sm" onClick={() => setStatus(c.id, "running")}><Play /> {c.status === "draft" ? "Iniciar" : "Continuar"}</Button>}
                {c.status === "running" && <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "paused")}><Pause /> Pausar</Button>}
                {(c.status === "draft" || c.status === "paused") && <Button size="sm" variant="outline" onClick={() => edit(c as unknown as Form & { id: string })}><Pencil /> Editar</Button>}
                {["draft", "running", "paused"].includes(c.status) && <Button size="sm" variant="ghost" onClick={() => setStatus(c.id, "cancelled")}><X /> Cancelar</Button>}
              </div>
            </div>
            <Progress className="mt-4" value={c.total ? ((c.sent + c.failed) / c.total) * 100 : 0} />
            <p className="mt-2 text-xs text-muted-foreground">{c.sent} enviadas · {c.failed} falhas · {c.total} no total</p>
          </article>
        ))}
      </div>
    </>
  );
}
function Row({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return <label className="flex items-center gap-2"><span className="flex w-56 shrink-0 items-center gap-1">{label}{tip && <Info text={tip} />}</span><span className="flex flex-1 items-center gap-2">{children}</span></label>;
}
