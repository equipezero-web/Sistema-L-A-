-- Mercado Pago seller public keys are non-secret but are still tenant-scoped.
-- No checkout activation or payment authority is granted by this migration.
alter table private.saas_merchant_oauth_credentials
  add column if not exists checkout_public_key text;

create or replace function public.saas_merchant_checkout_save_public_key(
  p_tenant_id uuid,p_account_id text,p_public_key text
) returns boolean language plpgsql security definer set search_path=''
as $$
begin
  if p_tenant_id is null or p_account_id !~ '^[0-9]{5,30}$'
    or p_public_key is null
    or p_public_key !~ '^(APP_USR|TEST)-[A-Za-z0-9-]{10,160}$'
  then return false; end if;
  update private.saas_merchant_oauth_credentials
    set checkout_public_key=p_public_key,updated_at=now()
  where tenant_id=p_tenant_id and provider_account_id=p_account_id;
  return found;
end;
$$;
revoke all on function public.saas_merchant_checkout_save_public_key(uuid,text,text) from public,anon,authenticated;
grant execute on function public.saas_merchant_checkout_save_public_key(uuid,text,text) to service_role;

-- The only RPC that may reveal a public key to the Edge Function.
-- Strict fail-closed: no key is exposed unless merchant + store + checkout
-- activation all match. This remains effectively disabled until the next
-- commercial go-live migration intentionally provisions tenant activation.
create or replace function public.saas_transparent_checkout_readiness(p_slug text)
returns table(tenant_id uuid,public_key text,checkout_enabled boolean)
language plpgsql security definer set search_path=''
as $$
begin
 if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$' then return; end if;
 return query
 select t.id,c.checkout_public_key,true
 from public.saas_public_stores s
 join public.saas_tenants t on t.id=s.tenant_id
 join private.saas_online_order_activation a on a.tenant_id=t.id and a.enabled
 join public.saas_merchant_payment_connections m
   on m.tenant_id=t.id and m.provider='mercado_pago' and m.status='connected'
 join private.saas_merchant_oauth_credentials c on c.tenant_id=t.id
 where s.slug=p_slug and s.template_code='virtual_store' and t.active
  and c.checkout_public_key ~ '^(APP_USR|TEST)-[A-Za-z0-9-]{10,160}$'
  and c.token_expires_at>now()+interval '30 seconds';
end;
$$;
revoke all on function public.saas_transparent_checkout_readiness(text) from public,anon,authenticated;
grant execute on function public.saas_transparent_checkout_readiness(text) to service_role;
