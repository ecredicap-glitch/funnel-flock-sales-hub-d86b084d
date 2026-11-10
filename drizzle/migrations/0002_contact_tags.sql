-- Distinct tags used in a workspace (for filters and suggestions)
CREATE OR REPLACE FUNCTION public.contact_tags(_workspace_id uuid)
RETURNS TABLE (tag text, total bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT t, count(*) FROM public.contacts c, unnest(c.tags) AS t
  WHERE c.workspace_id = _workspace_id
  GROUP BY t ORDER BY count(*) DESC, t
  LIMIT 200
$$;
REVOKE ALL ON FUNCTION public.contact_tags(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contact_tags(uuid) TO authenticated;