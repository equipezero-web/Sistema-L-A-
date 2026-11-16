import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const booking=readFileSync('supabase/sql/saas_booking_concurrency_guard_20261116.sql','utf8');
const health=readFileSync('supabase/sql/saas_four_flow_healthcheck_20261116.sql','utf8');
const checkout=readFileSync('supabase/functions/saas-transparent-checkout/index.ts','utf8');
const subscription=readFileSync('supabase/functions/saas-merchant-payment-webhook/index.ts','utf8');
const attempts=readFileSync('supabase/sql/saas_online_payment_attempts_20261116.sql','utf8');

test('booking guard serializes competing writes per professional and tenant',()=>{
 assert.match(booking,/pg_advisory_xact_lock/);
 assert.match(booking,/new.tenant_id::text\|\|':'\|\|new.employee_id::text/);
 assert.match(booking,/a.tenant_id=new.tenant_id/);
 assert.match(booking,/a.employee_id=new.employee_id/);
 assert.match(booking,/a.starts_at<new.ends_at and a.ends_at>new.starts_at/);
 assert.match(booking,/a.status::text in \('pending','confirmed'\)/);
 assert.match(booking,/a.id is distinct from new.id/);
 assert.match(booking,/before insert or update of tenant_id,employee_id,starts_at,ends_at,status/);
});
test('healthcheck monitors virtual store payment link consistency',()=>{
 assert.match(health,/payments_without_intent/);
 assert.match(health,/attempts_without_intent/);
 assert.match(health,/multiple_payment_ids_for_intent/);
 assert.match(attempts,/constraint saas_payment_attempt_request_unique unique\(tenant_id,request_key\)/);
 assert.match(checkout,/PAYMENT_PROCESSING_IMPLEMENTED=false/);
});
test('healthcheck covers appointment collisions and customer isolation',()=>{
 assert.match(health,/overlapping_active_professionals/);
 assert.match(health,/invalid_ranges/);
 assert.match(health,/appointments_wrong_tenant/);
 assert.match(health,/orders_wrong_tenant/);
});
test('subscription health checks validate expiry and provider ID uniqueness',()=>{
 assert.match(health,/expired_active_subscriptions/);
 assert.match(health,/duplicated_provider_subscription_ids/);
 assert.match(health,/s.status='active'/);
 assert.doesNotMatch(subscription,/saas_apply_provider_subscription_service/);
});
test('healthcheck cannot be called from browser roles',()=>{
 assert.match(health,/security definer set search_path=''/);
 assert.match(health,/revoke all on function public.saas_four_flow_healthcheck\(\)/);
 assert.match(health,/from public,anon,authenticated/);
 assert.match(health,/grant execute on function public.saas_four_flow_healthcheck\(\) to service_role/);
 assert.doesNotMatch(health,/insert into|update public\.|delete from/i);
});
