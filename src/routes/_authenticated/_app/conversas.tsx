import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessagesSquare, Search, Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { formatBrPhone } from "@/lib/phone";
import { sendChatMessage, suggestChatReply } from "@/lib/chat.functions";
import { PageHeader } from "@/components/app/PageHeader";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/conversas")({
  head: () => ({
    meta: [
      { title: "Conversas — ZapPilot" },
      { name: "description", content: "Leia as respostas dos clientes e responda pelo WhatsApp sem sair do ZapPilot." },
      { property: "og:title", content: "Conversas — ZapPilot" },
      { property: "og:description", content: "Leia as respostas dos clientes e responda pelo WhatsApp sem sair do ZapPilot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConversasPage,
});

type Msg = { id: string; phone: string; body: string; at: string; dir: "in" | "out"; origin: string };

async function loadMessages(ws: string): Promise<Msg[]> {
  const since = new Date(Date.now() - 60 * 864e5).toISOString();
  const [inb, camp, out] = await Promise.all([
    supabase.from("inbound_messages").select("id, phone, body, received_at").eq("workspace_id", ws).gte("received_at", since).limit(2000),
    supabase.from("campaign_messages").select("id, phone, body, sent_at").eq("workspace_id", ws).eq("status", "sent").gte("sent_at", since).limit(2000),
    supabase.from("outbound_messages").select("id, phone, body, sent_at").eq("workspace_id", ws).gte("sent_at", since).limit(2000),
  ]);
  return [
    ...(inb.data ?? []).map((m) => ({ id: m.id, phone: m.phone, body: m.body ?? "", at: m.received_at, dir: "in" as const, origin: "" })),
    ...(camp.data ?? []).map((m) => ({ id: m.id, phone: m.phone, body: m.body ?? "", at: m.sent_at ?? "", dir: "out" as const, origin: "Campanha" })),
    ...(out.data ?? []).map((m) => ({ id: m.id, phone: m.phone, body: m.body, at: m.sent_at, dir: "out" as const, origin: "Atendente" })),
  ].sort((a, b) => a.at.localeCompare(b.at));
}

const hour = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function ConversasPage() {
  const { current } = useWorkspace();
  const ws = current?.workspace.id ?? "";
  const qc = useQueryClient();
  const send = useServerFn(sendChatMessage);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const suggest = useServerFn(suggestChatReply);
  const [ai, setAi] = useState(false);
  const [intent, setIntent] = useState<{ phone: string; label: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const msgs = useQuery({ queryKey: ["chat", ws], queryFn: () => loadMessages(ws), enabled: !!ws, refetchInterval: 10000 });
  const contacts = useQuery({
    queryKey: ["chat-contacts", ws],
    enabled: !!ws,
    queryFn: async () => (await supabase.from("contacts").select("phone, name, status").eq("workspace_id", ws).limit(5000)).data ?? [],
  });
  const byPhone = useMemo(() => new Map((contacts.data ?? []).map((c) => [c.phone, c])), [contacts.data]);

  const threads = useMemo(() => {
    const m = new Map<string, Msg>();
    for (const x of msgs.data ?? []) m.set(x.phone, x);
    const s = q.trim().toLowerCase();
    return [...m.values()]
      .filter((t) => !s || t.phone.includes(s.replace(/\D/g, "") || "§") || (byPhone.get(t.phone)?.name ?? "").toLowerCase().includes(s))
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [msgs.data, q, byPhone]);

  const active = sel ?? threads[0]?.phone ?? null;
  const history = (msgs.data ?? []).filter((m) => m.phone === active);
  const contact = active ? byPhone.get(active) : undefined;
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [active, history.length]);

  async function askAi() {
    if (!active || history.length === 0) return;
    setAi(true);
    const r = await suggest({ data: { workspaceId: ws, name: contact?.name ?? undefined, history: history.slice(-20).map((m) => ({ dir: m.dir, body: m.body.slice(0, 4000) })) } });
    setAi(false);
    if (!r.ok) { toast.error(r.error); return; }
    setIntent({ phone: active, label: r.intent });
    setText(r.reply);
  }

  async function submit() {
    if (!active || !text.trim()) return;
    setBusy(true);
    const r = await send({ data: { workspaceId: ws, phone: active, body: text } });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setText("");
    qc.invalidateQueries({ queryKey: ["chat", ws] });
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Caixa de entrada" title="Conversas" description="Respostas dos clientes e mensagens enviadas nos últimos 60 dias. Atualiza a cada 10 segundos." />
      <div className="grid h-[70vh] min-h-[480px] overflow-hidden rounded-xl border bg-card md:grid-cols-[320px_1fr]">
        <aside className="flex min-h-0 flex-col border-r">
          <div className="relative border-b p-3">
            <Search className="absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome ou número" className="pl-8" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {msgs.isLoading && <Loader2 className="m-6 size-5 animate-spin text-muted-foreground" />}
            {!msgs.isLoading && threads.length === 0 && <p className="p-6 text-sm text-muted-foreground">Nenhuma conversa ainda.</p>}
            {threads.map((t) => {
              const c = byPhone.get(t.phone);
              return (
                <button key={t.phone} onClick={() => setSel(t.phone)} className={cn("flex w-full gap-3 border-b px-4 py-3 text-left hover:bg-muted/60", active === t.phone && "bg-muted")}>
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{(c?.name ?? "#").slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2"><span className="truncate text-sm font-medium">{c?.name || formatBrPhone(t.phone)}</span><span className="shrink-0 text-xs text-muted-foreground">{hour(t.at)}</span></div>
                    <p className={cn("truncate text-xs", t.dir === "in" ? "font-medium text-foreground" : "text-muted-foreground")}>{t.dir === "out" ? "Você: " : ""}{t.body}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
        <section className="flex min-h-0 flex-col">
          {!active ? (
            <div className="grid flex-1 place-items-center text-center text-muted-foreground"><div><MessagesSquare className="mx-auto mb-2 size-8" />Selecione uma conversa.</div></div>
          ) : (
            <>
              <header className="border-b px-5 py-3">
                <p className="flex items-center gap-2 font-medium">{contact?.name || formatBrPhone(active)}{intent?.phone === active && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">{intent.label}</span>}</p>
                <p className="text-xs text-muted-foreground">{formatBrPhone(active)}{contact && contact.status !== "active" ? " · não quer receber mensagens" : ""}</p>
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/30 p-5">
                {history.map((m) => (
                  <div key={m.dir + m.id} className={cn("flex", m.dir === "out" ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm", m.dir === "out" ? "bg-primary text-primary-foreground" : "bg-card")}>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className="mt-1 text-right text-[10px] opacity-70">{m.origin ? m.origin + " · " : ""}{hour(m.at)}</p>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <footer className="flex gap-2 border-t p-3">
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Escreva sua resposta…" className="resize-none"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }} />
                <Button variant="outline" onClick={askAi} disabled={ai || history.length === 0} className="self-end" title="Sugerir resposta com IA">
                  {ai ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                </Button>
                <Button onClick={submit} disabled={busy || !text.trim() || (!!contact && contact.status !== "active")} className="self-end">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
