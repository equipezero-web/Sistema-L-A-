-- Checkout Transparente: bind a server-created Payments API payment to a tenant intent.
-- Legacy Checkout Pro preference tables remain for historical compatibility, but are
-- NOT consulted for new Checkout Transparente receipts.
create table if not exists private.saas_online_transparent_payments (
  intent_id uuid not null references private.saas_online_order_intents(id) on delete cascade,
  tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
  provider_payment_id text not null,
  provider_account_id text not null,
  expected_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  constraint saas_transparent_payment_pk primary key (intent_id,provider_payment_id),
  constraint saas_transparent_payment_unique unique(provider_payment_id),
  constraint saas_transparent_payment_id_ck check (provider_payment_id ~ '^[0-9]{1,30}$'),
  constraint saas_transparent_account_ck check (provider_account_id ~ '^[0-9]{5,30}$'),
  constraint saas_transparent_amount_ck check (expected_amount>=0)
);
create index if not exists saas_transparent_payments_tenant_idx
  on private.saas_online_transparent_payments(tenant_id,intent_id);
alter table private.saas_online_transparent_payments enable row level security;
revoke all on private.saas_online_transparent_payments from public,anon,authenticated;

-- Called only by a future trusted payment-creation backend *after* the seller
-- Payments API returns a payment id. This function NEVER creates a payment.
create or replace function public.saas_online_transparent_bind_payment(
 p_intent_id uuid,p_payment_id text,p_account_id text,p_amount numeric
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_intent private.saas_online_order_intents%rowtype;
begin
 if p_intent_id is null or p_payment_id !~ '^[0-9]{1,30}$'
  or p_account_id !~ '^[0-9]{5,30}$' or p_amount is null then return false; end if;
 select * into v_intent from private.saas_online_order_intents where id=p_intent_id for update;
 if not found or v_intent.status<>'prepared'
  or v_intent.expires_at<=now() or v_intent.subtotal<>p_amount then return false; end if;
 if not exists(select 1 from private.saas_online_order_activation a
    where a.tenant_id=v_intent.tenant_id and a.enabled) then return false; end if;
 if not exists(select 1 from private.saas_merchant_oauth_credentials c
   join public.saas_merchant_payment_connections p
    on p.tenant_id=c.tenant_id and p.provider='mercado_pago' and p.status='connected'
   where c.tenant_id=v_intent.tenant_id and c.provider_account_id=p_account_id)
 then return false; end if;
 insert into private.saas_online_transparent_payments(
  intent_id,tenant_id,provider_payment_id,provider_account_id,expected_amount
 ) values (p_intent_id,v_intent.tenant_id,p_payment_id,p_account_id,p_amount)
 on conflict(provider_payment_id) do nothing;
 return exists(select 1 from private.saas_online_transparent_payments t
   where t.intent_id=p_intent_id and t.tenant_id=v_intent.tenant_id
     and t.provider_payment_id=p_payment_id and t.provider_account_id=p_account_id
     and t.expected_amount=p_amount);
end;
$$;
revoke all on function public.saas_online_transparent_bind_payment(uuid,text,text,numeric) from public,anon,authenticated;
grant execute on function public.saas_online_transparent_bind_payment(uuid,text,text,numeric) to service_role;

-- Authenticated webhook queries only a pre-bound payment, not arbitrary user metadata.
create or replace function public.saas_online_transparent_payment_context(
 p_intent_id uuid,p_payment_id text
) returns table(tenant_id uuid,provider_account_id text,subtotal numeric)
language plpgsql security definer set search_path=''
as $$
begin
 if p_intent_id is null or p_payment_id !~ '^[0-9]{1,30}$' then return; end if;
 return query select i.tenant_id,t.provider_account_id,i.subtotal
 from private.saas_online_order_intents i
 join private.saas_online_transparent_payments t on t.intent_id=i.id and t.tenant_id=i.tenant_id
 join private.saas_merchant_oauth_credentials c on c.tenant_id=i.tenant_id and c.provider_account_id=t.provider_account_id
 join public.saas_merchant_payment_connections p on p.tenant_id=i.tenant_id and p.provider='mercado_pago' and p.status='connected'
 where i.id=p_intent_id and t.provider_payment_id=p_payment_id
  and i.status='prepared' and i.subtotal=t.expected_amount
  and exists(select 1 from private.saas_online_order_activation a where a.tenant_id=i.tenant_id and a.enabled);
end;
$$;
revoke all on function public.saas_online_transparent_payment_context(uuid,text) from public,anon,authenticated;
grant execute on function public.saas_online_transparent_payment_context(uuid,text) to service_role;

-- Reconcile verified Payments API status. No inventory/saas_orders/fulfillment writes.
create or replace function public.saas_online_transparent_record_verified(
 p_intent_id uuid,p_payment_id text,p_account_id text,p_amount numeric,p_currency text,p_status text
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_intent private.saas_online_order_intents%rowtype;
 v_existing private.saas_online_payment_receipts%rowtype;
begin
 if p_intent_id is null or p_payment_id !~ '^[0-9]{1,30}$'
  or p_account_id !~ '^[0-9]{5,30}$' or p_amount is null or p_currency<>'BRL'
  or p_status not in ('pending','in_process','approved','rejected','cancelled','refunded','charged_back')
 then return false; end if;
 select * into v_intent from private.saas_online_order_intents where id=p_intent_id for update;
 if not found or v_intent.status<>'prepared' or v_intent.subtotal<>p_amount then return false; end if;
 if not exists(select 1 from private.saas_online_transparent_payments t
    where t.intent_id=p_intent_id and t.tenant_id=v_intent.tenant_id
     and t.provider_payment_id=p_payment_id and t.provider_account_id=p_account_id
     and t.expected_amount=p_amount)
 then return false; end if;
 if not exists(select 1 from private.saas_merchant_oauth_credentials c
  join public.saas_merchant_payment_connections p on p.tenant_id=c.tenant_id and p.provider='mercado_pago' and p.status='connected'
  where c.tenant_id=v_intent.tenant_id and c.provider_account_id=p_account_id)
 then return false; end if;
 select * into v_existing from private.saas_online_payment_receipts
  where provider='mercado_pago' and provider_payment_id=p_payment_id for update;
 if found then
  if v_existing.intent_id<>p_intent_id or v_existing.tenant_id<>v_intent.tenant_id
   or v_existing.provider_account_id<>p_account_id or v_existing.amount<>p_amount
   or v_existing.currency<>'BRL' then return false; end if;
  if v_existing.payment_status='approved' and p_status in ('pending','in_process','rejected','cancelled')
  then return true; end if;
  if v_existing.payment_status in ('refunded','charged_back')
   and p_status not in ('refunded','charged_back') then return true; end if;
  update private.saas_online_payment_receipts
   set payment_status=p_status,verified_at=now()
   where provider='mercado_pago' and provider_payment_id=p_payment_id;
  return true;
 end if;
 insert into private.saas_online_payment_receipts(
  provider,provider_payment_id,tenant_id,intent_id,provider_account_id,currency,amount,payment_status
 ) values('mercado_pago',p_payment_id,v_intent.tenant_id,p_intent_id,p_account_id,'BRL',p_amount,p_status);
 return true;
end;
$$;
revoke all on function public.saas_online_transparent_record_verified(uuid,text,text,numeric,text,text) from public,anon,authenticated;
grant execute on function public.saas_online_transparent_record_verified(uuid,text,text,numeric,text,text) to service_role;
