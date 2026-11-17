-- Merchant order dispatch tracking. Payments and inventory are untouched.
create table if not exists public.saas_order_fulfillment(
 tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
 order_id uuid not null,
 state text not null default 'preparing' check(state in ('preparing','ready','shipped','delivered','returned')),
 carrier text,
 tracking_reference text,
 shipping_notes text,
 changed_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(tenant_id,order_id),
 foreign key(tenant_id,order_id) references public.saas_orders(tenant_id,id) on delete cascade,
 check(char_length(coalesce(carrier,''))<=100 and char_length(coalesce(tracking_reference,''))<=180
   and char_length(coalesce(shipping_notes,''))<=600)
);
alter table public.saas_order_fulfillment enable row level security;
revoke all on public.saas_order_fulfillment from public,anon,authenticated;
grant select,insert on public.saas_order_fulfillment to authenticated;
grant update(state,carrier,tracking_reference,shipping_notes,changed_by,updated_at)
 on public.saas_order_fulfillment to authenticated;
grant all on public.saas_order_fulfillment to service_role;
drop policy if exists saas_fulfillment_read on public.saas_order_fulfillment;
create policy saas_fulfillment_read on public.saas_order_fulfillment for select to authenticated
 using(public.saas_is_tenant_member(tenant_id));
drop policy if exists saas_fulfillment_insert on public.saas_order_fulfillment;
create policy saas_fulfillment_insert on public.saas_order_fulfillment for insert to authenticated
 with check(changed_by=(select auth.uid()) and state='preparing'
  and public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role])
  and exists(select 1 from public.saas_orders o
   where o.tenant_id=saas_order_fulfillment.tenant_id and o.id=order_id
     and o.status::text in ('confirmed','completed')));
drop policy if exists saas_fulfillment_update on public.saas_order_fulfillment;
create policy saas_fulfillment_update on public.saas_order_fulfillment for update to authenticated
 using(public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]))
 with check(changed_by=(select auth.uid()) and
  public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]));
