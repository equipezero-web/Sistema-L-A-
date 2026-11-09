-- L&A Royal SaaS — etapa 48
-- Public Data API entrypoints remain SECURITY INVOKER.
-- The minimum necessary privileged reads are delegated to private functions.
-- Existing JSON response contracts and authorization rules are preserved.

create or replace function private.saas_manager_product_costs(p_tenant_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null
     or not (
       public.saas_has_tenant_role(
         p_tenant_id,
         array['owner'::public.saas_member_role,'admin'::public.saas_member_role]
       )
       or public.saas_is_platform_super_admin()
     )
  then raise exception 'Sem permissão para consultar custos de produtos'; end if;
  if not exists (
    select 1 from public.saas_tenants t where t.id=p_tenant_id and t.active is true
  ) then raise exception 'Empresa desativada'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'cost',p.cost)),'[]'::jsonb)
    into v_result from public.saas_products p where p.tenant_id=p_tenant_id;
  return v_result;
end;
$$;

create or replace function public.saas_manager_product_costs(p_tenant_id uuid)
returns jsonb
language sql volatile security invoker set search_path=''
as $$
  select private.saas_manager_product_costs(p_tenant_id);
$$;

create or replace function private.saas_my_access_summary()
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when (select auth.uid()) is null then null::jsonb
  else jsonb_build_object(
    'has_any_membership',exists(select 1 from public.saas_members m where m.user_id=(select auth.uid())),
    'has_owned_tenant',exists(select 1 from public.saas_tenants t where t.owner_user_id=(select auth.uid())),
    'is_platform_super_admin',exists(select 1 from public.saas_profiles p where p.user_id=(select auth.uid()) and p.is_platform_super_admin=true)
  ) end;
$$;

create or replace function public.saas_my_access_summary()
returns jsonb
language sql stable security invoker set search_path=''
as $$
  select private.saas_my_access_summary();
$$;

create or replace function private.saas_my_platform_notice()
returns jsonb
language sql stable security definer set search_path=''
as $$
  select to_jsonb(n)
  from public.saas_platform_notices n
  join public.saas_tenants t on t.id=n.tenant_id
  where t.owner_user_id=(select auth.uid())
  order by n.created_at desc,n.id desc
  limit 1;
$$;

create or replace function public.saas_my_platform_notice()
returns jsonb
language sql stable security invoker set search_path=''
as $$
  select private.saas_my_platform_notice();
$$;

revoke all on function private.saas_manager_product_costs(uuid) from public,anon,authenticated;
revoke all on function private.saas_my_access_summary() from public,anon,authenticated;
revoke all on function private.saas_my_platform_notice() from public,anon,authenticated;
grant execute on function private.saas_manager_product_costs(uuid) to authenticated;
grant execute on function private.saas_my_access_summary() to authenticated;
grant execute on function private.saas_my_platform_notice() to authenticated;

revoke all on function public.saas_manager_product_costs(uuid) from public,anon,authenticated;
revoke all on function public.saas_my_access_summary() from public,anon,authenticated;
revoke all on function public.saas_my_platform_notice() from public,anon,authenticated;
grant execute on function public.saas_manager_product_costs(uuid) to authenticated;
grant execute on function public.saas_my_access_summary() to authenticated;
grant execute on function public.saas_my_platform_notice() to authenticated;
