-- Merchant-readable delivery details are created only by a verified-paid
-- settlement trigger. Customers and anonymous users cannot query this table.
create table if not exists public.saas_order_delivery_details (
 tenant_id uuid not null,
 order_id uuid not null,
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
 primary key(tenant_id,order_id),
 foreign key(tenant_id,order_id) references public.saas_orders(tenant_id,id) on delete cascade
);
alter table public.saas_order_delivery_details enable row level security;
revoke all on public.saas_order_delivery_details from public,anon,authenticated;
grant select on public.saas_order_delivery_details to authenticated;
grant all on public.saas_order_delivery_details to service_role;
drop policy if exists saas_order_delivery_read on public.saas_order_delivery_details;
create policy saas_order_delivery_read on public.saas_order_delivery_details
 for select to authenticated using (
 public.saas_has_tenant_role(tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role])
 );
create or replace function private.saas_attach_confirmed_order_delivery()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='fulfilled' and new.order_id is not null then
  insert into public.saas_order_delivery_details(
    tenant_id,order_id,recipient_name,email,phone,mode,
    postal_code,street,street_number,complement,neighborhood,city,region)
  select new.tenant_id,new.order_id,d.recipient_name,d.email,d.phone,d.mode,
   d.postal_code,d.street,d.street_number,d.complement,d.neighborhood,d.city,d.region
  from private.saas_online_checkout_delivery d
  where d.intent_id=new.intent_id and d.tenant_id=new.tenant_id
  on conflict(tenant_id,order_id) do nothing;
  if not found then raise exception 'Comprovante de entrega não associado ao pedido.'; end if;
 end if;
 return new;
end $$;
revoke all on function private.saas_attach_confirmed_order_delivery() from public,anon,authenticated;
drop trigger if exists saas_attach_paid_order_delivery on private.saas_online_paid_order_settlements;
create trigger saas_attach_paid_order_delivery after insert or update of state
 on private.saas_online_paid_order_settlements for each row
 execute function private.saas_attach_confirmed_order_delivery();
