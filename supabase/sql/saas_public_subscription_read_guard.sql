-- L&A Royal SaaS | Etapa #38 | 2026-11-06
-- Do not rely on asynchronous mirror-table cleanup to hide expired public stores.
-- The public read policy checks entitlement at query time.
-- The function is in a non-exposed schema and returns a boolean only.
create or replace function private.saas_public_store_visible(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
      from public.saas_tenants t
      join public.saas_store_themes th on th.tenant_id = t.id
      join public.saas_subscriptions s on s.tenant_id = t.id
     where t.id = p_tenant_id
       and t.active = true
       and t.onboarding_completed = true
       and th.published = true
       and s.status = 'active'
       and (s.current_period_end is null or s.current_period_end > now())
  )
$function$;

revoke all on function private.saas_public_store_visible(uuid) from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.saas_public_store_visible(uuid) to anon, authenticated;

-- RESTRICTIVE policies are AND-ed with existing permissive SELECT and ALL policies.
-- The old public_catalog active guard was permissive and therefore insufficient
-- as an additional policy beside the public SELECT (true) policy.
drop policy if exists saas_public_stores_subscription_read_guard on public.saas_public_stores;
create policy saas_public_stores_subscription_read_guard
on public.saas_public_stores as restrictive
for select to anon, authenticated
using (private.saas_public_store_visible(tenant_id));

drop policy if exists saas_public_catalog_subscription_read_guard on public.saas_public_catalog_items;
create policy saas_public_catalog_subscription_read_guard
on public.saas_public_catalog_items as restrictive
for select to anon, authenticated
using (private.saas_public_store_visible(tenant_id));
