-- Merchant Checkout Transparent: preparatory payment attempt ledger.
-- No Mercado Pago API calls, stock movement, order creation or checkout activation.
create table if not exists private.saas_online_payment_attempts (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
 intent_id uuid not null references private.saas_online_order_intents(id) on delete cascade,
 request_key uuid not null,
 amount numeric(12,2) not null,
 currency text not null default 'BRL',
 state text not null default 'prepared',
 created_at timestamptz not null default now(),
 constraint saas_payment_attempt_one_per_intent unique(intent_id),
 constraint saas_payment_attempt_request_unique unique(tenant_id,request_key),
 constraint saas_payment_attempt_amount_check check(amount>0 and amount<=1000000),
 constraint saas_payment_attempt_currency_check check(currency='BRL'),
 constraint saas_payment_attempt_state_check check(state in ('prepared','submitted','pending','approved','rejected','cancelled','refunded','charged_back'))
);
create index if not exists saas_payment_attempts_tenant_created
 on private.saas_online_payment_attempts(tenant_id,created_at desc);
alter table private.saas_online_payment_attempts enable row level security;
revoke all on private.saas_online_payment_attempts from public,anon,authenticated;

-- Only service_role can prepare a payment attempt. This operation does not
-- authorize or trigger a charge. The single attempt per intent prevents
-- accidental second attempts against an already prepared order.
create or replace function public.saas_online_payment_attempt_prepare(
 p_intent_id uuid,p_request_key uuid
) returns table(attempt_id uuid,amount numeric,currency text,reused boolean)
language plpgsql security definer set search_path=''
as $$
declare
 v_intent private.saas_online_order_intents%rowtype;
 v_existing private.saas_online_payment_attempts%rowtype;
begin
 if p_intent_id is null or p_request_key is null then
  raise exception 'Solicitação inválida.';
 end if;

 select * into v_intent from private.saas_online_order_intents
  where id=p_intent_id for update;
 if not found or v_intent.status<>'prepared'
  or v_intent.expires_at<=now() or v_intent.subtotal<=0
 then raise exception 'Intenção inválida ou expirada.'; end if;

 if not exists(select 1 from private.saas_online_order_activation a
  where a.tenant_id=v_intent.tenant_id and a.enabled)
 then raise exception 'Checkout online não habilitado.'; end if;

 if not exists(select 1 from public.saas_tenants t
  join public.saas_public_stores s on s.tenant_id=t.id
  where t.id=v_intent.tenant_id and t.active
   and s.template_code='virtual_store')
 then raise exception 'Loja indisponível.'; end if;

 -- Locking the intent serializes concurrent attempts for this cart.
 select * into v_existing from private.saas_online_payment_attempts
  where intent_id=p_intent_id;
 if found then
  if v_existing.tenant_id<>v_intent.tenant_id
   or v_existing.request_key<>p_request_key
   or v_existing.amount<>v_intent.subtotal
   or v_existing.state<>'prepared'
  then raise exception 'Tentativa já existente ou chave incompatível.'; end if;
  return query select v_existing.id,v_existing.amount,v_existing.currency,true;
  return;
 end if;

 -- A request key reused against another intent must never be accepted.
 if exists(select 1 from private.saas_online_payment_attempts a
  where a.tenant_id=v_intent.tenant_id and a.request_key=p_request_key)
 then raise exception 'Chave de idempotência já utilizada.'; end if;

 insert into private.saas_online_payment_attempts
  (tenant_id,intent_id,request_key,amount)
 values(v_intent.tenant_id,p_intent_id,p_request_key,v_intent.subtotal)
 returning * into v_existing;
 return query select v_existing.id,v_existing.amount,v_existing.currency,false;
end;
$$;
revoke all on function public.saas_online_payment_attempt_prepare(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.saas_online_payment_attempt_prepare(uuid,uuid)
 to service_role;
