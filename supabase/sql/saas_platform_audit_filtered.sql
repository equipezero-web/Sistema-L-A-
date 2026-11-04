-- Fonte versionada da consulta filtrada de auditoria do Super Admin.
-- A implementação foi aplicada ao Supabase. Este script é idempotente para outros ambientes.
-- Datas interpretadas pelo calendário local de Recife (America/Recife).
create or replace function public.saas_platform_audit_filtered(
 p_limit integer default 20,
 p_offset integer default 0,
 p_tenant_id uuid default null,
 p_action text default null,
 p_from date default null,
 p_to date default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
 if not public.saas_is_platform_super_admin() then
  raise exception 'Acesso administrativo negado';
 end if;
 if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 or p_offset > 100000 then
  raise exception 'Paginação inválida';
 end if;
 if p_action is not null and p_action not in ('suspend','reactivate','expel','restore') then
  raise exception 'Ação inválida';
 end if;
 if p_from is not null and p_to is not null and p_from > p_to then
  raise exception 'Período inválido';
 end if;
 with filtered as (
  select a.id, a.tenant_id, t.name as tenant_name, a.actor_id,
    coalesce(p.full_name,'Administrador') as actor_name,
    a.action, a.reason, a.created_at
  from public.saas_platform_actions a
  left join public.saas_tenants t on t.id=a.tenant_id
  left join public.saas_profiles p on p.user_id=a.actor_id
  where (p_tenant_id is null or a.tenant_id=p_tenant_id)
    and (p_action is null or a.action=p_action)
    and (p_from is null or a.created_at >= (p_from::timestamp at time zone 'America/Recife'))
    and (p_to is null or a.created_at < ((p_to+1)::timestamp at time zone 'America/Recife'))
 ), page as (
  select * from filtered order by created_at desc, id desc limit p_limit offset p_offset
 )
 select jsonb_build_object(
  'total',(select count(*) from filtered),
  'items',coalesce(
   (select jsonb_agg(to_jsonb(pg) order by pg.created_at desc, pg.id desc) from page pg),
   '[]'::jsonb)
 ) into v_result;
 return v_result;
end
$function$;

revoke all on function public.saas_platform_audit_filtered(integer,integer,uuid,text,date,date)
 from public,anon,authenticated;
grant execute on function public.saas_platform_audit_filtered(integer,integer,uuid,text,date,date)
 to authenticated;

create index if not exists saas_platform_actions_tenant_created_idx
 on public.saas_platform_actions (tenant_id,created_at desc,id desc);
create index if not exists saas_platform_actions_action_created_idx
 on public.saas_platform_actions (action,created_at desc,id desc);
