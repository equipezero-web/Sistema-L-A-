-- L&A Royal SaaS | Defesa em profundidade para snapshot de IA por perfil.
-- Versão aplicada no Supabase (2026-11-04), reproduzível e idempotente.
-- Mesmo quando a RPC é chamada diretamente, funcionários não recebem
-- faturamento consolidado nem receitas por produto/serviço.

CREATE OR REPLACE FUNCTION public.saas_ai_business_snapshot(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$

with base as (
select jsonb_build_object(
    'tenant', (select jsonb_build_object('name',t.name,'business_mode',t.business_mode,'business_type',t.business_type) from public.saas_tenants t where t.id=p_tenant_id),
    'financial_30d', jsonb_build_object(
      'income', coalesce((select sum(f.amount) from public.saas_financial_entries f where f.tenant_id=p_tenant_id and f.kind='income' and f.occurred_on >= current_date-29),0),
      'expense', coalesce((select sum(f.amount) from public.saas_financial_entries f where f.tenant_id=p_tenant_id and f.kind='expense' and f.occurred_on >= current_date-29),0)
    ),
    'financial_previous_30d', jsonb_build_object(
      'income', coalesce((select sum(f.amount) from public.saas_financial_entries f where f.tenant_id=p_tenant_id and f.kind='income' and f.occurred_on between current_date-59 and current_date-30),0),
      'expense', coalesce((select sum(f.amount) from public.saas_financial_entries f where f.tenant_id=p_tenant_id and f.kind='expense' and f.occurred_on between current_date-59 and current_date-30),0)
    ),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.price,'stock',p.stock_quantity,'status',p.status) order by p.stock_quantity asc) from (select id,tenant_id,name,price,stock_quantity,status from public.saas_products where tenant_id=p_tenant_id and status='active' order by stock_quantity asc limit 30) p),'[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'price',s.price,'duration_minutes',s.duration_minutes) order by s.name) from (select * from public.saas_services where tenant_id=p_tenant_id and status='active' order by created_at desc limit 30) s),'[]'::jsonb),
    'orders_30d', (select count(*) from public.saas_orders o where o.tenant_id=p_tenant_id and o.created_at >= now()-interval '30 days'),
    'completed_orders_30d', (select count(*) from public.saas_orders o where o.tenant_id=p_tenant_id and o.status='completed' and o.created_at >= now()-interval '30 days'),
    'order_revenue_30d', coalesce((select sum(o.total) from public.saas_orders o where o.tenant_id=p_tenant_id and o.status='completed' and o.created_at >= now()-interval '30 days'),0),
    'appointments_30d', (select count(*) from public.saas_appointments a where a.tenant_id=p_tenant_id and a.starts_at >= now()-interval '30 days'),
    'completed_appointments_30d', (select count(*) from public.saas_appointments a where a.tenant_id=p_tenant_id and a.status='completed' and a.starts_at >= now()-interval '30 days'),
    'upcoming_appointments', (select count(*) from public.saas_appointments a where a.tenant_id=p_tenant_id and a.starts_at >= now() and a.starts_at < now()+interval '7 days' and a.status not in ('cancelled','completed','no_show')),
    'active_customers', (select count(*) from public.saas_customers c where c.tenant_id=p_tenant_id and c.status='active'),
    'active_employees', (select count(*) from public.saas_employees e where e.tenant_id=p_tenant_id and e.status='active'),
    'low_stock_count', (select count(*) from public.saas_products p where p.tenant_id=p_tenant_id and p.status='active' and p.stock_quantity <= 5),
    'top_products_30d', coalesce((select jsonb_agg(x order by (x->>'quantity')::numeric desc) from (select jsonb_build_object('name',coalesce(p.name,oi.description),'quantity',sum(oi.quantity),'revenue',sum(oi.total)) x from public.saas_order_items oi join public.saas_orders o on o.id=oi.order_id and o.tenant_id=oi.tenant_id left join public.saas_products p on p.id=oi.product_id and p.tenant_id=oi.tenant_id where oi.tenant_id=p_tenant_id and o.status='completed' and o.created_at>=now()-interval '30 days' group by coalesce(p.name,oi.description) order by sum(oi.quantity) desc limit 5) q),'[]'::jsonb),
    'top_services_30d', coalesce((select jsonb_agg(x order by (x->>'appointments')::numeric desc) from (select jsonb_build_object('name',s.name,'appointments',count(*),'revenue',sum(s.price)) x from public.saas_appointments a join public.saas_services s on s.id=a.service_id and s.tenant_id=a.tenant_id where a.tenant_id=p_tenant_id and a.status='completed' and a.starts_at>=now()-interval '30 days' group by s.name order by count(*) desc limit 5) q),'[]'::jsonb)
  ) as data
  where public.saas_is_platform_super_admin() or public.saas_is_tenant_member(p_tenant_id)
)
select case
 when public.saas_is_platform_super_admin() or public.saas_has_tenant_role(p_tenant_id,array['owner'::public.saas_member_role,'admin'::public.saas_member_role]) then data
 else (data - 'financial_30d' - 'financial_previous_30d' - 'order_revenue_30d') ||
      jsonb_build_object(
       'top_products_30d',coalesce((select jsonb_agg(x - 'revenue') from jsonb_array_elements(coalesce(data->'top_products_30d','[]'::jsonb)) x),'[]'::jsonb),
       'top_services_30d',coalesce((select jsonb_agg(x - 'revenue') from jsonb_array_elements(coalesce(data->'top_services_30d','[]'::jsonb)) x),'[]'::jsonb)
      )
 end
from base
;
$function$
