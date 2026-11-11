-- Etapa #54 — Cover six tenant-scoped composite foreign keys.
-- Does not change rows, RLS, roles, or subscription/payment behavior.
-- Names are unique; IF NOT EXISTS makes repeat deployments safe.
create index if not exists saas_appointments_tenant_customer_idx
 on public.saas_appointments(tenant_id, customer_id);
create index if not exists saas_appointments_tenant_employee_idx
 on public.saas_appointments(tenant_id, employee_id);
create index if not exists saas_appointments_tenant_service_idx
 on public.saas_appointments(tenant_id, service_id);
create index if not exists saas_order_items_tenant_order_idx
 on public.saas_order_items(tenant_id, order_id);
create index if not exists saas_order_items_tenant_product_idx
 on public.saas_order_items(tenant_id, product_id);
create index if not exists saas_orders_tenant_customer_idx
 on public.saas_orders(tenant_id, customer_id);
