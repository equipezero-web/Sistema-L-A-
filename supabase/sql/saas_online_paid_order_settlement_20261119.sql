-- Verified merchant-payment fulfillment. Every call must use a service-role
-- JWT, a provider-confirmed receipt and an existing bound seller payment.
-- Never accepts client prices, free-form order payloads or bearer tokens.
-- Checkout remains disabled independently by the Edge Function.
create table if not exists private.saas_online_paid_order_settlements(
  intent_id uuid primary key references private.saas_online_order_intents(id) on delete cascade,
  tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
  provider_payment_id text not null unique,
  order_id uuid unique,
  state text not null check(state in ('fulfilled','needs_review','reversed','refund_review')),
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id,order_id) references public.saas_orders(tenant_id,id)
);
create index if not exists saas_paid_settlements_tenant_state
  on private.saas_online_paid_order_settlements(tenant_id,state);
alter table private.saas_online_paid_order_settlements enable row level security;
revoke all on private.saas_online_paid_order_settlements from public,anon,authenticated;

-- Allow the server-side verified-paid transaction through existing tenant
-- operational guards, but never allow client-authenticated operations to
-- impersonate the backend by setting an arbitrary PostgreSQL GUC.
create or replace function private.saas_verified_commerce_context()
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select auth.jwt()->>'role')='service_role',false)
   and coalesce(pg_catalog.current_setting('app.saas_verified_commerce',true),'')='allowed';
$$;
revoke all on function private.saas_verified_commerce_context() from public,anon,authenticated;
grant execute on function private.saas_verified_commerce_context() to service_role;

create or replace function public.saas_guard_operational_status()
returns trigger language plpgsql set search_path='' as $$
begin
 if private.saas_verified_commerce_context() then return new; end if;
 if public.saas_has_tenant_role(new.tenant_id,
    array['owner'::public.saas_member_role,'admin'::public.saas_member_role])
    or public.saas_is_platform_super_admin() then return new; end if;
 if tg_table_name='saas_appointments' and booking_private.saas_reception_allowed(new.tenant_id) then
  if tg_op='INSERT' and new.status::text='confirmed' then return new; end if;
  if tg_op='UPDATE' and old.status::text in ('confirmed','pending')
   and new.status::text='completed'
   and (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at')
  then return new; end if;
  raise exception 'A recepção só pode confirmar solicitações e concluir atendimentos permitidos.';
 end if;
 if not public.saas_has_tenant_role(new.tenant_id,array['employee'::public.saas_member_role])
 then raise exception 'Sem permissão para alterar este registro.'; end if;
 if tg_op='INSERT' then
   if new.status::text<>'pending' then raise exception 'Funcionários só podem criar registros pendentes.'; end if;
 else
  if old.status::text<>'pending' or new.status is distinct from old.status
  then raise exception 'Somente administradores podem alterar o status.'; end if;
  if tg_table_name='saas_orders' and (
    to_jsonb(new)->'total' is distinct from to_jsonb(old)->'total'
    or to_jsonb(new)->'subtotal' is distinct from to_jsonb(old)->'subtotal'
    or to_jsonb(new)->'discount' is distinct from to_jsonb(old)->'discount')
  then raise exception 'Funcionários não podem alterar valores de pedidos existentes.'; end if;
  if tg_table_name='saas_appointments' and new.price is distinct from old.price
  then raise exception 'Funcionários não podem alterar valores de agendamentos existentes.'; end if;
 end if;
 return new;
end $$;

create or replace function public.saas_guard_order_items()
returns trigger language plpgsql set search_path='' as $$
declare v_status text;
begin
 if private.saas_verified_commerce_context() then return new; end if;
 if public.saas_has_tenant_role(new.tenant_id,
  array['owner'::public.saas_member_role,'admin'::public.saas_member_role])
  or public.saas_is_platform_super_admin() then return new; end if;
 if not public.saas_has_tenant_role(new.tenant_id,
  array['employee'::public.saas_member_role])
 then raise exception 'Sem permissão para modificar itens.'; end if;
 select status::text into v_status from public.saas_orders
  where id=new.order_id and tenant_id=new.tenant_id;
 if v_status is distinct from 'pending'
 then raise exception 'Itens só podem ser registrados em pedidos pendentes.'; end if;
 if tg_op='UPDATE' then raise exception 'Funcionários não podem alterar itens existentes.'; end if;
 return new;
end $$;

-- A paid order cannot be marked cancelled by the merchant before a verified
-- refund/chargeback. The refund reconciler performs the approved transition.
create or replace function private.saas_protect_paid_order_cancellation()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and new.status::text='cancelled'
    and old.status::text<>'cancelled'
    and exists(select 1 from private.saas_online_paid_order_settlements s
      where s.tenant_id=old.tenant_id and s.order_id=old.id and s.state='fulfilled')
    and not private.saas_verified_commerce_context()
 then raise exception 'Reembolso confirmado pelo provedor é obrigatório para cancelar pedido pago.'; end if;
 return new;
end $$;
revoke all on function private.saas_protect_paid_order_cancellation() from public,anon,authenticated;
drop trigger if exists saas_paid_order_cancellation_guard on public.saas_orders;
create trigger saas_paid_order_cancellation_guard
 before update of status on public.saas_orders for each row
 execute function private.saas_protect_paid_order_cancellation();

create or replace function public.saas_online_settle_verified_payment(p_intent_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
 v_intent private.saas_online_order_intents%rowtype;
 v_receipt private.saas_online_payment_receipts%rowtype;
 v_bound private.saas_online_transparent_payments%rowtype;
 v_existing private.saas_online_paid_order_settlements%rowtype;
 v_item jsonb;
 v_product record;
 v_qty integer;
 v_total numeric(12,2):=0;
 v_new_order uuid;
 v_rows integer:=0;
 v_reason text;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role'
 then raise exception 'Backend exclusivo.'; end if;
 if p_intent_id is null then raise exception 'Intenção ausente.'; end if;
 -- Serialize concurrent webhook invocations and return the already committed
 -- result on retries. A failed insert rolls back order, stock and settlement.
 select * into v_intent from private.saas_online_order_intents
  where id=p_intent_id for update;
 if not found then return 'not_found'; end if;
 select * into v_existing from private.saas_online_paid_order_settlements
  where intent_id=p_intent_id for update;
 if found then return v_existing.state; end if;
 select * into v_receipt from private.saas_online_payment_receipts
  where intent_id=p_intent_id and tenant_id=v_intent.tenant_id
  and provider='mercado_pago' and payment_status='approved';
 if not found then return 'not_approved'; end if;
 select * into v_bound from private.saas_online_transparent_payments
  where intent_id=p_intent_id and tenant_id=v_intent.tenant_id
  and provider_payment_id=v_receipt.provider_payment_id
  and provider_account_id=v_receipt.provider_account_id
  and expected_amount=v_receipt.amount;
 if not found or v_receipt.currency<>'BRL'
   or v_receipt.amount<>v_intent.subtotal
 then return 'invalid_binding'; end if;
 if v_intent.status<>'prepared'
   or not exists(select 1 from public.saas_tenants t
     where t.id=v_intent.tenant_id and t.active)
 then return 'invalid_intent'; end if;
 if jsonb_typeof(v_intent.items)<>'array'
    or jsonb_array_length(v_intent.items) not between 1 and 20
 then return 'invalid_items'; end if;

 -- Lock every product in sorted order to prevent concurrent overselling.
 -- A mismatch is held for manual refund/stock review; do not create an order
 -- with fabricated line prices or allocate stock to an unpaid cart.
 for v_item in select value from jsonb_array_elements(v_intent.items) as e(value)
   order by (value->>'product_id')::uuid loop
  v_qty:=(v_item->>'quantity')::integer;
  if v_qty not between 1 and 99 then v_reason:='invalid_quantity';exit;end if;
  select p.id,p.name,p.price,p.stock_quantity,p.status,p.published
   into v_product from public.saas_products p
   where p.tenant_id=v_intent.tenant_id
      and p.id=(v_item->>'product_id')::uuid for update;
  if not found then v_reason:='product_missing';exit;end if;
  if v_product.status::text<>'active' or not v_product.published
    or v_product.stock_quantity<v_qty
  then v_reason:='stock_or_availability_changed';exit;end if;
  v_total:=v_total+v_product.price*v_qty;
  v_rows:=v_rows+1;
 end loop;
 if v_reason is null and
   (v_rows<>jsonb_array_length(v_intent.items) or v_total<>v_intent.subtotal)
 then v_reason:='price_or_cart_changed';end if;
 if v_reason is not null then
  insert into private.saas_online_paid_order_settlements
    (intent_id,tenant_id,provider_payment_id,state,review_reason)
  values(p_intent_id,v_intent.tenant_id,v_receipt.provider_payment_id,'needs_review',v_reason);
  return 'needs_review';
 end if;

 -- The existing order/item triggers accept this scoped internal transaction
 -- only with a service-role JWT. Setting this flag as a browser user is useless.
 perform pg_catalog.set_config('app.saas_verified_commerce','allowed',true);
 insert into public.saas_orders
  (tenant_id,status,subtotal,discount,total,notes)
 values(v_intent.tenant_id,'confirmed',v_total,0,v_total,
   'Pagamento Mercado Pago confirmado; referência de intenção: '||p_intent_id::text)
 returning id into v_new_order;
 for v_item in select value from jsonb_array_elements(v_intent.items) as e(value)
    order by (value->>'product_id')::uuid loop
  v_qty:=(v_item->>'quantity')::integer;
  select p.id,p.name,p.price into v_product from public.saas_products p
    where p.tenant_id=v_intent.tenant_id
      and p.id=(v_item->>'product_id')::uuid for update;
  insert into public.saas_order_items
    (tenant_id,order_id,product_id,description,quantity,unit_price,total)
  values (v_intent.tenant_id,v_new_order,v_product.id,v_product.name,v_qty,
    v_product.price,v_product.price*v_qty);
  -- Existing stock guard requires the same scoped adjustment flag used by
  -- saas_adjust_inventory_impl; the ledger and stock update are atomic.
  perform pg_catalog.set_config('app.saas_inventory_adjustment','allowed',true);
  update public.saas_products set stock_quantity=stock_quantity-v_qty
   where id=v_product.id and tenant_id=v_intent.tenant_id;
  insert into public.saas_inventory_movements
    (tenant_id,product_id,quantity_delta,reason,reference_type,reference_id)
  values(v_intent.tenant_id,v_product.id,-v_qty,'Pedido online pago',
    'saas_online_paid_order',v_new_order);
  perform pg_catalog.set_config('app.saas_inventory_adjustment','',true);
 end loop;
 insert into private.saas_online_paid_order_settlements
  (intent_id,tenant_id,provider_payment_id,order_id,state)
 values(p_intent_id,v_intent.tenant_id,v_receipt.provider_payment_id,
  v_new_order,'fulfilled');
 perform pg_catalog.set_config('app.saas_verified_commerce','',true);
 return 'fulfilled';
end; $$;
revoke all on function public.saas_online_settle_verified_payment(uuid) from public,anon,authenticated;
grant execute on function public.saas_online_settle_verified_payment(uuid) to service_role;
