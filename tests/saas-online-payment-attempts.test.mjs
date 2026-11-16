import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/sql/saas_online_payment_attempts_20261116.sql','utf8');
const backend=readFileSync('supabase/functions/saas-transparent-checkout/index.ts','utf8');

test('attempts are private, tenant scoped and idempotent',()=>{
 assert.match(sql,/create table if not exists private\.saas_online_payment_attempts/);
 assert.match(sql,/unique\(intent_id\)/);
 assert.match(sql,/unique\(tenant_id,request_key\)/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on private\.saas_online_payment_attempts from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.saas_online_payment_attempt_prepare\(uuid,uuid\)\s+to service_role/);
 assert.match(sql,/where id=p_intent_id for update/);
 assert.match(sql,/v_existing\.request_key<>p_request_key/);
 assert.match(sql,/v_existing\.state<>'prepared'/);
});

test('attempt cannot be prepared with disabled or expired checkout',()=>{
 assert.match(sql,/v_intent\.expires_at<=now\(\)/);
 assert.match(sql,/v_intent\.subtotal<=0/);
 assert.match(sql,/a\.tenant_id=v_intent\.tenant_id and a\.enabled/);
 assert.match(sql,/s\.template_code='virtual_store'/);
});

test('migration does not create payment or alter order stock and real checkout stays off',()=>{
 assert.doesNotMatch(sql,/https:\/\/api\.mercadopago|v1\/payments|update public\.saas_products|insert into public\.saas_orders/i);
 assert.match(backend,/PAYMENT_PROCESSING_IMPLEMENTED=false/);
 assert.match(backend,/if\(input\.action==="submit"\)/);
});
