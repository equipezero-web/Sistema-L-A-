import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac, webcrypto } from 'node:crypto';
import vm from 'node:vm';

// No network calls, no real credentials, no real payment creation.
const billing = readFileSync('supabase/functions/saas-billing/index.ts','utf8');
const webhook = readFileSync('supabase/functions/mercado-pago-webhook/index.ts','utf8');
const tenant = '123e4567-e89b-42d3-a456-426614174000';

function javascript(ts) {
  return ts
    .replace(/\bimport\s*['"][^'"]+['"];?/g,'')
    .replace(/\bimport\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?/g,'')
    .replace(/:\s*(?:Request|Response|unknown|string|number|boolean|any)\b/g,'')
    .replace(/\bas\s+(?:any|string|number|unknown)\b/g,'');
}

class MockResponse {
  constructor(value,{status=200}={}){
    this.status=status;
    this.body=JSON.parse(value);
  }
}

async function billingCase({ role='owner', enabled=false, authorized=true, action='checkout' }={}){
  let handler,networkCalls=0,recorded=null,externalReference=null;
  const env={
    SUPABASE_URL:'https://test.supabase.co',
    SUPABASE_ANON_KEY:'mock-publishable',
    SUPABASE_SERVICE_ROLE_KEY:'mock-server-key',
    MP_ACCESS_TOKEN:'mock-marketplace-token',
    MP_WEBHOOK_SECRET:'mock-webhook-secret',
    MP_CHECKOUT_ENABLED: enabled?'true':'false',
  };
  const Deno={env:{get:k=>env[k]},serve:fn=>{handler=fn}};
  const createClient=()=>({
    auth:{getUser:async()=>({data:{user:{
      id:'owner-user',email:'owner@example.invalid',email_confirmed_at:'2026-11-01T00:00:00Z'
    }},error:null})},
    from:table=>{
      const query={
        select(){return query},eq(){return query},
        maybeSingle:async()=>({data:table==='saas_members'?{role}:table==='saas_tenants'?{active:true}:null,error:null}),
        single:async()=>({data:{id:'royal30-plan',name:'Royal 30',price_monthly:30},error:null}),
        upsert:async value=>{recorded=value;return {error:null}}
      };
      return query;
    }
  });
  const fetch=async (_url,args)=>{
    networkCalls++;
    externalReference=JSON.parse(args.body).external_reference;
    return {ok:true,json:async()=>({
      id:'mp-preapproval-mock',status:'pending',
      init_point:'https://www.mercadopago.com.br/subscriptions/checkout?mock=yes'
    })};
  };
  vm.runInNewContext(javascript(billing),{Deno,createClient,Response:MockResponse,URL,fetch,crypto:webcrypto,console});
  const result=await handler({
    method:'POST',
    headers:{get:key=>key==='Authorization'&&authorized?'Bearer fake-session':null},
    json:async()=>({tenant_id:tenant,action})
  });
  return {result,networkCalls,recorded,externalReference};
}

async function webhookCase({ matched=true, signed=true, invoiceSubscriptionMatches=true, notificationType='subscription_preapproval' }={}){
  let handler,rpcCalls=0,appliedPayload=null;
  const secret='mock-webhook-secret',dataId='mp-preapproval-mock',requestId='request-mock',ts='1700000000';
  const manifest='id:'+dataId+';request-id:'+requestId+';ts:'+ts+';';
  const signature='ts='+ts+',v1='+createHmac('sha256',secret).update(manifest).digest('hex');
  const env={
    MP_ACCESS_TOKEN:'mock-merchant-token',MP_WEBHOOK_SECRET:secret,
    SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'mock-server-key'
  };
  const Deno={env:{get:key=>env[key]},serve:fn=>{handler=fn}};
  const createClient=()=>({
    from:table=>{
      const query={
        select(){return query},eq(){return query},
        maybeSingle:async()=>({data:table==='saas_subscriptions'?{
          provider:'mercado_pago',provider_subscription_id:matched?dataId:'other-preapproval',plan_id:'royal30-plan'
        }:table==='saas_plans'?{id:'royal30-plan'}:null,error:null}),
        upsert:async()=>({error:null}),update(){return query}
      };
      return query;
    },
    rpc:async(_name,payload)=>{rpcCalls++;appliedPayload=payload;return {error:null}}
  });
  const fetch=async url=>({
    ok:true,
    json:async()=>String(url).includes('/authorized_payments/search')
      ? {results:[{
          preapproval_id:invoiceSubscriptionMatches?dataId:'other-preapproval',
          payment:{status:'approved',id:'payment-mock'}
        }]}
      : String(url).includes('/authorized_payments/')
        ? {id:dataId,preapproval_id:invoiceSubscriptionMatches?'mp-preapproval-mock':'other-preapproval',payment:{status:'approved',id:'payment-mock'}}
        : {id:'mp-preapproval-mock',external_reference:tenant,status:'authorized'}
  });
  vm.runInNewContext(javascript(webhook),{
    Deno,createClient,Response:MockResponse,URL,fetch,crypto:webcrypto,TextEncoder,console
  });
  const result=await handler({
    method:'POST',
    url:'https://example.invalid/functions/v1/mercado-pago-webhook?type='+notificationType+'&data.id='+dataId,
    headers:{get:key=>key==='x-signature'?(signed?signature:null):key==='x-request-id'?requestId:null},
    json:async()=>({id:'event-mock',type:notificationType,data:{id:dataId}})
  });
  return {result,rpcCalls,appliedPayload};
}

test('Billing requires authentication and owner role',async()=>{
  assert.equal((await billingCase({authorized:false})).result.status,401);
  assert.equal((await billingCase({role:'admin'})).result.status,403);
});

test('Checkout starts disabled and cannot contact Mercado Pago',async()=>{
  const x=await billingCase();
  assert.equal(x.result.status,503);
  assert.equal(x.result.body.code,'CHECKOUT_DISABLED');
  assert.equal(x.networkCalls,0);
  const status=await billingCase({action:'status'});
  assert.equal(status.result.status,200);
  assert.equal(status.result.body.checkout_enabled,false);
});

test('Mock-enabled checkout uses tenant UUID and records provider subscription',async()=>{
  const x=await billingCase({enabled:true});
  assert.equal(x.result.status,200);
  assert.equal(x.networkCalls,1);
  assert.equal(x.externalReference,tenant);
  assert.equal(x.recorded.tenant_id,tenant);
  assert.equal(x.recorded.plan_id,'royal30-plan');
  assert.equal(x.recorded.provider_subscription_id,'mp-preapproval-mock');
});

test('Webhook validates signature and matching local subscription',async()=>{
  const good=await webhookCase();
  assert.equal(good.result.status,200);
  assert.equal(good.rpcCalls,1);
  const mismatch=await webhookCase({matched:false});
  assert.equal(mismatch.result.status,500);
  assert.equal(mismatch.rpcCalls,0);
  const unsigned=await webhookCase({signed:false});
  assert.equal(unsigned.result.status,401);
  assert.equal(unsigned.rpcCalls,0);
});


test('Subscription notification never treats an unrelated invoice as a paid renewal',async()=>{
  const x=await webhookCase({invoiceSubscriptionMatches:false});
  assert.equal(x.result.status,200);
  assert.equal(x.rpcCalls,1);
  assert.equal(x.appliedPayload.p_payment_id,null);
  assert.equal(x.appliedPayload.p_payment_status,null);
});

test('Authorized-payment webhook requires matching subscription in invoice',async()=>{
  const valid=await webhookCase({notificationType:'subscription_authorized_payment'});
  assert.equal(valid.result.status,200);
  assert.equal(valid.appliedPayload.p_payment_status,'approved');
  const mismatch=await webhookCase({notificationType:'subscription_authorized_payment',invoiceSubscriptionMatches:false});
  assert.equal(mismatch.result.status,500);
  assert.equal(mismatch.rpcCalls,0);
});
