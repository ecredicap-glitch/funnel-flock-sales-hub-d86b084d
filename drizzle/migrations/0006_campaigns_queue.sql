CREATE TYPE public.campaign_status AS ENUM ('draft','running','paused','completed','cancelled');
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  list_id uuid REFERENCES public.contact_lists(id) ON DELETE SET NULL,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  body text NOT NULL,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  pause_reason text,
  min_interval_s int NOT NULL DEFAULT 15 CHECK (min_interval_s >= 5),
  max_interval_s int NOT NULL DEFAULT 45,
  batch_size int NOT NULL DEFAULT 20,
  batch_pause_min int NOT NULL DEFAULT 3,
  batch_pause_max int NOT NULL DEFAULT 8,
  daily_limit int NOT NULL DEFAULT 20 CHECK (daily_limit BETWEEN 1 AND 1000),
  window_start int NOT NULL DEFAULT 8,
  window_end int NOT NULL DEFAULT 19,
  window_days int[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  dedupe_days int NOT NULL DEFAULT 7,
  next_send_at timestamptz,
  sent_in_batch int NOT NULL DEFAULT 0,
  total int NOT NULL DEFAULT 0,
  sent int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.campaigns FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.campaigns TO authenticated;
GRANT UPDATE (name, status, pause_reason) ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem campanhas" ON public.campaigns FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Membros criam campanhas" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id) AND status = 'draft' AND total = 0 AND sent = 0 AND failed = 0);
CREATE POLICY "Membros editam campanhas" ON public.campaigns FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id) AND status <> 'completed');
CREATE POLICY "Admins excluem campanhas" ON public.campaigns FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id,'admin'));

CREATE TYPE public.message_status AS ENUM ('queued','sent','failed','skipped');
CREATE TABLE public.campaign_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone text NOT NULL,
  body text,
  status public.message_status NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, phone)
);
REVOKE ALL ON public.campaign_messages FROM anon, authenticated;
GRANT SELECT ON public.campaign_messages TO authenticated;
GRANT ALL ON public.campaign_messages TO service_role;
ALTER TABLE public.campaign_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem mensagens" ON public.campaign_messages FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE INDEX campaign_messages_queue_idx ON public.campaign_messages(campaign_id, status, created_at);
CREATE INDEX campaign_messages_ws_sent_idx ON public.campaign_messages(workspace_id, sent_at);

-- Enqueue only eligible (opt-in, active) contacts of the list, skipping recently messaged phones.
CREATE OR REPLACE FUNCTION public.enqueue_campaign(_campaign_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.campaigns; n integer;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id = _campaign_id;
  IF c.id IS NULL OR NOT public.is_workspace_member(c.workspace_id) THEN RAISE EXCEPTION 'Campanha não encontrada'; END IF;
  IF c.status <> 'draft' OR c.total > 0 THEN RAISE EXCEPTION 'Campanha já preparada'; END IF;
  INSERT INTO public.campaign_messages (workspace_id, campaign_id, contact_id, phone)
  SELECT DISTINCT ON (ct.phone) c.workspace_id, c.id, ct.id, ct.phone
  FROM public.contact_list_members m JOIN public.contacts ct ON ct.id = m.contact_id
  WHERE m.list_id = c.list_id AND ct.workspace_id = c.workspace_id AND ct.eligible = true
    AND NOT EXISTS (SELECT 1 FROM public.campaign_messages cm WHERE cm.workspace_id = c.workspace_id
      AND cm.phone = ct.phone AND cm.status = 'sent' AND cm.sent_at > now() - make_interval(days => c.dedupe_days))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.campaigns SET total = n WHERE id = c.id;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_campaign(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_campaign(uuid) TO authenticated;