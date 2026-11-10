import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ContactStatus = Database["public"]["Enums"]["contact_status"];
export type ContactList = Database["public"]["Tables"]["contact_lists"]["Row"];
export type ContactImport = Database["public"]["Tables"]["contact_imports"]["Row"];

export const STATUS_LABEL: Record<ContactStatus, string> = {
  active: "Ativo",
  blocked: "Bloqueado",
  unsubscribed: "Descadastrado",
};

export const PAGE_SIZE = 50;

export type ConsentFilter = "all" | "eligible" | "no_optin";

export type ContactFilters = {
  search: string;
  listId: string | null;
  tag: string | null;
  consent: ConsentFilter;
  page: number;
};

const CONTACT_COLUMNS =
  "id, name, phone, email, tags, custom_fields, opt_in_at, opt_in_source, status, status_reason, status_changed_at, eligible, created_at, lists:contact_list_members(list_id)";

export type ContactRow = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  tags: string[];
  custom_fields: Record<string, string>;
  opt_in_at: string | null;
  opt_in_source: string | null;
  status: ContactStatus;
  status_reason: string | null;
  status_changed_at: string | null;
  eligible: boolean | null;
  created_at: string;
  lists: { list_id: string }[];
};

/** Removes characters with meaning in PostgREST filter syntax. */
export function sanitizeSearch(s: string) {
  return s
    .replace(/[,()%*\\:"']/g, " ")
    .trim()
    .slice(0, 80);
}

export const contactsQuery = (
  workspaceId: string,
  f: ContactFilters,
  mode: "active" | "inactive" = "active",
) =>
  queryOptions({
    queryKey: ["contacts", workspaceId, mode, f],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const select = f.listId
        ? `${CONTACT_COLUMNS}, inlist:contact_list_members!inner(list_id)`
        : CONTACT_COLUMNS;
      let q = supabase
        .from("contacts")
        .select(select, { count: "exact" })
        .eq("workspace_id", workspaceId);
      q = mode === "active" ? q.eq("status", "active") : q.neq("status", "active");
      if (f.listId) q = q.eq("inlist.list_id", f.listId);
      if (f.tag) q = q.contains("tags", [f.tag]);
      if (f.consent === "eligible") q = q.not("opt_in_at", "is", null);
      if (f.consent === "no_optin") q = q.is("opt_in_at", null);
      const s = sanitizeSearch(f.search);
      if (s) {
        const digits = s.replace(/\D/g, "");
        const parts = [`name.ilike.%${s}%`, `email.ilike.%${s}%`];
        if (digits.length >= 3) parts.push(`phone.like.%${digits}%`);
        q = q.or(parts.join(","));
      }
      const from = f.page * PAGE_SIZE;
      const { data, error, count } = await q
        .order(mode === "active" ? "created_at" : "status_changed_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as ContactRow[], count: count ?? 0 };
    },
  });

export const listsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["contact-lists", workspaceId],
    queryFn: async () => {
      const [lists, stats] = await Promise.all([
        supabase.from("contact_lists").select("*").eq("workspace_id", workspaceId).order("name"),
        supabase.rpc("contact_list_stats", { _workspace_id: workspaceId }),
      ]);
      if (lists.error) throw lists.error;
      if (stats.error) throw stats.error;
      const byId = new Map((stats.data ?? []).map((s) => [s.list_id, s]));
      return (lists.data ?? []).map((l) => ({
        ...l,
        total: Number(byId.get(l.id)?.total ?? 0),
        eligible: Number(byId.get(l.id)?.eligible ?? 0),
      }));
    },
  });

export type ListWithStats = Awaited<
  ReturnType<NonNullable<ReturnType<typeof listsQuery>["queryFn"]>>
>[number];

export const tagsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["contact-tags", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contact_tags", { _workspace_id: workspaceId });
      if (error) throw error;
      return (data ?? []).map((t) => t.tag);
    },
  });

export const importsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["contact-imports", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_imports")
        .select("*, list:contact_lists(name)")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

export const contactCountsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["contacts", workspaceId, "counts"],
    queryFn: async () => {
      const base = () =>
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId);
      const [total, eligible, inactive] = await Promise.all([
        base().eq("status", "active"),
        base().eq("eligible", true),
        base().neq("status", "active"),
      ]);
      const err = total.error ?? eligible.error ?? inactive.error;
      if (err) throw err;
      return {
        active: total.count ?? 0,
        eligible: eligible.count ?? 0,
        inactive: inactive.count ?? 0,
      };
    },
  });

/** Everything that depends on contacts data, to refresh after writes. */
export const CONTACT_KEYS = [
  ["contacts"],
  ["contact-lists"],
  ["contact-tags"],
  ["contact-imports"],
] as const;
