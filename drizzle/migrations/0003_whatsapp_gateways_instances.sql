-- GATEWAY (one per workspace). Public part readable by members; key lives in a server-only table.
CREATE TABLE public.whatsapp_gateways (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'evolution' CHECK (provider IN ('evolution')),
  base_url text NOT NULL CHECK (base_url ~ '^https?://' AND char_length(base_url) <= 300),
  api_key_hint text CHECK (api_key_hint IS NULL OR char_length(api_key_hint) <= 12),
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'ok', 'error')),
  provider_version text,
  last_error text,
  last_checked_at timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_gateways TO authenticated;
GRANT ALL ON public.whatsapp_gateways TO service_role;
ALTER TABLE public.whatsapp_gateways ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER whatsapp_gateways_updated_at BEFORE UPDATE ON public.whatsapp_gateways
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Membros veem o gateway" ON public.whatsapp_gateways
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

CREATE TABLE public.whatsapp_gateway_secrets (
  workspace_id uuid PRIMARY KEY REFERENCES public.whatsapp_gateways(workspace_id) ON DELETE CASCADE,
  api_key_enc text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_gateway_secrets TO service_role;
ALTER TABLE public.whatsapp_gateway_secrets ENABLE ROW LEVEL SECURITY;
-- no policies: only the server (service role) can read or write

-- INSTANCES (one per WhatsApp number)
CREATE TABLE public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_instance text NOT NULL UNIQUE CHECK (provider_instance ~ '^[a-z0-9-]{3,64}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connecting', 'connected')),
  phone_number text,
  profile_name text,
  profile_pic_url text,
  qr_code text,
  pairing_code text,
  qr_updated_at timestamptz,
  daily_limit integer NOT NULL DEFAULT 200 CHECK (daily_limit BETWEEN 1 AND 5000),
  warmup_enabled boolean NOT NULL DEFAULT true,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  webhook_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_instances_ws_idx ON public.whatsapp_instances(workspace_id, created_at);
GRANT SELECT ON public.whatsapp_instances TO authenticated;
GRANT UPDATE (display_name, daily_limit, warmup_enabled) ON public.whatsapp_instances TO authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER whatsapp_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Membros veem instâncias" ON public.whatsapp_instances
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Admins ajustam instâncias" ON public.whatsapp_instances
  FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, 'admin'))
  WITH CHECK (public.has_workspace_role(workspace_id, 'admin'));

CREATE TABLE public.whatsapp_instance_secrets (
  instance_id uuid PRIMARY KEY REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  instance_token_enc text,
  webhook_token_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_instance_secrets TO service_role;
ALTER TABLE public.whatsapp_instance_secrets ENABLE ROW LEVEL SECURITY;
-- no policies: server only

-- Connection history (audit + number health later)
CREATE TABLE public.whatsapp_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_events_instance_idx ON public.whatsapp_events(instance_id, created_at DESC);
GRANT SELECT ON public.whatsapp_events TO authenticated;
GRANT ALL ON public.whatsapp_events TO service_role;
ALTER TABLE public.whatsapp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem eventos" ON public.whatsapp_events
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

-- Live status on the WhatsApp screen
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_instances;