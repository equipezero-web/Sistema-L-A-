import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildMerchantPaymentRequest,verifyMerchantPaymentResult} from '../supabase/functions/_shared/merchant-payment-contract.mjs';
const intentId='11111111-1111-4111-8111-111111111111';
const attemptId='22222222-2222-4222-8222-222222222222';
const accountId='123456789';
const formData={payment_method_id:'visa',token:'token_12345678',installments:1,
 transaction_amount:0.01,payer:{email:'buyer@example.com',id:'do-not-forward'},
 access_token:'do-not-forward'};
const args={intentId,attemptId,subtotalCents:12750,formData};
test('uses only authoritative amount and whitelisted fields',()=>{
 const {idempotencyKey,payload}=buildMerchantPaymentRequest(args);
 assert.equal(idempotencyKey,attemptId);
 assert.equal(payload.transaction_amount,127.50);
 assert.equal(payload.external_reference,intentId);
 assert.deepEqual(payload.payer,{email:'buyer@example.com'});
 assert.equal(payload.token,'token_12345678');
 assert.ok(!('access_token' in payload));
 assert.ok(!('id' in payload.payer));
 assert.equal(JSON.stringify(buildMerchantPaymentRequest(args)),JSON.stringify(buildMerchantPaymentRequest(args)));
});
test('rejects invalid card fields or totals',()=>{
 assert.throws(()=>buildMerchantPaymentRequest({...args,subtotalCents:0}));
 assert.throws(()=>buildMerchantPaymentRequest({...args,formData:{...formData,token:''}}));
 assert.throws(()=>buildMerchantPaymentRequest({...args,formData:{...formData,installments:0}}));
 assert.throws(()=>buildMerchantPaymentRequest({...args,intentId:'invalid'}));
});
test('Pix request never forwards token',()=>{
 const {payload}=buildMerchantPaymentRequest({...args,formData:{...formData,payment_method_id:'pix'}});
 assert.equal(payload.payment_method_id,'pix');
 assert.ok(!('token' in payload));
});
test('payment provider response must match merchant, intent, currency, amount',()=>{
 const p={id:1234567,collector_id:accountId,external_reference:intentId,
  currency_id:'BRL',transaction_amount:127.50,status:'approved'};
 assert.deepEqual(verifyMerchantPaymentResult(p,{intentId,accountId,subtotalCents:12750}),{paymentId:'1234567',status:'approved'});
 for(const change of [{collector_id:'99999'},{external_reference:attemptId},{currency_id:'USD'},{transaction_amount:1},{status:'unknown'}]){
  assert.equal(verifyMerchantPaymentResult({...p,...change},{intentId,accountId,subtotalCents:12750}),null);
 }
});
test('production remains fail-closed and payment helper never calls network',()=>{
 const backend=readFileSync('supabase/functions/saas-transparent-checkout/index.ts','utf8');
 const helper=readFileSync('supabase/functions/_shared/merchant-payment-contract.mjs','utf8');
 assert.match(backend,/PAYMENT_PROCESSING_IMPLEMENTED=false/);
 assert.match(backend,/if\(!sandboxReady\)/);
 assert.doesNotMatch(helper,/fetch\(|Deno\.serve\(|https:\/\/api\.mercadopago\.com/);
});
