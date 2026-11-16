-- Merchant payment reconciliation foundations. Independent of SaaS subscription billing.
-- No existing order/stock/financial records are written here.
-- Provider credentials are Vault-encrypted, returned ONLY to service-role Edge Functions.
create table if not exists private.saas_online_payment_preference_links (
 intent_id uuid primary key references private.saas_online_order_intents(id) on delete cascade,
 tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
 provider text not null default 'mercado_pago',
 provider_preference_id text not null,
 created_at timestamptz not null default now(),
 constraint saas_online_payment_preference_provider_ck check (provider='mercado_pago'),
 constraint saas_online_payment_preference_id_ck check (length(provider_preference_id) between 8 and 200),
 constraint saas_online_payment_preference_uniq unique(provider,provider_preference_id)
);
create table if not exists private.saas_online_payment_receipts (
 provider text not null default 'mercado_pago',
 provider_payment_id text not null,
 tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
 intent_id uuid not null references private.saas_online_order_intents(id) on delete cascade,
 provider_account_id text not null,
 currency text not null default 'BRL',
 amount numeric(12,2) not null,
 payment_status text not null,
 verified_at timestamptz not null default now(),
 primary key(provider,provider_payment_id),
 constraint saas_online_payment_receipt_provider_ck check(provider='mercado_pago'),
 constraint saas_online_payment_status_ck check(payment_status in ('pending','in_process','approved','rejected','cancelled','refunded','charged_back')),
 constraint saas_online_payment_amount_ck check(amount>=0),
 constraint saas_online_payment_currency_ck check(currency='BRL')
);
create index if not exists saas_online_payment_receipts_tenant on private.saas_online_payment_receipts(tenant_id,intent_id);
alter table private.saas_online_payment_preference_links enable row level security;
alter table private.saas_online_payment_receipts enable row level security;
revoke all on private.saas_online_payment_preference_links,private.saas_online_payment_receipts from public,anon,authenticated;

-- Merchant checkout cannot proceed until a separate fulfillment migration exists
-- and is audited. This flag remains FALSE; no end-user payment is enabled.
-- Preference links are preparation for future integration tests.
create or replace function public.saas_online_payment_link_preference(
 p_intent_id uuid,p_preference_id text
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_intent private.saas_online_order_intents%rowtype;
begin
 if p_intent_id is null or p_preference_id is null or length(p_preference_id) not between 8 and 200 then return false; end if;
 select * into v_intent from private.saas_online_order_intents where id=p_intent_id for update;
 if not found or v_intent.status<>'prepared' then return false; end if;
 if not exists(select 1 from private.saas_online_order_activation a
    where a.tenant_id=v_intent.tenant_id and a.enabled) then return false; end if;
 insert into private.saas_online_payment_preference_links(intent_id,tenant_id,provider_preference_id)
 values(p_intent_id,v_intent.tenant_id,p_preference_id)
 on conflict(intent_id) do nothing;
 return exists(select 1 from private.saas_online_payment_preference_links
   where intent_id=p_intent_id and provider_preference_id=p_preference_id);
end;
$$;
revoke all on function public.saas_online_payment_link_preference(uuid,text) from public,anon,authenticated;
grant execute on function public.saas_online_payment_link_preference(uuid,text) to service_role;

create or replace function public.saas_online_payment_context(p_intent_id uuid)
returns table(tenant_id uuid,provider_account_id text,access_token text,subtotal numeric,preference_id text)
language plpgsql security definer set search_path=''
as $$
begin
 return query
 select i.tenant_id,c.provider_account_id,v.decrypted_secret,i.subtotal,l.provider_preference_id
 from private.saas_online_order_intents i
 join private.saas_online_payment_preference_links l on l.intent_id=i.id and l.tenant_id=i.tenant_id
 join private.saas_merchant_oauth_credentials c on c.tenant_id=i.tenant_id
 join public.saas_merchant_payment_connections p on p.tenant_id=i.tenant_id and p.provider='mercado_pago' and p.status='connected'
 join vault.decrypted_secrets v on v.id=c.access_secret_id
 where i.id=p_intent_id and i.status='prepared' and c.token_expires_at>now()+interval '30 seconds'
   and exists(select 1 from private.saas_online_order_activation a where a.tenant_id=i.tenant_id and a.enabled);
end;
$$;
revoke all on function public.saas_online_payment_context(uuid) from public,anon,authenticated;
grant execute on function public.saas_online_payment_context(uuid) to service_role;

create or replace function public.saas_online_payment_record_verified(
 p_intent_id uuid,p_payment_id text,p_account_id text,p_amount numeric,p_currency text,p_status text,p_preference_id text
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_record private.saas_online_payment_receipts%rowtype;v_intent private.saas_online_order_intents%rowtype;
begin
 if p_intent_id is null or p_payment_id !~ '^[0-9]{1,30}$'
  or p_account_id !~ '^[0-9]{5,30}$'
  or p_currency<>'BRL'
  or p_status not in ('pending','in_process','approved','rejected','cancelled','refunded','charged_back')
 then return false; end if;
 select * into v_intent from private.saas_online_order_intents where id=p_intent_id for update;
 if not found or v_intent.status<>'prepared' or v_intent.subtotal<>p_amount then return false; end if;
 if not exists(select 1 from private.saas_online_payment_preference_links l
  where l.intent_id=p_intent_id and l.tenant_id=v_intent.tenant_id and l.provider_preference_id=p_preference_id)
 then return false; end if;
 if not exists(select 1 from private.saas_merchant_oauth_credentials c
  join public.saas_merchant_payment_connections p on p.tenant_id=c.tenant_id and p.provider='mercado_pago' and p.status='connected'
  where c.tenant_id=v_intent.tenant_id and c.provider_account_id=p_account_id)
 then return false; end if;
 select * into v_record from private.saas_online_payment_receipts
  where provider='mercado_pago' and provider_payment_id=p_payment_id for update;
 if found then
  if v_record.intent_id<>p_intent_id or v_record.tenant_id<>v_intent.tenant_id
   or v_record.provider_account_id<>p_account_id or v_record.amount<>p_amount then return false; end if;
  -- A delayed pending notification must not downgrade an approved payment.
  if v_record.payment_status='approved' and p_status in ('pending','in_process','rejected','cancelled')
  then return true; end if;
  if v_record.payment_status in ('refunded','charged_back')
   and p_status not in ('refunded','charged_back') then return true; end if;
  update private.saas_online_payment_receipts
   set payment_status=p_status,verified_at=now()
   where provider='mercado_pago' and provider_payment_id=p_payment_id;
  return true;
 end if;
 insert into private.saas_online_payment_receipts(
  provider,provider_payment_id,tenant_id,intent_id,provider_account_id,currency,amount,payment_status
 )values('mercado_pago',p_payment_id,v_intent.tenant_id,p_intent_id,p_account_id,'BRL',p_amount,p_status);
 return true;
end;
$$;
revoke all on function public.saas_online_payment_record_verified(uuid,text,text,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.saas_online_payment_record_verified(uuid,text,text,numeric,text,text,text) to service_role;

-- Provider webhook only knows the merchant user_id and payment id initially.
-- Return a seller token to service-role code only after validating signed notification.
create or replace function public.saas_online_payment_seller_token(p_account_id text)
returns table(provider_account_id text,access_token text)
language plpgsql security definer set search_path=''
as $$
begin
 if p_account_id !~ '^[0-9]{5,30}$' then return; end if;
 return query select c.provider_account_id,v.decrypted_secret
 from private.saas_merchant_oauth_credentials c
 join private.saas_online_order_activation a on a.tenant_id=c.tenant_id and a.enabled
 join public.saas_merchant_payment_connections p on p.tenant_id=c.tenant_id and p.provider='mercado_pago' and p.status='connected'
 join public.saas_tenants t on t.id=c.tenant_id and t.active and t.template_code='virtual_store'
 join vault.decrypted_secrets v on v.id=c.access_secret_id
 where c.provider_account_id=p_account_id and c.token_expires_at>now()+interval '30 seconds'
 order by c.updated_at desc limit 1;
end;
$$;
revoke all on function public.saas_online_payment_seller_token(text) from public,anon,authenticated;
grant execute on function public.saas_online_payment_seller_token(text) to service_role;
