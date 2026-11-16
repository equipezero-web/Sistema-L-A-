-- Fase II: estrutura transacional e inativa para pedidos online.
-- NÃO cria saas_orders, não movimenta estoque e NÃO processa pagamentos.
-- Somente backend service_role; ativação comercial exige migração futura com webhook autenticado.
create table if not exists private.saas_online_order_activation (
 tenant_id uuid primary key references public.saas_tenants(id) on delete cascade,
 enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
create table if not exists private.saas_online_order_intents (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
 request_key uuid not null,
 request_fingerprint text not null,
 items jsonb not null,
 subtotal numeric(12,2) not null,
 status text not null default 'prepared',
 expires_at timestamptz not null default (now()+interval '5 minutes'),
 created_at timestamptz not null default now(),
 constraint saas_order_intent_fingerprint_ck check (request_fingerprint ~ '^[0-9a-f]{32}$'),
 constraint saas_order_intent_subtotal_ck check (subtotal >= 0 and subtotal <= 1000000),
 constraint saas_order_intent_status_ck check (status in ('prepared','expired','cancelled')),
 constraint saas_order_intent_idempotent unique(tenant_id,request_key)
);
create index if not exists saas_order_intents_tenant_expiry on private.saas_online_order_intents(tenant_id,expires_at);
alter table private.saas_online_order_activation enable row level security;
alter table private.saas_online_order_intents enable row level security;
revoke all on private.saas_online_order_activation,private.saas_online_order_intents from public,anon,authenticated;

create or replace function public.saas_online_order_prepare(
 p_tenant_id uuid,p_request_key uuid,p_items jsonb
) returns table(intent_id uuid,subtotal numeric,expires_at timestamptz,reused boolean)
language plpgsql security definer set search_path=''
as $$
declare
 v_item jsonb;
 v_product_id uuid;
 v_qty integer;
 v_row record;
 v_count integer;
 v_total_qty integer:=0;
 v_subtotal numeric(12,2):=0;
 v_normalized jsonb;
 v_fingerprint text;
 v_existing private.saas_online_order_intents%rowtype;
begin
 if p_tenant_id is null or p_request_key is null then raise exception 'Solicitação inválida.'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20
 then raise exception 'Informe entre 1 e 20 produtos.'; end if;
 if not exists(
  select 1 from private.saas_online_order_activation a
  where a.tenant_id=p_tenant_id and a.enabled
 ) then raise exception 'Checkout online ainda não habilitado.'; end if;
 if not exists(
  select 1 from public.saas_public_stores s
  where s.tenant_id=p_tenant_id and s.template_code='virtual_store'
 ) then raise exception 'Loja não publicada.'; end if;

 -- Validate and canonicalize the items before computing the idempotency fingerprint.
 for v_item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_item) <> 'object'
    or jsonb_typeof(v_item->'product_id') <> 'string'
    or (v_item->>'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(v_item->'quantity') <> 'number'
    or (v_item->>'quantity') !~ '^[0-9]{1,2}$'
  then raise exception 'Produto ou quantidade inválida.'; end if;
  v_qty:=(v_item->>'quantity')::integer;
  if v_qty not between 1 and 99 then raise exception 'Quantidade inválida.'; end if;
  v_total_qty:=v_total_qty+v_qty;
 end loop;
 if v_total_qty>200 then raise exception 'Quantidade máxima excedida.'; end if;
 select count(*) into v_count from (
   select (e.value->>'product_id')::uuid
   from jsonb_array_elements(p_items) as e(value)
   group by (e.value->>'product_id')::uuid
 ) i;
 if v_count<>jsonb_array_length(p_items) then raise exception 'Produto duplicado.'; end if;

 select jsonb_agg(jsonb_build_object('product_id',(e.value->>'product_id')::uuid,
   'quantity',(e.value->>'quantity')::integer) order by (e.value->>'product_id')::uuid)
 into v_normalized from jsonb_array_elements(p_items) as e(value);
 v_fingerprint:=md5(v_normalized::text);

 select * into v_existing from private.saas_online_order_intents i
 where i.tenant_id=p_tenant_id and i.request_key=p_request_key;
 if found then
  if v_existing.request_fingerprint<>v_fingerprint then raise exception 'Chave de idempotência reutilizada com outro carrinho.'; end if;
  return query select v_existing.id,v_existing.subtotal,v_existing.expires_at,true;
  return;
 end if;

 -- Lock products in canonical order; no stock is reserved and prices are server-derived.
 for v_item in select value from jsonb_array_elements(v_normalized) x order by (value->>'product_id')::uuid loop
  v_product_id:=(v_item->>'product_id')::uuid;
  v_qty:=(v_item->>'quantity')::integer;
  select p.name,p.price,p.stock_quantity,p.published,p.status
    into v_row from public.saas_products p
    where p.id=v_product_id and p.tenant_id=p_tenant_id for share;
  if not found or v_row.status::text<>'active' or not v_row.published
   then raise exception 'Produto indisponível.'; end if;
  if v_row.stock_quantity<v_qty then raise exception 'Estoque insuficiente.'; end if;
  if v_row.price<0 or v_row.price>1000000 then raise exception 'Preço inválido.'; end if;
  v_subtotal:=v_subtotal+(v_row.price*v_qty);
  if v_subtotal>1000000 then raise exception 'Subtotal acima do limite.'; end if;
 end loop;

 insert into private.saas_online_order_intents(tenant_id,request_key,request_fingerprint,items,subtotal)
 values(p_tenant_id,p_request_key,v_fingerprint,v_normalized,v_subtotal)
 on conflict(tenant_id,request_key) do nothing
 returning * into v_existing;
 if found then
   return query select v_existing.id,v_existing.subtotal,v_existing.expires_at,false;
   return;
 end if;
 select * into v_existing from private.saas_online_order_intents
 where tenant_id=p_tenant_id and request_key=p_request_key;
 if v_existing.request_fingerprint<>v_fingerprint then raise exception 'Chave de idempotência reutilizada com outro carrinho.'; end if;
 return query select v_existing.id,v_existing.subtotal,v_existing.expires_at,true;
end;
$$;
revoke all on function public.saas_online_order_prepare(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.saas_online_order_prepare(uuid,uuid,jsonb) to service_role;
