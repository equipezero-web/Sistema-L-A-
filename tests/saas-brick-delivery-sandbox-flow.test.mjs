import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildMerchantPaymentRequest,verifyMerchantPaymentResult} from '../supabase/functions/_shared/merchant-payment-contract.mjs';
import {submitMerchantPayment} from '../supabase/functions/_shared/merchant-payment-transport.mjs';

const file=path=>readFileSync(path,'utf8');
const edge=file('supabase/functions/saas-transparent-checkout/index.ts');
const brick=file('assets/js/transparent-payment.js');
const store=file('store/loja-virtual.html');
const delivery=file('supabase/sql/saas_checkout_brick_delivery_prepare_20261123.sql');
const merchantDelivery=file('supabase/sql/saas_order_delivery_merchant_view_20261123.sql');
const uuid='9f6bb50b-9df1-42d6-83dc-969e14720001';
const attempt='d91ecda4-64ad-4a44-8015-61632f78c119';
const payload={payment_method_id:'pix',payer:{email:'comprador@example.test'}};
const expected={intentId:uuid,accountId:'123456789',subtotalCents:15990};

test('simulated end-to-end Pix: server amount, stable key, approved provider and stock settlement gate',async()=>{
 const request=buildMerchantPaymentRequest({intentId:uuid,attemptId:attempt,subtotalCents:15990,formData:payload});
 assert.equal(request.idempotencyKey,attempt);
 assert.equal(request.payload.transaction_amount,159.90);
 assert.equal(request.payload.external_reference,uuid);
 let calls=0;
 const transport=async(url,options)=>{
  calls++;assert.equal(url,'https://api.mercadopago.com/v1/payments');
  assert.equal(options.headers['X-Idempotency-Key'],attempt);
  return {ok:true,json:async()=>({id:'43210',collector_id:'123456789',external_reference:uuid,
   transaction_amount:159.9,currency_id:'BRL',status:'approved'})};
 };
 for(let n=0;n<2;n++){
  const result=await submitMerchantPayment({merchantAccessToken:'TEST-seller-token-123456',idempotencyKey:request.idempotencyKey,payload:request.payload,transport});
  assert.equal(result.kind,'provider_response');
  assert.deepEqual(verifyMerchantPaymentResult(result.payment,expected),{paymentId:'43210',status:'approved'});
 }
 assert.equal(calls,2);
 assert.match(edge,/saas_online_transparent_bind_payment/);
 assert.match(edge,/saas_online_transparent_reconcile_attempt/);
 assert.match(edge,/saas_online_settle_verified_payment/);
 assert.match(edge,/SAAS_CHECKOUT_SANDBOX_ENABLED/);
 assert.match(edge,/const PAYMENT_PROCESSING_IMPLEMENTED=false/);
});
test('simulated declines, ambiguous network failures, and divergent account fail closed',async()=>{
 const request=buildMerchantPaymentRequest({intentId:uuid,attemptId:attempt,subtotalCents:15990,formData:payload});
 const blocked=await submitMerchantPayment({merchantAccessToken:'TEST-seller-token-123456',idempotencyKey:attempt,payload:request.payload,
  transport:async()=>{throw new Error('timeout')}});
 assert.equal(blocked.kind,'unknown');
 const declined=await submitMerchantPayment({merchantAccessToken:'TEST-seller-token-123456',idempotencyKey:attempt,payload:request.payload,
  transport:async()=>({ok:false,status:422,json:async()=>({message:'declined'})})});
 assert.equal(declined.kind,'rejected');
 assert.equal(verifyMerchantPaymentResult({id:'43210',collector_id:'other',external_reference:uuid,transaction_amount:159.9,currency_id:'BRL',status:'approved'},expected),null);
 assert.equal(verifyMerchantPaymentResult({id:'43210',collector_id:'123456789',external_reference:uuid,transaction_amount:1,currency_id:'BRL',status:'approved'},expected),null);
});
test('card contract requires token, payer and installments; browser never supplies authoritative amount',()=>{
 assert.throws(()=>buildMerchantPaymentRequest({intentId:uuid,attemptId:attempt,subtotalCents:15990,formData:{...payload,payment_method_id:'visa'}}),/token/i);
 const out=buildMerchantPaymentRequest({intentId:uuid,attemptId:attempt,subtotalCents:15990,
  formData:{payment_method_id:'visa',token:'secure-token-12345',installments:2,payer:{email:'buyer@example.test'},transaction_amount:1}});
 assert.equal(out.payload.transaction_amount,159.9);
 assert.equal(out.payload.installments,2);
 assert.equal(out.payload.token,'secure-token-12345');
 assert.match(edge,/saas_online_checkout_prepare_secure/);
 assert.match(edge,/Number\(intent\.amount_cents\)/);
});
test('delivery is canonical, immutable by request key, tenant-scoped, private and linked to paid orders',()=>{
 assert.match(delivery,/private\.saas_online_checkout_delivery/);
 assert.match(delivery,/enable row level security/);
 assert.match(delivery,/revoke all on private\.saas_online_checkout_delivery from public,anon,authenticated/);
 assert.match(delivery,/saas_online_order_prepare\(v_tenant,p_request_key,p_items\)/);
 assert.match(delivery,/saas_online_payment_attempt_prepare\(v_i\.intent_id,p_request_key\)/);
 assert.match(delivery,/Solicitação reutilizada com outro destinatário/);
 assert.match(delivery,/postal_code !~ '\^\[0-9\]\{8\}\$'/);
 assert.match(delivery,/not distinct from v_d\./);
 assert.match(delivery,/saas_online_checkout_seller_secret/);
 assert.match(merchantDelivery,/saas_has_tenant_role\(tenant_id/);
 assert.match(merchantDelivery,/grant select on public\.saas_order_delivery_details to authenticated/);
 assert.match(merchantDelivery,/saas_attach_paid_order_delivery/);
 assert.match(merchantDelivery,/new\.state='fulfilled'/);
 assert.match(file('assets/js/fulfillment.js'),/saas_order_delivery_details/);
});
test('Brick UI includes consent, valid address and only submits through sandbox-gated server route',()=>{
 for(const name of ['recipient_name','email','phone','mode','postal_code','street','street_number','complement','neighborhood','city','region','consent'])
  assert.ok(store.includes('name="'+name+'"'),name);
 assert.match(brick,/shippingForm\?\.reportValidity\(\)/);
 assert.match(brick,/crypto\.randomUUID\(\)/);
 assert.match(brick,/onSubmit:async\(\{formData\}\)/);
 assert.match(brick,/action:'submit'/);
 assert.match(brick,/!ready\.sandbox_only/);
 assert.match(brick,/submissionStarted=true/);
 assert.match(edge,/isTestToken\(sellers\[0\]\.access_token\)/);
 assert.doesNotMatch(brick,/service_role|access_secret_id|merchantAccessToken/);
});
