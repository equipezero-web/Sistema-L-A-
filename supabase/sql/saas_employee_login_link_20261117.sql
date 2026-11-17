-- Link an existing authenticated employee membership to a staff directory entry.
-- This never creates an Auth user, upgrades a role, or links across tenants.
create unique index if not exists saas_employee_unique_login_per_tenant
 on public.saas_employees(tenant_id,user_id) where user_id is not null;
create or replace function public.saas_link_employee_login(
 p_tenant_id uuid,p_employee_id uuid,p_user_id uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_employee public.saas_employees%rowtype;
begin
 if (select auth.uid()) is null
   or (select auth.jwt()->>'aal') is distinct from 'aal2'
   or not public.saas_has_tenant_role(p_tenant_id,
      array['owner'::public.saas_member_role,'admin'::public.saas_member_role])
 then raise exception 'Confirme o MFA e as permissões administrativas.'; end if;
 select * into v_employee from public.saas_employees
  where id=p_employee_id and tenant_id=p_tenant_id for update;
 if not found or v_employee.status::text<>'active' then
  raise exception 'Funcionário inexistente ou inativo.'; end if;
 if p_user_id is not null and not exists(
  select 1 from public.saas_members m where m.tenant_id=p_tenant_id
  and m.user_id=p_user_id and m.role::text='employee' and m.status::text='active'
 ) then raise exception 'A conta informada não é funcionário ativo desta empresa.'; end if;
 update public.saas_employees set user_id=p_user_id
  where id=p_employee_id and tenant_id=p_tenant_id;
 return true;
end $$;
revoke all on function public.saas_link_employee_login(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.saas_link_employee_login(uuid,uuid,uuid) to authenticated;
