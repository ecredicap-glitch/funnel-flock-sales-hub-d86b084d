-- Contact status: active (can receive if opted-in), blocked (by the team), unsubscribed (by the contact)
CREATE TYPE public.contact_status AS ENUM ('active', 'blocked', 'unsubscribed');

-- CONTACTS
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  phone text NOT NULL CHECK (phone ~ '^55[1-9][0-9][0-9]{8,9}$'),
  name text CHECK (name IS NULL OR char_length(name) <= 120),
  email text CHECK (email IS NULL OR char_length(email) <= 254),
  tags text[] NOT NULL DEFAULT '{}',
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  opt_in_at timestamptz,
  opt_in_source text CHECK (opt_in_source IS NULL OR char_length(opt_in_source) <= 200),
  status public.contact_status NOT NULL DEFAULT 'active',
  status_reason text CHECK (status_reason IS NULL OR char_length(status_reason) <= 300),
  status_changed_at timestamptz,
  eligible boolean GENERATED ALWAYS AS (status = 'active' AND opt_in_at IS NOT NULL) STORED,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, phone)
);
CREATE INDEX contacts_ws_created_idx ON public.contacts(workspace_id, created_at DESC);
CREATE INDEX contacts_ws_status_idx ON public.contacts(workspace_id, status);
CREATE INDEX contacts_tags_idx ON public.contacts USING gin(tags);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Membros veem contatos" ON public.contacts
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Membros criam contatos" ON public.contacts
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Membros editam contatos" ON public.contacts
  FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Admins excluem contatos" ON public.contacts
  FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, 'admin'));

-- Status/consent bookkeeping
CREATE OR REPLACE FUNCTION public.contacts_status_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := coalesce(NEW.created_by, auth.uid());
    IF NEW.status <> 'active' THEN NEW.status_changed_at := now(); END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
    -- Reactivating an unsubscribed contact requires a fresh opt-in
    IF OLD.status = 'unsubscribed' AND NEW.status = 'active'
       AND (NEW.opt_in_at IS NULL OR NEW.opt_in_at <= OLD.status_changed_at) THEN
      RAISE EXCEPTION 'Para reativar um contato descadastrado, registre um novo opt-in.';
    END IF;
    IF NEW.status = 'active' THEN NEW.status_reason := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contacts_status_guard BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_status_guard();

-- LISTS
CREATE TABLE public.contact_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 300),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_lists_ws_idx ON public.contact_lists(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_lists TO authenticated;
GRANT ALL ON public.contact_lists TO service_role;
ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER contact_lists_updated_at BEFORE UPDATE ON public.contact_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Membros veem listas" ON public.contact_lists
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Membros criam listas" ON public.contact_lists
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Membros editam listas" ON public.contact_lists
  FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Membros excluem listas" ON public.contact_lists
  FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id));

-- LIST MEMBERSHIP
CREATE TABLE public.contact_list_members (
  list_id uuid NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, contact_id)
);
CREATE INDEX contact_list_members_contact_idx ON public.contact_list_members(contact_id);
GRANT SELECT, INSERT, DELETE ON public.contact_list_members TO authenticated;
GRANT ALL ON public.contact_list_members TO service_role;
ALTER TABLE public.contact_list_members ENABLE ROW LEVEL SECURITY;

-- list and contact must belong to the row's workspace
CREATE OR REPLACE FUNCTION public.contact_list_members_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.contact_lists WHERE id = NEW.list_id AND workspace_id = NEW.workspace_id)
     OR NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = NEW.contact_id AND workspace_id = NEW.workspace_id) THEN
    RAISE EXCEPTION 'Lista e contato precisam ser do mesmo workspace.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contact_list_members_guard BEFORE INSERT ON public.contact_list_members
  FOR EACH ROW EXECUTE FUNCTION public.contact_list_members_guard();

CREATE POLICY "Membros veem membros de listas" ON public.contact_list_members
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Membros adicionam a listas" ON public.contact_list_members
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Membros removem de listas" ON public.contact_list_members
  FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id));

-- IMPORT HISTORY (audit trail of each spreadsheet)
CREATE TABLE public.contact_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  list_id uuid REFERENCES public.contact_lists(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  opt_in_mode text NOT NULL CHECK (opt_in_mode IN ('all', 'column', 'none')),
  opt_in_source text CHECK (opt_in_source IS NULL OR char_length(opt_in_source) <= 200),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'failed')),
  total_rows integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  invalid integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (opt_in_mode <> 'all' OR opt_in_source IS NOT NULL)
);
CREATE INDEX contact_imports_ws_idx ON public.contact_imports(workspace_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.contact_imports TO authenticated;
GRANT ALL ON public.contact_imports TO service_role;
ALTER TABLE public.contact_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem importações" ON public.contact_imports
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Membros criam importações" ON public.contact_imports
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id) AND created_by = auth.uid());
CREATE POLICY "Autor finaliza a importação" ON public.contact_imports
  FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id) AND created_by = auth.uid())
  WITH CHECK (public.is_workspace_member(workspace_id) AND created_by = auth.uid());

-- Batch import. Runs as the caller (RLS applies). Never clears consent nor
-- reactivates blocked/unsubscribed contacts; merges tags and custom fields.
-- _rows: [{phone, name?, email?, tags?: text[], custom?: {}, opt_in?: bool, opt_in_at?: timestamptz}]
CREATE OR REPLACE FUNCTION public.import_contacts_batch(_import_id uuid, _rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  imp public.contact_imports%ROWTYPE;
  r jsonb;
  v_phone text;
  v_opt boolean;
  v_opt_at timestamptz;
  v_tags text[];
  v_id uuid;
  v_inserted boolean;
  n_ins integer := 0;
  n_upd integer := 0;
  n_bad integer := 0;
BEGIN
  SELECT * INTO imp FROM public.contact_imports WHERE id = _import_id;
  IF NOT FOUND OR imp.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'Importação não encontrada.';
  END IF;
  IF imp.status <> 'processing' THEN
    RAISE EXCEPTION 'Importação já finalizada.';
  END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) > 1000 THEN
    RAISE EXCEPTION 'Envie no máximo 1000 linhas por lote.';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    v_phone := r->>'phone';
    IF v_phone IS NULL OR v_phone !~ '^55[1-9][0-9][0-9]{8,9}$' THEN
      n_bad := n_bad + 1;
      CONTINUE;
    END IF;

    v_opt := CASE imp.opt_in_mode
      WHEN 'all' THEN true
      WHEN 'column' THEN coalesce((r->>'opt_in')::boolean, false)
      ELSE false END;
    v_opt_at := CASE WHEN v_opt THEN least(coalesce((r->>'opt_in_at')::timestamptz, now()), now()) END;
    v_tags := ARRAY(
      SELECT DISTINCT left(trim(t), 40) FROM (
        SELECT jsonb_array_elements_text(coalesce(r->'tags', '[]'::jsonb)) AS t
        UNION ALL SELECT unnest(imp.tags)
      ) s WHERE trim(t) <> ''
    );

    INSERT INTO public.contacts AS c
      (workspace_id, phone, name, email, tags, custom_fields, opt_in_at, opt_in_source)
    VALUES (
      imp.workspace_id, v_phone,
      nullif(left(trim(r->>'name'), 120), ''),
      nullif(left(lower(trim(r->>'email')), 254), ''),
      v_tags,
      coalesce(r->'custom', '{}'::jsonb),
      v_opt_at,
      CASE WHEN v_opt THEN coalesce(imp.opt_in_source, 'Planilha: ' || imp.file_name) END
    )
    ON CONFLICT (workspace_id, phone) DO UPDATE SET
      name = coalesce(EXCLUDED.name, c.name),
      email = coalesce(EXCLUDED.email, c.email),
      tags = ARRAY(SELECT DISTINCT unnest(c.tags || EXCLUDED.tags)),
      custom_fields = c.custom_fields || EXCLUDED.custom_fields,
      opt_in_at = coalesce(c.opt_in_at, EXCLUDED.opt_in_at),
      opt_in_source = CASE WHEN c.opt_in_at IS NULL THEN EXCLUDED.opt_in_source ELSE c.opt_in_source END
    RETURNING c.id, (xmax = 0) INTO v_id, v_inserted;

    IF v_inserted THEN n_ins := n_ins + 1; ELSE n_upd := n_upd + 1; END IF;

    IF imp.list_id IS NOT NULL THEN
      INSERT INTO public.contact_list_members (list_id, contact_id, workspace_id)
      VALUES (imp.list_id, v_id, imp.workspace_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  UPDATE public.contact_imports
     SET inserted = inserted + n_ins, updated = updated + n_upd, invalid = invalid + n_bad
   WHERE id = _import_id;

  RETURN jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'invalid', n_bad);
END;
$$;
REVOKE ALL ON FUNCTION public.import_contacts_batch(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_contacts_batch(uuid, jsonb) TO authenticated;

-- Per-list counters for the lists screen
CREATE OR REPLACE FUNCTION public.contact_list_stats(_workspace_id uuid)
RETURNS TABLE (list_id uuid, total bigint, eligible bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT m.list_id, count(*), count(*) FILTER (WHERE c.eligible)
  FROM public.contact_list_members m
  JOIN public.contacts c ON c.id = m.contact_id
  WHERE m.workspace_id = _workspace_id
  GROUP BY m.list_id
$$;
REVOKE ALL ON FUNCTION public.contact_list_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contact_list_stats(uuid) TO authenticated;