-- Merchant OAuth state is backend-only; never authorize a connection from the browser.
create table if not exists private.saas_merchant_oauth_attempts (
 state_hash text primary key,
 tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
 owner_user_id uuid not null,
 code_verifier text not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 constraint merchant_oauth_state_hash check (state_hash ~ '^[a-f0-9]{64}$'),
 constraint merchant_oauth_pkce check (char_length(code_verifier) between 43 and 128)
);
create index if not exists merchant_oauth_attempt_expiry on private.saas_merchant_oauth_attempts(expires_at);
alter table private.saas_merchant_oauth_attempts enable row level security;
revoke all on private.saas_merchant_oauth_attempts from public,anon,authenticated;

create table if not exists private.saas_merchant_oauth_credentials (
 tenant_id uuid primary key references public.saas_tenants(id) on delete cascade,
 provider_account_id text not null,
 access_secret_id uuid not null,
 refresh_secret_id uuid not null,
 token_expires_at timestamptz not null,
 updated_at timestamptz not null default now()
);
alter table private.saas_merchant_oauth_credentials enable row level security;
revoke all on private.saas_merchant_oauth_credentials from public,anon,authenticated;

-- EXECUTE is available only to the Edge Function acting as service_role.
-- The definer is necessary solely to access private schema + Supabase Vault.
create or replace function public.saas_merchant_oauth_begin(
 p_tenant_id uuid,p_owner_id uuid,p_state_hash text,p_code_verifier text
) returns void language plpgsql security definer set search_path=''
as $$
begin
 if p_state_hash !~ '^[a-f0-9]{64}$' or char_length(p_code_verifier) not between 43 and 128
 then raise exception 'Solicitação inválida.'; end if;
 delete from private.saas_merchant_oauth_attempts where expires_at<now();
 insert into private.saas_merchant_oauth_attempts(state_hash,tenant_id,owner_user_id,code_verifier,expires_at)
 values(p_state_hash,p_tenant_id,p_owner_id,p_code_verifier,now()+interval '10 minutes');
end;
$$;
revoke all on function public.saas_merchant_oauth_begin(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.saas_merchant_oauth_begin(uuid,uuid,text,text) to service_role;

create or replace function public.saas_merchant_oauth_consume(p_state_hash text)
returns table(tenant_id uuid,owner_user_id uuid,code_verifier text)
language plpgsql security definer set search_path=''
as $$
begin
 if p_state_hash !~ '^[a-f0-9]{64}$' then return; end if;
 return query
 delete from private.saas_merchant_oauth_attempts a
 where a.state_hash=p_state_hash and a.expires_at>now()
 returning a.tenant_id,a.owner_user_id,a.code_verifier;
end;
$$;
revoke all on function public.saas_merchant_oauth_consume(text) from public,anon,authenticated;
grant execute on function public.saas_merchant_oauth_consume(text) to service_role;

create or replace function public.saas_merchant_oauth_complete(
 p_tenant_id uuid,p_provider_account_id text,p_access_token text,p_refresh_token text,p_expires_in integer
) returns void language plpgsql security definer set search_path=''
as $$
declare
 v_access uuid;
 v_refresh uuid;
 v_record private.saas_merchant_oauth_credentials%rowtype;
begin
 if char_length(p_provider_account_id) not between 1 and 90
  or char_length(p_access_token) not between 30 and 4096
  or char_length(p_refresh_token) not between 30 and 4096
  or p_expires_in not between 60 and 31536000
 then raise exception 'Retorno do provedor inválido.'; end if;
 if not exists(select 1 from public.saas_tenants where id=p_tenant_id and template_code='virtual_store' and active)
 then raise exception 'Empresa indisponível.'; end if;
 select * into v_record from private.saas_merchant_oauth_credentials where tenant_id=p_tenant_id for update;
 if v_record.tenant_id is null then
  v_access := vault.create_secret(p_access_token,null,'Merchant OAuth access token');
  v_refresh := vault.create_secret(p_refresh_token,null,'Merchant OAuth refresh token');
  insert into private.saas_merchant_oauth_credentials(tenant_id,provider_account_id,access_secret_id,refresh_secret_id,token_expires_at)
  values(p_tenant_id,p_provider_account_id,v_access,v_refresh,now()+make_interval(secs=>p_expires_in));
 else
  perform vault.update_secret(v_record.access_secret_id,p_access_token);
  perform vault.update_secret(v_record.refresh_secret_id,p_refresh_token);
  update private.saas_merchant_oauth_credentials
   set provider_account_id=p_provider_account_id,token_expires_at=now()+make_interval(secs=>p_expires_in),updated_at=now()
   where tenant_id=p_tenant_id;
 end if;
 insert into public.saas_merchant_payment_connections(tenant_id,provider,status,provider_account_label,connected_at,last_verified_at)
 values(p_tenant_id,'mercado_pago','connected','Conta Mercado Pago '+right(p_provider_account_id,4),now(),now())
 on conflict(tenant_id,provider) do update set status='connected',
 provider_account_label=excluded.provider_account_label,
 connected_at=excluded.connected_at,last_verified_at=excluded.last_verified_at,updated_at=now();
end;
$$;
revoke all on function public.saas_merchant_oauth_complete(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.saas_merchant_oauth_complete(uuid,text,text,text,integer) to service_role;
