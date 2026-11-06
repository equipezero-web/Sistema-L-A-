-- L&A Royal SaaS — Etapa #45 (2026-11-06)
-- Prevent cross-tenant references even when RLS correctly authorizes the parent row.
-- Preserve existing deletion behavior: CASCADE for order items/inventory,
-- SET NULL only on nullable foreign key columns for customers/products/services.
-- PostgreSQL >= 15 supports column-specific ON DELETE SET NULL; project uses 17.
-- Preflight of all seven relationships returned 0 mismatches (2026-11-06).

create unique index if not exists saas_customers_tenant_id_id_key
  on public.saas_customers(tenant_id,id);
create unique index if not exists saas_orders_tenant_id_id_key
  on public.saas_orders(tenant_id,id);
create unique index if not exists saas_products_tenant_id_id_key
  on public.saas_products(tenant_id,id);
create unique index if not exists saas_employees_tenant_id_id_key
  on public.saas_employees(tenant_id,id);
create unique index if not exists saas_services_tenant_id_id_key
  on public.saas_services(tenant_id,id);

alter table public.saas_orders
  add constraint saas_orders_tenant_customer_fkey
  foreign key(tenant_id,customer_id)
  references public.saas_customers(tenant_id,id)
  on delete set null (customer_id);

alter table public.saas_order_items
  add constraint saas_order_items_tenant_order_fkey
  foreign key(tenant_id,order_id)
  references public.saas_orders(tenant_id,id)
  on delete cascade;

alter table public.saas_order_items
  add constraint saas_order_items_tenant_product_fkey
  foreign key(tenant_id,product_id)
  references public.saas_products(tenant_id,id)
  on delete set null (product_id);

alter table public.saas_appointments
  add constraint saas_appointments_tenant_customer_fkey
  foreign key(tenant_id,customer_id)
  references public.saas_customers(tenant_id,id)
  on delete set null (customer_id);

alter table public.saas_appointments
  add constraint saas_appointments_tenant_employee_fkey
  foreign key(tenant_id,employee_id)
  references public.saas_employees(tenant_id,id)
  on delete set null (employee_id);

alter table public.saas_appointments
  add constraint saas_appointments_tenant_service_fkey
  foreign key(tenant_id,service_id)
  references public.saas_services(tenant_id,id)
  on delete set null (service_id);

alter table public.saas_inventory_movements
  add constraint saas_inventory_movements_tenant_product_fkey
  foreign key(tenant_id,product_id)
  references public.saas_products(tenant_id,id)
  on delete cascade;
