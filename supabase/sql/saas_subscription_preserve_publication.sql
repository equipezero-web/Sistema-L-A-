-- L&A Royal SaaS — etapa #40 (2026-11-06)
-- A suspensão financeira impede leitura pública via RLS (#38), mas não deve
-- apagar a preferência de publicação do proprietário.
-- Preserve the original privilege boundary (private SECURITY DEFINER).
create or replace function private.saas_apply_provider_subscription(
 p_tenant_id uuid, p_provider text, p_provider_subscription_id text,
 p_provider_status text, p_payment_id text default null, p_payment_status text default null,
 p_period_end timestamptz default null
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
 v_plan uuid;
 v_active boolean;
 v_local_status text;
begin
 if p_provider <> 'mercado_pago' then
  raise exception 'unsupported provider';
 end if;
 select id into v_plan from public.saas_plans where code='royal-30' and active=true;
 if v_plan is null then raise exception 'royal-30 plan not found'; end if;
 v_active := lower(coalesce(p_provider_status,''))='authorized'
   and lower(coalesce(p_payment_status,''))='approved'
   and p_period_end is not null
   and p_period_end > now();
 v_local_status := case
  when v_active then 'active'
  when lower(coalesce(p_provider_status,'')) in ('cancelled','canceled') then 'cancelled'
  else 'past_due'
 end;
 insert into public.saas_subscriptions(
  tenant_id,plan_id,status,billing_cycle,provider,provider_subscription_id,
  provider_status,last_payment_id,last_payment_status,activated_at,
  payment_updated_at,current_period_start,current_period_end
 ) values (
  p_tenant_id,v_plan,v_local_status,'monthly','mercado_pago',
  p_provider_subscription_id,p_provider_status,p_payment_id,p_payment_status,
  case when v_active then now() end,now(),
  case when v_active then now() end,p_period_end
 )
 on conflict(tenant_id) do update
 set plan_id=excluded.plan_id,
  status=excluded.status,
  billing_cycle='monthly',
  provider='mercado_pago',
  provider_subscription_id=excluded.provider_subscription_id,
  provider_status=excluded.provider_status,
  last_payment_id=coalesce(excluded.last_payment_id,public.saas_subscriptions.last_payment_id),
  last_payment_status=coalesce(excluded.last_payment_status,public.saas_subscriptions.last_payment_status),
  activated_at=case when v_active then coalesce(public.saas_subscriptions.activated_at,now())
    else public.saas_subscriptions.activated_at end,
  payment_updated_at=now(),
  current_period_start=case when v_active then coalesce(public.saas_subscriptions.current_period_start,now())
    else public.saas_subscriptions.current_period_start end,
  current_period_end=coalesce(excluded.current_period_end,public.saas_subscriptions.current_period_end),
  updated_at=now();

 -- Deliberately DO NOT set saas_store_themes.published=false on past_due or
 -- cancelled: doing so permanently destroys the owner's prior publishing intent.
 -- saas_sync_public_store immediately removes the public mirror on lost access,
 -- and recreates it on confirmed recovery when the owner still wants publication.
 perform public.saas_sync_public_store(p_tenant_id);
 insert into public.saas_audit_logs(
  tenant_id,actor_user_id,action,entity_type,entity_id,metadata
 ) values (
  p_tenant_id,null,
  case when v_active then 'subscription.activated' else 'subscription.updated' end,
  'subscription',p_provider_subscription_id,
  jsonb_build_object(
   'provider','mercado_pago',
   'provider_status',p_provider_status,
   'payment_status',p_payment_status
  )
 );
end;
$function$;

-- Require an explicit future billing period to prevent a null-expiry active subscription.
-- The RPC wrapper remains service-only. Do not broaden EXECUTE grants.
