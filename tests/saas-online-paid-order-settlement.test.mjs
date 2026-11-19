import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const settlement=readFileSync('supabase/sql/saas_online_paid_order_settlement_20261119.sql','utf8');
const refunds=readFileSync('supabase/sql/saas_online_verified_refund_restocks_20261119.sql','utf8');
const webhook=readFileSync('supabase/functions/saas-merchant-payment-webhook/index.ts','utf8');
const checkout=readFileSync('supabase/functions/saas-transparent-checkout/index.ts','utf8');

test('only service-role approved and bound receipts can create orders',()=>{
 assert.match(settlement,/auth\.jwt\(\)->>'role'\) is distinct from 'service_role'/);
 assert.match(settlement,/payment_status='approved'/);
 assert.match(settlement,/v_bound\.provider_payment_id=v_receipt\.provider_payment_id/);
 assert.match(settlement,/v_bound\.provider_account_id=v_receipt\.provider_account_id/);
 assert.match(settlement,/v_receipt\.amount<>v_intent\.subtotal/);
 assert.match(settlement,/where id=p_intent_id for update/);
 assert.match(settlement,/order by \(value->>'product_id'\)::uuid/);
 assert.match(settlement,/v_product\.stock_quantity<v_qty/);
 assert.match(settlement,/v_total<>v_intent\.subtotal/);
 assert.match(settlement,/insert into public\.saas_orders/);
 assert.match(settlement,/insert into public\.saas_order_items/);
 assert.match(settlement,/update public\.saas_products set stock_quantity=stock_quantity-v_qty/);
 assert.match(settlement,/insert into public\.saas_inventory_movements/);
 assert.match(settlement,/unique\s*\(tenant_id,order_id\)|order_id uuid unique/);
});
test('backend-only bypass preserves manual booking/order permissions',()=>{
 assert.match(settlement,/private\.saas_verified_commerce_context\(\)/);
 assert.match(settlement,/grant execute on function private\.saas_verified_commerce_context\(\) to service_role,authenticated/);
 assert.match(settlement,/auth\.jwt\(\)->>'role'\)='service_role'/);
 assert.match(settlement,/public\.saas_guard_operational_status\(\)/);
 assert.match(settlement,/public\.saas_guard_order_items\(\)/);
 assert.match(settlement,/saas_paid_order_cancellation_guard/);
 assert.match(settlement,/not private\.saas_verified_commerce_context\(\)/);
});
test('paid refunds require provider-confirmed status and restock only before dispatch',()=>{
 assert.match(refunds,/payment_status not in \('refunded','charged_back'\)/);
 assert.match(refunds,/where id=p_intent_id for update/);
 assert.match(refunds,/v_delivery in \('shipped','delivered','returned'\)/);
 assert.match(refunds,/review_reason='parcel_already_dispatched'/);
 assert.match(refunds,/v_settlement\.state='reversed'/);
 assert.match(refunds,/update public\.saas_orders set status='cancelled'/);
 assert.match(refunds,/stock_quantity=stock_quantity\+v_item\.quantity/);
 assert.match(refunds,/insert into public\.saas_inventory_movements/);
});
test('webhook calls commercial settlement only when BOTH opt-in flags are set',()=>{
 assert.match(webhook,/SAAS_MERCHANT_FULFILLMENT_ENABLED/);
 assert.match(webhook,/SAAS_TRANSPARENT_CHECKOUT_ENABLED/);
 assert.match(webhook,/saas_online_transparent_reconcile_attempt/);
 assert.match(webhook,/saas_online_settle_verified_payment/);
 assert.match(webhook,/saas_online_reverse_verified_payment/);
 assert.match(webhook,/fulfillment_enabled:false/);
 assert.match(checkout,/PAYMENT_PROCESSING_IMPLEMENTED=false/);
 assert.doesNotMatch(settlement,/MP_ACCESS_TOKEN|fetch\(|https:\/\/api\.mercadopago/i);
});
