import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/sql/saas_checkout_transparente_payment_binding_20261116.sql','utf8');
const webhook=readFileSync('supabase/functions/saas-merchant-payment-webhook/index.ts','utf8');
const store=readFileSync('store/loja-virtual.html','utf8');
const merchant=readFileSync('app/pagamentos-loja.html','utf8');

test('Checkout Transparente payments bind explicitly to an intent and seller',()=>{
 assert.match(sql,/create table if not exists private\.saas_online_transparent_payments/);
 assert.match(sql,/constraint saas_transparent_payment_unique unique\(provider_payment_id\)/);
 assert.match(sql,/constraint saas_transparent_payment_pk primary key \(intent_id,provider_payment_id\)/);
 assert.match(sql,/revoke all on private\.saas_online_transparent_payments from public,anon,authenticated/);
 assert.match(sql,/alter table private\.saas_online_transparent_payments enable row level security/);
 assert.match(sql,/v_intent\.expires_at<=now\(\)/);
 assert.match(sql,/v_intent\.subtotal<>p_amount/);
 assert.match(sql,/c\.provider_account_id=p_account_id/);
 assert.match(sql,/on conflict\(provider_payment_id\) do nothing/);
});
test('All transparent payment functions deny browser users',()=>{
 for(const [name,args] of [
  ['saas_online_transparent_bind_payment','uuid,text,text,numeric'],
  ['saas_online_transparent_payment_context','uuid,text'],
  ['saas_online_transparent_record_verified','uuid,text,text,numeric,text,text']
 ]){
  assert.ok(sql.includes('revoke all on function public.'+name+'('+args+') from public,anon,authenticated'),name);
  assert.ok(sql.includes('grant execute on function public.'+name+'('+args+') to service_role'),name);
 }
 assert.doesNotMatch(sql,/insert into public\.saas_orders|update public\.saas_products|saas_adjust_inventory_impl/);
});
test('Webhook no longer requires Pro preferences and verifies the actual payment',()=>{
 assert.match(webhook,/saas_online_transparent_payment_context/);
 assert.match(webhook,/saas_online_transparent_record_verified/);
 assert.match(webhook,/payment\.external_reference/);
 assert.match(webhook,/collector!==accountId/);
 assert.match(webhook,/String\(payment\.currency_id\)!=="BRL"/);
 assert.doesNotMatch(webhook,/merchant_orders\/|preference_id|marketplace_fee/);
 assert.match(webhook,/fulfillment_enabled:false/);
});
test('Transparent checkout UI is on-site and visibly fail-closed until payments are homologated',()=>{
 assert.match(store,/id="transparentCheckout"/);
 assert.match(store,/Mercado Pago · checkout transparente/);
 assert.match(store,/Pagamento dentro da loja/);
 assert.match(store,/Nenhum dado de cartão é solicitado/);
 assert.match(store,/Finalizar compra — em integração/);
 assert.match(store,/disabled aria-describedby="checkoutNotice"/);
 assert.match(merchant,/Modelo escolhido: Checkout Transparente/);
 assert.doesNotMatch(store,/init_point|checkout\.mercadopago\.com/);
});
