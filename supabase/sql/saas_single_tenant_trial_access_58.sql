-- Etapa #58: acesso comercial temporário e autorizado para UMA empresa de homologação.
-- NÃO altera saas_subscriptions, pagamentos, Mercado Pago, RLS de clientes nem plano Royal 30.
-- A liberação expira automaticamente em 7 dias, inclusive para consultas públicas anônimas.
create table if not exists private.saas_tenant_trial_access (
  tenant_id uuid primary key references public.saas_tenants(id) on delete cascade,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  reason text not null,
  constraint saas_trial_valid_period check (expires_at > starts_at)
);
alter table private.saas_tenant_trial_access enable row level security;
revoke all on private.saas_tenant_trial_access from public, anon, authenticated;

create or replace function private.saas_trial_active(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
  select exists (
    select 1 from private.saas_tenant_trial_access tr
    where tr.tenant_id = p_tenant_id
      and tr.starts_at <= now()
      and tr.expires_at > now()
  );
$fn$;
revoke all on function private.saas_trial_active(uuid) from public,anon,authenticated;
grant execute on function private.saas_trial_active(uuid) to authenticated;

create or replace function private.saas_trial_expires_at(p_tenant_id uuid)
returns timestamptz language sql stable security definer set search_path=''
as $fn$
  select tr.expires_at from private.saas_tenant_trial_access tr
  where tr.tenant_id=p_tenant_id
    and tr.starts_at <= now()
    and tr.expires_at > now();
$fn$;
revoke all on function private.saas_trial_expires_at(uuid) from public,anon,authenticated;
grant execute on function private.saas_trial_expires_at(uuid) to authenticated;

-- Preserve the meaning of has_active_subscription: only a real paid subscription.
-- Business access includes either a paid subscription OR a scoped valid trial.
create or replace function public.saas_has_commercial_access(p_tenant_id uuid)
returns boolean language sql stable security invoker set search_path=''
as $fn$
  select public.saas_has_active_subscription(p_tenant_id)
    or private.saas_trial_active(p_tenant_id);
$fn$;
revoke all on function public.saas_has_commercial_access(uuid) from public,anon,authenticated;
grant execute on function public.saas_has_commercial_access(uuid) to authenticated;

-- The public API accurately identifies this as a TRIAL, never as a paid plan.
create or replace function public.saas_subscription_access(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $fn$
  select case when (select auth.uid()) is not null and
     (public.saas_is_platform_super_admin() or public.saas_is_tenant_member(p_tenant_id))
  then jsonb_build_object(
    'active', public.saas_has_commercial_access(p_tenant_id),
    'access_type', case
      when public.saas_has_active_subscription(p_tenant_id) then 'subscription'
      when private.saas_trial_active(p_tenant_id) then 'trial'
      else 'none' end,
    'trial_expires_at',private.saas_trial_expires_at(p_tenant_id),
    'subscription',(
      select jsonb_build_object(
        'status',s.status,'provider',s.provider,
        'provider_status',s.provider_status,
        'last_payment_status',s.last_payment_status,
        'current_period_end',s.current_period_end
      ) from public.saas_subscriptions s
      where s.tenant_id=p_tenant_id limit 1
    )
  ) end;
$fn$;

-- Existing public/catalog RLS continue requiring active tenant + onboarding + published.
-- Only payment-or-trial eligibility changes; anonymous users cannot see private trial rows.
create or replace function private.saas_public_store_visible(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
  select exists (
    select 1 from public.saas_tenants t
    join public.saas_store_themes th on th.tenant_id=t.id
    where t.id=p_tenant_id and t.active=true
      and t.onboarding_completed=true and th.published=true
      and (public.saas_has_active_subscription(p_tenant_id)
           or private.saas_trial_active(p_tenant_id))
  );
$fn$;

-- Preserve the existing security and restrictions of publication triggers.
create or replace function public.saas_enforce_catalog_subscription()
returns trigger language plpgsql set search_path=''
as $fn$
begin
  if new.published and not public.saas_has_commercial_access(new.tenant_id)
    and not public.saas_is_platform_super_admin() then
    raise exception 'Assinatura ativa ou acesso de teste obrigatório para publicar itens.';
  end if;
  return new;
end;
$fn$;

create or replace function public.saas_enforce_store_subscription()
returns trigger language plpgsql set search_path=''
as $fn$
begin
  if new.published and not public.saas_has_commercial_access(new.tenant_id)
    and not public.saas_is_platform_super_admin() then
    raise exception 'Assinatura ativa ou acesso de teste obrigatório para publicar a loja.';
  end if;
  return new;
end;
$fn$;

-- Keep the existing synchronization logic, only swap the eligibility predicate.
-- We intentionally do not rewrite the audited SECURITY DEFINER function body.
do $migration$
declare v_original text; v_revised text;
begin
  v_original := pg_get_functiondef('public.saas_sync_public_store(uuid)'::regprocedure);
  if strpos(v_original,'not public.saas_has_active_subscription(p_tenant_id)') = 0 then
    raise exception 'Unexpected SaaS store synchronization definition';
  end if;
  v_revised := replace(v_original,
    'not public.saas_has_active_subscription(p_tenant_id)',
    'not public.saas_has_commercial_access(p_tenant_id)');
  execute v_revised;

  v_original := pg_get_functiondef('public.saas_complete_onboarding(uuid,text,text,text,text,text,text,text,text,boolean)'::regprocedure);
  if strpos(v_original,'p_publish and not public.saas_has_active_subscription(p_tenant_id)') = 0 then
    raise exception 'Unexpected SaaS onboarding definition';
  end if;
  v_revised := replace(v_original,
    'p_publish and not public.saas_has_active_subscription(p_tenant_id)',
    'p_publish and not public.saas_has_commercial_access(p_tenant_id)');
  execute v_revised;
end;
$migration$;

-- The target is the single existing user-created test store, not a wildcard.
-- If the slug or ID changed, FAIL instead of granting trial to another tenant.
do $trial$
declare v_tenant uuid := 'b26cb679-bbbb-4e62-95f3-4b7f907c090d'::uuid;
begin
  if not exists (
    select 1 from public.saas_tenants
    where id=v_tenant and slug='lapis-servidor'
      and active=true and onboarding_completed=true
  ) then raise exception 'Target test tenant not found or changed'; end if;
  if exists (select 1 from public.saas_subscriptions where tenant_id=v_tenant) then
    raise exception 'Target tenant already has a billing record: do not override it';
  end if;
  insert into private.saas_tenant_trial_access(
    tenant_id,starts_at,expires_at,reason
  ) values (
    v_tenant,now(),now()+interval '7 days',
    'Homologação temporária de loja solicitada pelo proprietário, sem cobrança'
  ) on conflict(tenant_id) do nothing;
end;
$trial$;
