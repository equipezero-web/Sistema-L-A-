-- Tenant-isolated Mercado Pago refresh. Service-only functions; no browser token access.
-- Refresh leases prevent concurrent OAuth refreshes and token reuse.
alter table private.saas_merchant_oauth_credentials
 add column if not exists refresh_lease_id uuid,
 add column if not exists refresh_lease_until timestamptz;
create index if not exists saas_merchant_credentials_refresh_due
 on private.saas_merchant_oauth_credentials(token_expires_at);

create or replace function public.saas_merchant_refresh_claim(p_tenant_id uuid)
returns table(provider_account_id text,refresh_token text,lease_id uuid)
language plpgsql security definer set search_path=''
as $$
declare
 v private.saas_merchant_oauth_credentials%rowtype;
 v_lease uuid;
 v_secret text;
begin
 if p_tenant_id is null then return; end if;
 select * into v from private.saas_merchant_oauth_credentials c
 where c.tenant_id=p_tenant_id for update;
 if not found then return; end if;
 if v.token_expires_at>now()+interval '7 days' then return; end if;
 if v.refresh_lease_until>now() then return; end if;
 if not exists(
  select 1 from public.saas_merchant_payment_connections p
  join public.saas_tenants t on t.id=p.tenant_id
  where p.tenant_id=p_tenant_id and p.provider='mercado_pago'
   and p.status='connected' and t.active and t.template_code='virtual_store'
 ) then return; end if;
 select d.decrypted_secret into v_secret from vault.decrypted_secrets d
 where d.id=v.refresh_secret_id;
 if v_secret is null or char_length(v_secret)<30 then return; end if;
 v_lease:=gen_random_uuid();
 update private.saas_merchant_oauth_credentials c
 set refresh_lease_id=v_lease,refresh_lease_until=now()+interval '90 seconds'
 where c.tenant_id=p_tenant_id;
 return query select v.provider_account_id,v_secret,v_lease;
end;
$$;
revoke all on function public.saas_merchant_refresh_claim(uuid) from public,anon,authenticated;
grant execute on function public.saas_merchant_refresh_claim(uuid) to service_role;

create or replace function public.saas_merchant_refresh_commit(
 p_tenant_id uuid,p_lease_id uuid,p_account_id text,
 p_access_token text,p_refresh_token text,p_expires_in integer
) returns boolean language plpgsql security definer set search_path=''
as $$
declare
 v private.saas_merchant_oauth_credentials%rowtype;
begin
 if p_lease_id is null or p_tenant_id is null
  or p_account_id is null or char_length(p_access_token) not between 30 and 4096
  or char_length(p_refresh_token) not between 30 and 4096
  or p_expires_in not between 60 and 31536000 then return false; end if;
 select * into v from private.saas_merchant_oauth_credentials c
 where c.tenant_id=p_tenant_id for update;
 if not found or v.refresh_lease_id is distinct from p_lease_id
  or v.refresh_lease_until<=now() or v.provider_account_id<>p_account_id then return false; end if;
 if not exists(select 1 from public.saas_merchant_payment_connections
   where tenant_id=p_tenant_id and provider='mercado_pago' and status='connected')
   then return false; end if;
 perform vault.update_secret(v.access_secret_id,p_access_token);
 perform vault.update_secret(v.refresh_secret_id,p_refresh_token);
 update private.saas_merchant_oauth_credentials
 set token_expires_at=now()+make_interval(secs=>p_expires_in),
     updated_at=now(),refresh_lease_id=null,refresh_lease_until=null
 where tenant_id=p_tenant_id;
 update public.saas_merchant_payment_connections
 set last_verified_at=now(),updated_at=now()
 where tenant_id=p_tenant_id and provider='mercado_pago' and status='connected';
 return true;
end;
$$;
revoke all on function public.saas_merchant_refresh_commit(uuid,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.saas_merchant_refresh_commit(uuid,uuid,text,text,text,integer) to service_role;

create or replace function public.saas_merchant_refresh_release(p_tenant_id uuid,p_lease_id uuid)
returns void language sql security definer set search_path=''
as $$
 update private.saas_merchant_oauth_credentials
 set refresh_lease_id=null,refresh_lease_until=null
 where tenant_id=p_tenant_id and refresh_lease_id=p_lease_id;
$$;
revoke all on function public.saas_merchant_refresh_release(uuid,uuid) from public,anon,authenticated;
grant execute on function public.saas_merchant_refresh_release(uuid,uuid) to service_role;
