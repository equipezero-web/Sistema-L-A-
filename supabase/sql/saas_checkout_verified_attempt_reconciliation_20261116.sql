-- Reconcile merchant payment attempts and provider-verified receipts atomically.
-- Does not submit Payments API requests, create orders, decrease stock or enable checkout.
-- One provider payment per intent prevents multiple charges from being bound to one cart.
create unique index if not exists saas_transparent_one_payment_per_intent
 on private.saas_online_transparent_payments(intent_id);

create or replace function public.saas_online_transparent_reconcile_attempt(
 p_intent_id uuid,p_payment_id text,p_account_id text,
 p_amount numeric,p_currency text,p_status text
) returns boolean language plpgsql security definer set search_path=''
as $$
declare
 v_intent private.saas_online_order_intents%rowtype;
 v_attempt private.saas_online_payment_attempts%rowtype;
 v_verified boolean;
 v_persisted_status text;
begin
 if p_intent_id is null or p_payment_id is null
   or p_payment_id !~ '^[0-9]{1,30}$'
   or p_account_id is null or p_account_id !~ '^[0-9]{5,30}$'
   or p_amount is null or p_currency is distinct from 'BRL'
   or p_status is null or p_status not in
    ('pending','in_process','approved','rejected','cancelled','refunded','charged_back')
 then return false; end if;

 -- Always lock the intent before the attempt, matching the prepare RPC.
 select * into v_intent from private.saas_online_order_intents
  where id=p_intent_id for update;
 if not found or v_intent.status<>'prepared'
  or v_intent.subtotal<>p_amount then return false; end if;

 select * into v_attempt from private.saas_online_payment_attempts
  where intent_id=p_intent_id for update;
 if not found or v_attempt.tenant_id<>v_intent.tenant_id
  or v_attempt.amount<>p_amount or v_attempt.currency<>'BRL'
 then return false; end if;

 if not exists(select 1 from private.saas_online_transparent_payments b
   where b.intent_id=p_intent_id and b.tenant_id=v_intent.tenant_id
     and b.provider_payment_id=p_payment_id
     and b.provider_account_id=p_account_id
     and b.expected_amount=p_amount)
 then return false; end if;

 -- This RPC verifies only the previously bound payment and writes the
 -- verified status, with downgrade protections. Both operations share a
 -- single database transaction: failure rolls back the entire operation.
 select public.saas_online_transparent_record_verified(
  p_intent_id,p_payment_id,p_account_id,p_amount,p_currency,p_status
 ) into v_verified;
 if v_verified is distinct from true then return false; end if;

 -- Read the canonical persisted status; late webhook events must not
 -- downgrade an approved payment or reverse a refund/chargeback.
 select r.payment_status into v_persisted_status
  from private.saas_online_payment_receipts r
  where r.provider='mercado_pago' and r.provider_payment_id=p_payment_id
   and r.intent_id=p_intent_id and r.tenant_id=v_intent.tenant_id
   and r.provider_account_id=p_account_id and r.amount=p_amount
   and r.currency='BRL';
 if not found then raise exception 'Recibo verificado ausente.'; end if;

 update private.saas_online_payment_attempts
  set state=v_persisted_status
  where id=v_attempt.id;
 return true;
end;
$$;
revoke all on function public.saas_online_transparent_reconcile_attempt(uuid,text,text,numeric,text,text)
 from public,anon,authenticated;
grant execute on function public.saas_online_transparent_reconcile_attempt(uuid,text,text,numeric,text,text)
 to service_role;
