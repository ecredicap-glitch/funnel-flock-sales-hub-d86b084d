ALTER TABLE public.campaign_messages ADD COLUMN IF NOT EXISTS replied_at timestamptz;
CREATE TABLE public.inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone text NOT NULL,
  provider_message_id text,
  body text,
  opt_out boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, provider_message_id)
);
CREATE INDEX inbound_messages_ws_idx ON public.inbound_messages(workspace_id, received_at DESC);
REVOKE ALL ON public.inbound_messages FROM anon, authenticated;
GRANT SELECT ON public.inbound_messages TO authenticated;
GRANT ALL ON public.inbound_messages TO service_role;
ALTER TABLE public.inbound_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read inbound" ON public.inbound_messages FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));