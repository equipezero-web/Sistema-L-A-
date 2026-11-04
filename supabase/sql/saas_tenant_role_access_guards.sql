-- L&A Royal SaaS | Authorization invariants for tenant activation and membership owner role
-- Applied to production Supabase on 2026-11-04. Idempotent for further deployments.
--
-- Enforces:
-- 1. Tenant.active changes only by platform Super Admin with AAL2.
-- 2. The 'owner' membership role only belongs to tenant.owner_user_id.
-- Existing tenant/membership mutation policies remain intact.

create or replace function public.saas_protect_tenant_identity()
returns trigger language plpgsql set search_path = ''
as $function$
begin
  if new.id is distinct from old.id then
    raise exception 'tenant id cannot be changed';
  end if;

  if new.owner_user_id is distinct from old.owner_user_id
     and not public.saas_is_platform_super_admin() then
    raise exception 'tenant owner cannot be changed directly';
  end if;

  if new.active is distinct from old.active
     and not public.saas_is_platform_super_admin() then
    raise exception 'Somente o Super Admin pode alterar a ativação da empresa';
  end if;

  return new;
end;
$function$;

create or replace function public.saas_protect_member_role()
returns trigger language plpgsql set search_path = ''
as $function$
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.user_id is distinct from old.user_id then
    raise exception 'tenant_id and user_id cannot be changed';
  end if;

  if new.role = 'owner'::public.saas_member_role
     and new.user_id is distinct from (
       select t.owner_user_id from public.saas_tenants t where t.id=new.tenant_id
     ) then
    raise exception 'O papel de proprietário deve corresponder ao proprietário registrado da empresa';
  end if;

  if old.role = 'owner'::public.saas_member_role then
    if new.role is distinct from old.role
       and not public.saas_is_platform_super_admin() then
      raise exception 'tenant owner role cannot be changed';
    end if;
    if new.status is distinct from old.status
       and new.status <> 'active'::public.saas_member_status
       and not public.saas_is_platform_super_admin() then
      raise exception 'tenant owner membership cannot be deactivated';
    end if;
  end if;

  if new.role is distinct from old.role
     and not (
       public.saas_has_tenant_role(old.tenant_id,array['owner'::public.saas_member_role])
       or public.saas_is_platform_super_admin()
     ) then
    raise exception 'only an owner can change member roles';
  end if;

  return new;
end;
$function$;

-- Both functions are already bound to BEFORE UPDATE triggers.
-- Verify their trigger bindings after applying this file.
