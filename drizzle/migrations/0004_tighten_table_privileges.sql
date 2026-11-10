-- Reset inherited default privileges to exactly what each table needs.
REVOKE ALL ON public.whatsapp_gateways, public.whatsapp_gateway_secrets, public.whatsapp_instances,
  public.whatsapp_instance_secrets, public.whatsapp_events FROM anon, authenticated;
GRANT SELECT ON public.whatsapp_gateways TO authenticated;
GRANT SELECT ON public.whatsapp_instances TO authenticated;
GRANT UPDATE (display_name, daily_limit, warmup_enabled) ON public.whatsapp_instances TO authenticated;
GRANT SELECT ON public.whatsapp_events TO authenticated;

REVOKE ALL ON public.contacts, public.contact_lists, public.contact_list_members, public.contact_imports FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_lists TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.contact_list_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contact_imports TO authenticated;

REVOKE EXECUTE ON FUNCTION public.import_contacts_batch(uuid, jsonb), public.contact_list_stats(uuid), public.contact_tags(uuid) FROM anon;