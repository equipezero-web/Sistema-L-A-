-- Read-only operational health checks covering four critical domains.
-- Exposed solely to service_role. It never updates billing, customers, orders or stock.
create or replace function public.saas_four_flow_healthcheck()
returns jsonb language sql security definer set search_path='' stable as $$
 select pg_catalog.jsonb_build_object(
   'virtual_store', pg_catalog.jsonb_build_object(
      'checkout_enabled_tenants',(select count(*) from private.saas_online_order_activation where enabled),
      'payments_without_intent',(select count(*) from private.saas_online_transparent_payments b
        left join private.saas_online_order_intents i on i.id=b.intent_id and i.tenant_id=b.tenant_id where i.id is null),
      'attempts_without_intent',(select count(*) from private.saas_online_payment_attempts a
        left join private.saas_online_order_intents i on i.id=a.intent_id and i.tenant_id=a.tenant_id where i.id is null),
      'multiple_payment_ids_for_intent',(select count(*) from (
        select intent_id from private.saas_online_transparent_payments group by intent_id having count(*)>1
      ) x)
   ),
   'appointments', pg_catalog.jsonb_build_object(
      'overlapping_active_professionals',(select count(*) from public.saas_appointments a
        join public.saas_appointments b on a.id<b.id
         and a.tenant_id=b.tenant_id and a.employee_id=b.employee_id
         and a.employee_id is not null
         and a.status::text in ('pending','confirmed')
         and b.status::text in ('pending','confirmed')
         and a.starts_at<b.ends_at and b.starts_at<a.ends_at),
      'invalid_ranges',(select count(*) from public.saas_appointments where ends_at<=starts_at)
   ),
   'customers', pg_catalog.jsonb_build_object(
      'appointments_wrong_tenant',(select count(*) from public.saas_appointments a
        join public.saas_customers c on c.id=a.customer_id where c.tenant_id<>a.tenant_id),
      'orders_wrong_tenant',(select count(*) from public.saas_orders o
        join public.saas_customers c on c.id=o.customer_id where c.tenant_id<>o.tenant_id)
   ),
   'subscriptions', pg_catalog.jsonb_build_object(
      'expired_active_subscriptions',(select count(*) from public.saas_subscriptions s
        where s.status='active' and s.current_period_end is not null and s.current_period_end<=now()),
      'duplicated_provider_subscription_ids',(select count(*) from (
        select provider,provider_subscription_id from public.saas_subscriptions
        where provider_subscription_id is not null
        group by provider,provider_subscription_id having count(*)>1
      ) x)
   )
 );
$$;
revoke all on function public.saas_four_flow_healthcheck()
 from public,anon,authenticated;
grant execute on function public.saas_four_flow_healthcheck() to service_role;
