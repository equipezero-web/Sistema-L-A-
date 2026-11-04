-- L&A Royal SaaS | Active tenant guard for usage telemetry
-- Applied in production Supabase on 2026-11-04.
-- Keeps the same RPC signature and returns no data.
create or replace function public.saas_record_usage(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or not exists (
      select 1
      from public.saas_tenants t
      where t.id = p_tenant_id and t.active is true
    )
    or not coalesce(
      public.saas_has_tenant_role(
        p_tenant_id,
        array[
          'owner'::public.saas_member_role,
          'admin'::public.saas_member_role,
          'employee'::public.saas_member_role
        ]
      ),
      false
    )
  then
    raise exception 'Acesso negado ou empresa desativada';
  end if;

  insert into public.saas_usage_minutes (tenant_id,user_id,minute_at)
  values (p_tenant_id, (select auth.uid()), date_trunc('minute',now()))
  on conflict do nothing;
end
$function$;
revoke all on function public.saas_record_usage(uuid) from public, anon;
grant execute on function public.saas_record_usage(uuid) to authenticated;
