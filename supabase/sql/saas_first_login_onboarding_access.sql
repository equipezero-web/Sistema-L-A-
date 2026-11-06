-- L&A Royal SaaS | Onboarding flow and access routing
-- Deployed and transaction-tested in Supabase, 2026-11-06.
-- A new authenticated account is redirected to onboarding only when it has
-- never held a membership or owned a tenant. No cross-user data is returned.

CREATE OR REPLACE FUNCTION public.saas_my_access_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when (select auth.uid()) is null then null::jsonb
  else jsonb_build_object(
    'has_any_membership',exists(select 1 from public.saas_members m where m.user_id=(select auth.uid())),
    'has_owned_tenant',exists(select 1 from public.saas_tenants t where t.owner_user_id=(select auth.uid())),
    'is_platform_super_admin',exists(select 1 from public.saas_profiles p where p.user_id=(select auth.uid()) and p.is_platform_super_admin=true)
  ) end
$function$

CREATE OR REPLACE FUNCTION public.saas_onboard_company(p_name text, p_slug text, p_business_mode saas_business_mode, p_business_type text, p_logo_url text DEFAULT NULL::text, p_primary_color text DEFAULT '#C9A227'::text, p_secondary_color text DEFAULT '#111111'::text, p_background_color text DEFAULT '#FFFFFF'::text, p_text_color text DEFAULT '#111111'::text, p_font_style text DEFAULT 'Inter'::text, p_layout_id text DEFAULT 'royal-classic'::text, p_publish boolean DEFAULT false)
 RETURNS saas_tenants
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_tenant_id uuid;
  v_tenant public.saas_tenants;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if p_business_type is null or length(trim(p_business_type))<2 then
    raise exception 'business type is required';
  end if;
  v_tenant_id:=public.saas_create_tenant(p_name,p_slug,p_business_mode);
  v_tenant:=public.saas_complete_onboarding(
    v_tenant_id,p_business_type,p_logo_url,p_primary_color,p_secondary_color,
    p_background_color,p_text_color,p_font_style,p_layout_id,p_publish
  );
  return v_tenant;
end;
$function$

revoke all on function public.saas_my_access_summary() from public, anon, authenticated;
grant execute on function public.saas_my_access_summary() to authenticated;
