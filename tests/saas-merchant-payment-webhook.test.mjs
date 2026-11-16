import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/sql/saas_merchant_payment_webhook_20261116.sql','utf8');
const webhook=readFileSync('supabase/functions/saas-merchant-payment-webhook/index.ts','utf8');
const previous=readFileSync('supabase/sql/saas_online_order_intents_20261116.sql','utf8');
test('Merchant payment tables are private, RLS-protected, and independent of subscription billing',()=>{
 assert.match(sql,/private\.saas_online_payment_preference_links/);
 assert.match(sql,/private\.saas_online_payment_receipts/);
 assert.match(sql,/primary key\(provider,provider_payment_id\)/);
 assert.match(sql,/alter table private\.saas_online_payment_receipts enable row level security/);
 assert.match(sql,/revoke all on private\.saas_online_payment_preference_links,private\.saas_online_payment_receipts from public,anon,authenticated/);
 assert.doesNotMatch(sql,/saas_subscriptions|saas_billing_webhook_events/);
 assert.match(previous,/enabled boolean not null default false/);
});
test('All privileged payment RPCs are service-only, and never fulfill orders',()=>{
 for(const [name,args] of [['saas_online_payment_link_preference','uuid,text'],['saas_online_payment_context','uuid'],['saas_online_payment_record_verified','uuid,text,text,numeric,text,text,text'],['saas_online_payment_seller_token','text']]){
  assert.ok(sql.includes('revoke all on function public.'+name+'('+args+') from public,anon,authenticated'),name);
  assert.ok(sql.includes('grant execute on function public.'+name+'('+args+') to service_role'),name);
 }
 assert.doesNotMatch(sql,/insert into public\.saas_orders|update public\.saas_products|saas_adjust_inventory_impl|insert into public\.saas_financial_entries/);
 assert.doesNotMatch(webhook,/saas_complete_order|insert\(|update\(|saas_adjust_inventory_impl|saas_create_order_atomic/);
});
test('Payment ledger verifies merchant, intent, amount, preference, and idempotency',()=>{
 assert.match(sql,/v_intent\.subtotal<>p_amount/);
 assert.match(sql,/l\.provider_preference_id=p_preference_id/);
 assert.match(sql,/c\.provider_account_id=p_account_id/);
 assert.match(sql,/provider_payment_id=p_payment_id for update/);
 assert.match(sql,/v_record\.intent_id<>p_intent_id/);
 assert.match(sql,/v_record\.amount<>p_amount/);
 assert.match(sql,/v_record\.payment_status='approved'/);
 assert.match(sql,/v_record\.payment_status in \('refunded','charged_back'\)/);
 assert.match(sql,/where a\.tenant_id=v_intent\.tenant_id and a\.enabled/);
});
test('Signed callback only records provider-confirmed payments with disabled fulfillment',()=>{
 assert.match(webhook,/MP_MERCHANT_WEBHOOK_SECRET/);
 assert.match(webhook,/MP_MERCHANT_WEBHOOK_ENABLED/);
 assert.match(webhook,/x-signature/);
 assert.match(webhook,/x-request-id/);
 assert.match(webhook,/HMAC/);
 assert.match(webhook,/Math\.abs\(Date\.now\(\)-milliseconds\)>5\*60_000/);
 assert.match(webhook,/constantHexEqual/);
 assert.match(webhook,/payload\.type!=="payment"/);
 assert.match(webhook,/https:\/\/api\.mercadopago\.com\/v1\/payments\//);
 assert.match(webhook,/collector!==accountId/);
 assert.match(webhook,/payment\.external_reference/);
 assert.ok(webhook.includes('https://api.mercadopago.com/merchant_orders/'));
 assert.ok(webhook.includes('order.payments.some'));
 assert.ok(webhook.includes('String(order.external_reference||"")!==intentId'));
 assert.ok(webhook.includes('String(order.id||"")!==merchantOrderId'));
 assert.ok(!webhook.includes('payment.metadata?.saas_preference_id'));
 assert.match(webhook,/String\(payment\.currency_id\)!=="BRL"/);
 assert.match(webhook,/saas_online_payment_record_verified/);
 assert.match(webhook,/fulfillment_enabled:false/);
 assert.doesNotMatch(webhook,/MP_ACCESS_TOKEN|MP_WEBHOOK_SECRET\)/);
});
