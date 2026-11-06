-- L&A Royal SaaS: etapa #41 (2026-11-06)
-- Explicit callable roles for sensitive platform RPCs.
-- The authenticated role contains both regular users and Super Admins.
-- Execution remains subject to the server-side saas_is_platform_super_admin()
-- check (profile privilege AND a verified AAL2 session) in each function.
-- This migration does not weaken RLS or SECURITY DEFINER protections.
revoke execute on function public.saas_platform_audit(integer,integer) from public, anon, authenticated;
grant execute on function public.saas_platform_audit(integer,integer) to authenticated;

revoke execute on function public.saas_platform_audit_filtered(integer,integer,uuid,text,date,date) from public, anon, authenticated;
grant execute on function public.saas_platform_audit_filtered(integer,integer,uuid,text,date,date) to authenticated;

revoke execute on function public.saas_platform_expel_tenant(uuid,text) from public, anon, authenticated;
grant execute on function public.saas_platform_expel_tenant(uuid,text) to authenticated;

revoke execute on function public.saas_platform_restore_owner(uuid,text) from public, anon, authenticated;
grant execute on function public.saas_platform_restore_owner(uuid,text) to authenticated;

revoke execute on function public.saas_platform_set_tenant_active(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.saas_platform_set_tenant_active(uuid,boolean,text) to authenticated;

revoke execute on function public.saas_platform_tenants() from public, anon, authenticated;
grant execute on function public.saas_platform_tenants() to authenticated;

-- Never grant direct SQL access to privileged administrative records.
-- No RLS policies exist for these internal tables by design; they are
-- read/written only by guarded SECURITY DEFINER routines.
revoke all on table public.saas_platform_actions from public, anon, authenticated;
revoke all on table public.saas_usage_minutes from public, anon, authenticated;
