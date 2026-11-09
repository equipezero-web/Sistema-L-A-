-- L&A Royal SaaS — Etapa #49
-- Harden all seven remaining authenticated-callable public SECURITY DEFINER RPCs.
-- Preserve the existing audited PL/pgSQL bodies, signatures, parameter defaults,
-- result types, authorization rules, and audit behavior without rewriting them.
-- The privileged implementations live in the non-API private schema.
do $migration$
declare
  v_item record;
  v_oid oid;
  v_definition text;
  v_name text;
begin
  for v_item in
    select * from (values
      ('saas_platform_audit', 'integer,integer'),
      ('saas_platform_audit_filtered','integer,integer,uuid,text,date,date'),
      ('saas_platform_expel_tenant','uuid,text'),
      ('saas_platform_restore_owner','uuid,text'),
      ('saas_platform_set_tenant_active','uuid,boolean,text'),
      ('saas_platform_tenants',''),
      ('saas_record_usage','uuid')
    ) as names(name,args)
  loop
    v_name := v_item.name;
    v_oid := to_regprocedure(format('public.%I(%s)',v_name,v_item.args));
    if v_oid is null then
      raise exception 'Missing privileged RPC: %',v_name;
    end if;
    if not (select p.prosecdef and n.nspname='public'
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where p.oid=v_oid) then
      raise exception 'Unexpected function security state: %',v_name;
    end if;
    if to_regprocedure(format('private.%I(%s)',v_name,v_item.args)) is not null then
      raise exception 'Private RPC already exists: %',v_name;
    end if;
    v_definition:=pg_get_functiondef(v_oid);
    if position('SECURITY DEFINER' in v_definition)=0
       or position('SET search_path TO ''''' in v_definition)=0 then
      raise exception 'Unexpected definer/search_path for %',v_name;
    end if;
    v_definition:=replace(
      v_definition,
      'FUNCTION public.'||v_name||'(',
      'FUNCTION private.'||v_name||'('
    );
    if position('FUNCTION private.'||v_name||'(' in v_definition)=0 then
      raise exception 'Could not privatize function %',v_name;
    end if;
    execute v_definition;
  end loop;
end;
$migration$;

-- SQL SECURITY INVOKER API facades preserve existing PostgREST signatures.
create or replace function public.saas_platform_audit(
  p_limit integer default 50, p_offset integer default 0
) returns jsonb
language sql volatile security invoker set search_path=''
as $$ select private.saas_platform_audit(p_limit,p_offset); $$;

create or replace function public.saas_platform_audit_filtered(
  p_limit integer default 20, p_offset integer default 0,
  p_tenant_id uuid default null::uuid,
  p_action text default null::text,
  p_from date default null::date,
  p_to date default null::date
) returns jsonb
language sql volatile security invoker set search_path=''
as $$ select private.saas_platform_audit_filtered(p_limit,p_offset,p_tenant_id,p_action,p_from,p_to); $$;

create or replace function public.saas_platform_expel_tenant(
  p_tenant_id uuid, p_reason text
) returns void
language sql volatile security invoker set search_path=''
as $$ select private.saas_platform_expel_tenant(p_tenant_id,p_reason); $$;

create or replace function public.saas_platform_restore_owner(
  p_tenant_id uuid, p_reason text
) returns void
language sql volatile security invoker set search_path=''
as $$ select private.saas_platform_restore_owner(p_tenant_id,p_reason); $$;

create or replace function public.saas_platform_set_tenant_active(
  p_tenant_id uuid, p_active boolean, p_reason text
) returns void
language sql volatile security invoker set search_path=''
as $$ select private.saas_platform_set_tenant_active(p_tenant_id,p_active,p_reason); $$;

create or replace function public.saas_platform_tenants()
returns jsonb
language sql volatile security invoker set search_path=''
as $$ select private.saas_platform_tenants(); $$;

create or replace function public.saas_record_usage(p_tenant_id uuid)
returns void
language sql volatile security invoker set search_path=''
as $$ select private.saas_record_usage(p_tenant_id); $$;

-- No anon or PUBLIC route to these privileged functions.
revoke all on function private.saas_platform_audit(integer,integer) from public, anon, authenticated;
revoke all on function private.saas_platform_audit_filtered(integer,integer,uuid,text,date,date) from public, anon, authenticated;
revoke all on function private.saas_platform_expel_tenant(uuid,text) from public, anon, authenticated;
revoke all on function private.saas_platform_restore_owner(uuid,text) from public, anon, authenticated;
revoke all on function private.saas_platform_set_tenant_active(uuid,boolean,text) from public, anon, authenticated;
revoke all on function private.saas_platform_tenants() from public, anon, authenticated;
revoke all on function private.saas_record_usage(uuid) from public, anon, authenticated;

grant execute on function private.saas_platform_audit(integer,integer) to authenticated;
grant execute on function private.saas_platform_audit_filtered(integer,integer,uuid,text,date,date) to authenticated;
grant execute on function private.saas_platform_expel_tenant(uuid,text) to authenticated;
grant execute on function private.saas_platform_restore_owner(uuid,text) to authenticated;
grant execute on function private.saas_platform_set_tenant_active(uuid,boolean,text) to authenticated;
grant execute on function private.saas_platform_tenants() to authenticated;
grant execute on function private.saas_record_usage(uuid) to authenticated;

revoke all on function public.saas_platform_audit(integer,integer) from public, anon, authenticated;
revoke all on function public.saas_platform_audit_filtered(integer,integer,uuid,text,date,date) from public, anon, authenticated;
revoke all on function public.saas_platform_expel_tenant(uuid,text) from public, anon, authenticated;
revoke all on function public.saas_platform_restore_owner(uuid,text) from public, anon, authenticated;
revoke all on function public.saas_platform_set_tenant_active(uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.saas_platform_tenants() from public, anon, authenticated;
revoke all on function public.saas_record_usage(uuid) from public, anon, authenticated;

grant execute on function public.saas_platform_audit(integer,integer) to authenticated;
grant execute on function public.saas_platform_audit_filtered(integer,integer,uuid,text,date,date) to authenticated;
grant execute on function public.saas_platform_expel_tenant(uuid,text) to authenticated;
grant execute on function public.saas_platform_restore_owner(uuid,text) to authenticated;
grant execute on function public.saas_platform_set_tenant_active(uuid,boolean,text) to authenticated;
grant execute on function public.saas_platform_tenants() to authenticated;
grant execute on function public.saas_record_usage(uuid) to authenticated;
