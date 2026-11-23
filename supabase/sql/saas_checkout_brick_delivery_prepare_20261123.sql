-- Checkout Brick sandbox preparation and private delivery snapshot.
-- The provider charge is never created in SQL. Only service_role can call these
-- functions; customer data is not exposed through public RLS or catalog.
create table if not exists private.saas_online_checkout_delivery (
 intent_id uuid primary key references private.saas_online_order_intents(id) on delete cascade,
 tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
 recipient_name text not null,
 email text not null,
 phone text not null,
 mode text not null check(mode in ('pickup','delivery')),
 postal_code text,
 street text,
 street_number text,
 complement text,
 neighborhood text,
 city text,
 region text,
 created_at timestamptz not null default now(),
 check(length(recipient_name) between 2 and 120),
 check(length(email) between 6 and 254),
 check(length(phone) between 10 and 20),
 check(mode='pickup' or (postal_code ~ '^[0-9]{8}$'
  and length(street) between 3 and 160
  and length(street_number) between 1 and 20
  and length(neighborhood) between 2 and 100
  and length(city) between 2 and 100
  and region ~ '^[A-Z]{2}$'))
);
create index if not exists saas_checkout_delivery_tenant on private.saas_online_checkout_delivery(tenant_id);
alter table private.saas_online_checkout_delivery enable row level security;
revoke all on private.saas_online_checkout_delivery from public,anon,authenticated;

-- No privileged data or payment token is returned to the browser by SQL.
create or replace function public.saas_online_checkout_prepare_secure(
 p_slug text,p_request_key uuid,p_items jsonb,p_delivery jsonb
) returns table(intent_id uuid,attempt_id uuid,amount_cents bigint,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_tenant uuid;v_i record;v_a record;v_d private.saas_online_checkout_delivery%rowtype;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role'
 then raise exception 'Backend exclusivo.'; end if;
 if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$'
    or p_request_key is null or jsonb_typeof(p_delivery)<>'object'
 then raise exception 'Dados da solicitação inválidos.'; end if;
 select s.tenant_id into v_tenant from public.saas_public_stores s
 join public.saas_tenants t on t.id=s.tenant_id and t.active
 join private.saas_online_order_activation a on a.tenant_id=s.tenant_id and a.enabled
 where s.slug=p_slug and s.template_code='virtual_store';
 if v_tenant is null then raise exception 'Loja não habilitada para pagamentos.'; end if;
 v_d.recipient_name:=btrim(coalesce(p_delivery->>'recipient_name',''));
 v_d.email:=lower(btrim(coalesce(p_delivery->>'email','')));
 v_d.phone:=regexp_replace(coalesce(p_delivery->>'phone',''),'[^0-9]','','g');
 v_d.mode:=p_delivery->>'mode';
 v_d.postal_code:=regexp_replace(coalesce(p_delivery->>'postal_code',''),'[^0-9]','','g');
 v_d.street:=btrim(coalesce(p_delivery->>'street',''));
 v_d.street_number:=btrim(coalesce(p_delivery->>'street_number',''));
 v_d.complement:=btrim(coalesce(p_delivery->>'complement',''));
 v_d.neighborhood:=btrim(coalesce(p_delivery->>'neighborhood',''));
 v_d.city:=btrim(coalesce(p_delivery->>'city',''));
 v_d.region:=upper(btrim(coalesce(p_delivery->>'region','')));
 if length(v_d.recipient_name) not between 2 and 120
  or v_d.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or length(v_d.email)>254
  or length(v_d.phone) not between 10 and 13
  or v_d.mode not in ('pickup','delivery')
  or length(v_d.complement)>160
 then raise exception 'Destinatário inválido.'; end if;
 if v_d.mode='delivery' and
    (v_d.postal_code !~ '^[0-9]{8}$'
    or length(v_d.street) not between 3 and 160
    or length(v_d.street_number) not between 1 and 20
    or length(v_d.neighborhood) not between 2 and 100
    or length(v_d.city) not between 2 and 100
    or v_d.region !~ '^[A-Z]{2}$')
 then raise exception 'Endereço de entrega incompleto.'; end if;
 if v_d.mode='pickup' then
  v_d.postal_code:=null;v_d.street:=null;v_d.street_number:=null;
  v_d.complement:=null;v_d.neighborhood:=null;v_d.city:=null;v_d.region:=null;
 end if;
 -- The original preparation RPC recalculates price and stock from the DB,
 -- fingerprints all products and handles request-key reuse.
 select * into v_i from public.saas_online_order_prepare(v_tenant,p_request_key,p_items);
 if not found or v_i.expires_at<=now() then raise exception 'Cotação expirada.'; end if;
 insert into private.saas_online_checkout_delivery(
  intent_id,tenant_id,recipient_name,email,phone,mode,postal_code,
  street,street_number,complement,neighborhood,city,region)
 values(v_i.intent_id,v_tenant,v_d.recipient_name,v_d.email,v_d.phone,v_d.mode,
  v_d.postal_code,v_d.street,v_d.street_number,v_d.complement,
  v_d.neighborhood,v_d.city,v_d.region)
 on conflict(intent_id) do nothing;
 -- An already prepared idempotent request must have the EXACT delivery data.
 if not exists(select 1 from private.saas_online_checkout_delivery d
  where d.intent_id=v_i.intent_id and d.tenant_id=v_tenant
   and d.recipient_name=v_d.recipient_name and d.email=v_d.email
   and d.phone=v_d.phone and d.mode=v_d.mode
   and d.postal_code is not distinct from v_d.postal_code
   and d.street is not distinct from v_d.street
   and d.street_number is not distinct from v_d.street_number
   and d.complement is not distinct from v_d.complement
   and d.neighborhood is not distinct from v_d.neighborhood
   and d.city is not distinct from v_d.city
   and d.region is not distinct from v_d.region)
 then raise exception 'Solicitação reutilizada com outro destinatário.'; end if;
 select * into v_a from public.saas_online_payment_attempt_prepare(v_i.intent_id,p_request_key);
 if not found or v_a.currency<>'BRL'
  or v_a.amount<>v_i.subtotal or v_a.amount<=0
 then raise exception 'Tentativa de pagamento inválida.'; end if;
 return query select v_i.intent_id,v_a.attempt_id,
   (v_a.amount*100)::bigint,v_i.expires_at;
end $$;
revoke all on function public.saas_online_checkout_prepare_secure(text,uuid,jsonb,jsonb)
 from public,anon,authenticated;
grant execute on function public.saas_online_checkout_prepare_secure(text,uuid,jsonb,jsonb) to service_role;

-- Seller information is taken from Vault and matched by tenant, not supplied
-- by the browser. Caller MUST be service_role; never expose in public API.
create or replace function public.saas_online_checkout_seller_secret(p_slug text)
returns table(account_id text,access_token text,public_key text,tenant_id uuid)
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role'
 then raise exception 'Backend exclusivo.'; end if;
 return query select c.provider_account_id,v.decrypted_secret,c.checkout_public_key,t.id
 from public.saas_public_stores s
 join public.saas_tenants t on t.id=s.tenant_id and t.active
 join private.saas_online_order_activation a on a.tenant_id=t.id and a.enabled
 join private.saas_merchant_oauth_credentials c on c.tenant_id=t.id
 join public.saas_merchant_payment_connections m on m.tenant_id=t.id
  and m.provider='mercado_pago' and m.status='connected'
 join vault.decrypted_secrets v on v.id=c.access_secret_id
 where s.slug=p_slug and s.template_code='virtual_store'
  and c.token_expires_at>now()+interval '30 seconds'
 limit 1;
end $$;
revoke all on function public.saas_online_checkout_seller_secret(text)
 from public,anon,authenticated;
grant execute on function public.saas_online_checkout_seller_secret(text) to service_role;
