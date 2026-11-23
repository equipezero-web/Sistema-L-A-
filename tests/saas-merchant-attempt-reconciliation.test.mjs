import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/sql/saas_checkout_verified_attempt_reconciliation_20261116.sql','utf8');
const webhook=readFileSync('supabase/functions/saas-merchant-payment-webhook/index.ts','utf8');
const checkout=readFileSync('supabase/functions/saas-transparent-checkout/index.ts','utf8');

test('Only one provider payment can bind to each intent',()=>{
 assert.match(sql,/create unique index if not exists saas_transparent_one_payment_per_intent/);
 assert.match(sql,/on private\.saas_online_transparent_payments\(intent_id\)/);
});
test('Reconciliation is private and writes only persisted verified statuses',()=>{
 assert.match(sql,/security definer set search_path=''/);
 assert.match(sql,/where id=p_intent_id for update/);
 assert.match(sql,/where intent_id=p_intent_id for update/);
 assert.match(sql,/b\.provider_payment_id=p_payment_id/);
 assert.match(sql,/b\.provider_account_id=p_account_id/);
 assert.match(sql,/public\.saas_online_transparent_record_verified/);
 assert.match(sql,/select r\.payment_status into v_persisted_status/);
 assert.match(sql,/set state=v_persisted_status/);
 assert.match(sql,/revoke all on function public\.saas_online_transparent_reconcile_attempt\(uuid,text,text,numeric,text,text\)/);
 assert.match(sql,/to service_role/);
 assert.match(webhook,/saas_online_transparent_reconcile_attempt/);
 assert.doesNotMatch(sql,/update public\.saas_products|insert into public\.saas_orders|https:\/\/api\.mercadopago/i);
});
test('Real checkout remains explicitly disabled',()=>{
 assert.match(checkout,/PAYMENT_PROCESSING_IMPLEMENTED=false/);
 assert.match(checkout,/SAAS_CHECKOUT_SANDBOX_ENABLED/);
});
