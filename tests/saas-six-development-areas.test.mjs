import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {submitMerchantPayment} from '../supabase/functions/_shared/merchant-payment-transport.mjs';
import {verifyMetaSignature,extractInstagramEvents} from '../supabase/functions/_shared/meta-webhook-contract.mjs';
const file=x=>readFileSync(x,'utf8');

test('merchant Payments API transport uses stable idempotency and OAuth merchant token',async()=>{
 let request;
 const payload={transaction_amount:120.50,external_reference:'11111111-1111-4111-8111-111111111111',payment_method_id:'pix'};
 const result=await submitMerchantPayment({merchantAccessToken:'APP_USR_test_merchant_access_token',
  idempotencyKey:'22222222-2222-4222-8222-222222222222',payload,
  transport:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({id:'123'})}}});
 assert.equal(request.url,'https://api.mercadopago.com/v1/payments');
 assert.equal(request.options.headers['X-Idempotency-Key'],'22222222-2222-4222-8222-222222222222');
 assert.equal(result.kind,'provider_response');
 const unknown=await submitMerchantPayment({merchantAccessToken:'APP_USR_test_merchant_access_token',
  idempotencyKey:'22222222-2222-4222-8222-222222222222',payload,
  transport:async()=>{throw Error('connection lost')}});
 assert.equal(unknown.kind,'unknown');
 assert.match(file('supabase/functions/saas-transparent-checkout/index.ts'),/PAYMENT_PROCESSING_IMPLEMENTED=false/);
});
test('Meta signature requires the correct HMAC over unmodified body',async()=>{
 const body=JSON.stringify({object:'instagram',entry:[{id:'12345678',messaging:[{message:{mid:'m1'}}]}]});
 const secret='secret-of-app-1234567890';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body));
 const hex=[...new Uint8Array(signed)].map(x=>x.toString(16).padStart(2,'0')).join('');
 assert.equal(await verifyMetaSignature({rawBody:body,signature:'sha256='+hex,appSecret:secret}),true);
 assert.equal(await verifyMetaSignature({rawBody:body+' ',signature:'sha256='+hex,appSecret:secret}),false);
 assert.deepEqual(extractInstagramEvents(JSON.parse(body)),[{accountId:'12345678',messageId:'m1'}]);
 assert.deepEqual(extractInstagramEvents({object:'page',entry:[]}),[]);
});
test('employee link requires MFA and active same-tenant employee membership',()=>{
 const sql=file('supabase/sql/saas_employee_login_link_20261117.sql');
 assert.match(sql,/auth\.jwt\(\)->>'aal'/);
 assert.match(sql,/m\.tenant_id=p_tenant_id/);
 assert.match(sql,/m\.role::text='employee'/);
 assert.match(sql,/m\.status::text='active'/);
 assert.match(sql,/unique_login_per_tenant/);
});
test('private CRM conversations cannot be forged or read by anonymous users',()=>{
 const sql=file('supabase/sql/saas_crm_conversations_20261117.sql');
 assert.match(sql,/enable row level security/g);
 assert.match(sql,/foreign key\(tenant_id,thread_id\)/);
 assert.match(sql,/author_user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/revoke all on public\.saas_crm_threads,public\.saas_crm_messages from public,anon,authenticated/);
 assert.match(file('assets/js/crm.js'),/getBusinessContext\(\)/);
});
test('shipping is scoped to confirmed orders and cannot change payments or stock',()=>{
 const sql=file('supabase/sql/saas_order_fulfillment_20261117.sql');
 assert.match(sql,/o\.status::text in \('confirmed','completed'\)/);
 assert.match(sql,/foreign key\(tenant_id,order_id\)/);
 assert.match(sql,/changed_by=\(select auth\.uid\(\)\)/);
 assert.doesNotMatch(sql,/update public\.saas_products|insert into private\.saas_online_payment_receipts/);
});
test('storefront uses public published theme and its model content',()=>{
 assert.match(file('assets/js/virtual-storefront.js'),/store\.design_settings\?\.modelContent/);
 assert.match(file('assets/js/appearance.js'),/modelCardRadius/);
 assert.match(file('assets/js/operations.js'),/\.\/crm\.html/);
 assert.match(file('assets/js/operations.js'),/\.\/entregas\.html/);
});
