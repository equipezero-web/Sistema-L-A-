-- Etapa #53 — rollback-only regression test for profile privilege boundaries.
-- Run as an authorized DB maintenance role. NO fixture data survives ROLLBACK.
-- This is a PostgreSQL RLS/GRANT test; it is NOT an Auth-issued HTTP token test.
-- Execute as a complete script in one session. Never edit away the ROLLBACK.
begin;
create temporary table _saas53_identity on commit drop as
  select gen_random_uuid() as uid;
create temporary table _saas53_findings(
  scenario text, admin boolean, rpc text,
  privilege_edit text, normal_profile_edit integer
) on commit drop;
grant insert,select on _saas53_findings to authenticated;

-- The existing auth.users creation trigger generates a normal saas_profiles row.
-- Never elevate this fixture: verify non-admin access under both AAL levels.
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at)
select uid,'00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated','authenticated',null,now(),now() from _saas53_identity;
select set_config('app.saas53.uid',uid::text,true) from _saas53_identity;

set local role authenticated;
do $verify$
declare
  v_aal text;
  v_admin boolean;
  v_rpc text;
  v_priv text;
  v_count int;
begin
 for v_aal in select unnest(array['aal1','aal2']) loop
  perform set_config('request.jwt.claim.sub',current_setting('app.saas53.uid'),true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',current_setting('app.saas53.uid'),
    'role','authenticated',
    'aal',v_aal
  )::text,true);

  v_admin:=public.saas_is_platform_super_admin();

  begin
    perform public.saas_platform_tenants();
    v_rpc:='ALLOWED';
  exception when raise_exception then
    if sqlerrm <> 'Acesso administrativo negado' then raise; end if;
    v_rpc:='DENIED';
  end;

  begin
    update public.saas_profiles set is_platform_super_admin=true
    where user_id=current_setting('app.saas53.uid')::uuid;
    v_priv:='ALLOWED';
  exception
    when insufficient_privilege then v_priv:='DENIED_BY_GRANT';
    when raise_exception then
      if sqlerrm not in (
        'platform privilege cannot be changed by this user',
        'is_platform_super_admin cannot be changed directly'
      ) then raise; end if;
      v_priv:='DENIED_BY_TRIGGER';
  end;

  update public.saas_profiles set full_name='SaaS validation 53'
   where user_id=current_setting('app.saas53.uid')::uuid;
  get diagnostics v_count=row_count;

  if v_admin or v_rpc <> 'DENIED'
    or v_priv='ALLOWED' or v_count<>1 then
    raise exception 'Unexpected authorization state in %',v_aal;
  end if;
  insert into _saas53_findings values(v_aal,v_admin,v_rpc,v_priv,v_count);
 end loop;
end $verify$;

select * from _saas53_findings order by scenario;
rollback;
