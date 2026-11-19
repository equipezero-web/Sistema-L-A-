import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync('supabase/sql/saas_payment_reconcile_in_process_fix_20261119.sql','utf8');
const attempts=readFileSync('supabase/sql/saas_online_payment_attempts_20261116.sql','utf8');
const webhook=readFileSync('supabase/functions/saas-merchant-payment-webhook/index.ts','utf8');
const checkout=readFileSync('supabase/functions/saas-transparent-checkout/index.ts','utf8');

test('provider in_process is preserved as receipt but mapped to accepted attempt pending',()=>{
 assert.match(attempts,/state in \('prepared','submitted','pending','approved'/);
 assert.doesNotMatch(attempts,/state in \([^)]*'in_process'/);
 assert.match(migration,/set state=case when v_persisted_status='in_process' then 'pending' else v_persisted_status end/);
 assert.match(migration,/select r\.payment_status into v_persisted_status/);
 assert.match(migration,/public\.saas_online_transparent_record_verified/);
});
test('reconciliation still locks correct intent and attempt, verifies binding and denies browser roles',()=>{
 assert.match(migration,/where id=p_intent_id for update/);
 assert.match(migration,/where intent_id=p_intent_id for update/);
 assert.match(migration,/b\.provider_account_id=p_account_id/);
 assert.match(migration,/revoke all on function public\.saas_online_transparent_reconcile_attempt\(uuid,text,text,numeric,text,text\)/);
 assert.match(migration,/to service_role/);
 assert.match(webhook,/saas_online_transparent_reconcile_attempt/);
});
test('payments remain disabled until complete commercial authorization and fulfillment',()=>{
 assert.match(checkout,/PAYMENT_PROCESSING_IMPLEMENTED=false/);
 assert.doesNotMatch(migration,/insert into public\.saas_orders|update public\.saas_products|saas_online_order_activation set enabled/i);
});
