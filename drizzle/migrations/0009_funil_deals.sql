CREATE TYPE public.deal_stage AS ENUM ('novo','contatado','respondeu','interessado','proposta','fechado','perdido');

CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  stage public.deal_stage NOT NULL DEFAULT 'novo',
  value numeric(12,2),
  product text CHECK (product IS NULL OR char_length(product) <= 60),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  owner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, contact_id)
);
CREATE INDEX deals_ws_stage_idx ON public.deals(workspace_id, stage, updated_at DESC);

REVOKE ALL ON public.deals FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read deals" ON public.deals FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "members insert deals" ON public.deals FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id) AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND c.workspace_id = deals.workspace_id));
CREATE POLICY "members update deals" ON public.deals FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "members delete deals" ON public.deals FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id));

CREATE OR REPLACE FUNCTION public.deals_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.workspace_id := OLD.workspace_id;
  NEW.contact_id := OLD.contact_id;
  RETURN NEW;
END $$;
CREATE TRIGGER deals_touch BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.deals_touch();

CREATE OR REPLACE FUNCTION public.deals_on_campaign_sent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sent' AND NEW.contact_id IS NOT NULL AND (OLD.status IS DISTINCT FROM 'sent') THEN
    INSERT INTO public.deals (workspace_id, contact_id, stage) VALUES (NEW.workspace_id, NEW.contact_id, 'contatado')
    ON CONFLICT (workspace_id, contact_id) DO UPDATE SET stage = 'contatado' WHERE public.deals.stage = 'novo';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deals_on_campaign_sent AFTER UPDATE OF status ON public.campaign_messages FOR EACH ROW EXECUTE FUNCTION public.deals_on_campaign_sent();

CREATE OR REPLACE FUNCTION public.deals_on_inbound() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.opt_out THEN
    INSERT INTO public.deals (workspace_id, contact_id, stage) VALUES (NEW.workspace_id, NEW.contact_id, 'perdido')
    ON CONFLICT (workspace_id, contact_id) DO UPDATE SET stage = 'perdido' WHERE public.deals.stage <> 'fechado';
  ELSE
    INSERT INTO public.deals (workspace_id, contact_id, stage) VALUES (NEW.workspace_id, NEW.contact_id, 'respondeu')
    ON CONFLICT (workspace_id, contact_id) DO UPDATE SET stage = 'respondeu' WHERE public.deals.stage IN ('novo','contatado');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deals_on_inbound AFTER INSERT ON public.inbound_messages FOR EACH ROW EXECUTE FUNCTION public.deals_on_inbound();

REVOKE EXECUTE ON FUNCTION public.deals_on_campaign_sent() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deals_on_inbound() FROM PUBLIC, anon, authenticated;

INSERT INTO public.deals (workspace_id, contact_id, stage)
SELECT DISTINCT workspace_id, contact_id, 'contatado'::public.deal_stage FROM public.campaign_messages WHERE status = 'sent' AND contact_id IS NOT NULL
ON CONFLICT (workspace_id, contact_id) DO NOTHING;
INSERT INTO public.deals (workspace_id, contact_id, stage)
SELECT DISTINCT workspace_id, contact_id, (CASE WHEN bool_or(opt_out) THEN 'perdido' ELSE 'respondeu' END)::public.deal_stage
FROM public.inbound_messages WHERE contact_id IS NOT NULL GROUP BY workspace_id, contact_id
ON CONFLICT (workspace_id, contact_id) DO UPDATE SET stage = EXCLUDED.stage WHERE public.deals.stage IN ('novo','contatado');