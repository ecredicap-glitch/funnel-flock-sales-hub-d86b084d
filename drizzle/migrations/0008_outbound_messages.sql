CREATE TABLE public.outbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone text NOT NULL,
  body text NOT NULL,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbound_messages_ws_idx ON public.outbound_messages(workspace_id, phone, sent_at DESC);
REVOKE ALL ON public.outbound_messages FROM anon, authenticated;
GRANT SELECT ON public.outbound_messages TO authenticated;
GRANT ALL ON public.outbound_messages TO service_role;
ALTER TABLE public.outbound_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read outbound" ON public.outbound_messages FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));