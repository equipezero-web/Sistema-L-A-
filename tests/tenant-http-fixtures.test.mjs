import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const harness=readFileSync('scripts/verify-tenant-http.mjs','utf8')
 .replace(/^import assert from 'node:assert\/strict';\s*/,'');
const ids={
 a:'10000000-0000-4000-8000-000000000001',
 b:'20000000-0000-4000-8000-000000000002',
 recordA:'30000000-0000-4000-8000-000000000003',
 recordB:'40000000-0000-4000-8000-000000000004'
};
const tables=['saas_customers','saas_products','saas_orders','saas_financial_entries'];

async function scenario({emptyOwn=false,leak=false,employee=false}={}){
 const calls=[],logs=[];
 const env={
  SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_public',
  SAAS_TEST_A_TOKEN:'token-test-A',
  SAAS_TEST_B_TOKEN:'token-test-B',
  SAAS_TEST_A_TENANT_ID:ids.a,
  SAAS_TEST_B_TENANT_ID:ids.b
 };
 const response=(status,data)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data)});
 async function fetch(url,request){
  calls.push({url,method:request.method});
  const actor=request.headers.Authorization==='Bearer token-test-A'?'A':'B';
  const uid=actor==='A'?'fake-user-A':'fake-user-B';
  const own=actor==='A'?ids.a:ids.b;
  const other=actor==='A'?ids.b:ids.a;
  const path=new URL(url);
  if(path.pathname==='/auth/v1/user')return response(200,{id:uid});
  if(path.pathname==='/rest/v1/saas_members'){
   const tenant=path.searchParams.get('tenant_id')?.replace('eq.','');
   return response(200,tenant===own?[{tenant_id:own,user_id:uid,role:employee?'employee':'owner',status:'active'}]:[]);
  }
  if(path.pathname==='/rest/v1/rpc/saas_manager_product_costs'||path.pathname==='/rest/v1/rpc/saas_platform_tenants')
    return response(403,{message:'access denied'});
  const table=path.pathname.split('/').at(-1);
  if(tables.includes(table)){
   const tenant=path.searchParams.get('tenant_id')?.replace('eq.','');
   if(path.searchParams.has('limit')){
    if(emptyOwn)return response(200,[]);
    return response(200,[{id:actor==='A'?ids.recordA:ids.recordB,tenant_id:own}]);
   }
   const askedId=path.searchParams.get('id')?.replace('eq.','');
   const expected=actor==='A'?ids.recordB:ids.recordA;
   if(tenant===other&&askedId===expected&&leak)return response(200,[{id:expected,tenant_id:other}]);
   return response(200,[]);
  }
  return response(404,{message:'unexpected URL'});
 }
 const process={env,exitCode:0};
 const context={assert,process,fetch,AbortSignal,URL,console:{
   log(message){logs.push(message)},
   error(message){logs.push(message)}
 }};
 await vm.runInNewContext('(async()=>{'+harness+'})()',context);
 return {exitCode:process.exitCode,calls,logs};
}

test('Two authorized fixture companies pass only with actual records',async()=>{
 const r=await scenario();
 assert.equal(r.exitCode,0);
 assert.equal(r.calls.filter(x=>x.url.includes('/auth/v1/user')).length,2);
 assert.equal(r.calls.filter(x=>x.url.includes('&limit=1')).length,8);
 assert.equal(r.calls.filter(x=>x.url.includes('rpc/saas_platform_tenants')).length,2);
 assert.ok(r.calls.every(x=>['GET','POST'].includes(x.method)));
 assert.ok(r.logs.every(x=>!x.includes('token-test-')));
});
test('Empty tenants cannot produce a false-positive isolation result',async()=>{
 const r=await scenario({emptyOwn:true});
 assert.equal(r.exitCode,1);
 assert.ok(r.logs.some(x=>x.includes('precisa ter pelo menos um registro')));
});
test('Cross-tenant data leak is detected for verified existing UUIDs',async()=>{
 const r=await scenario({leak:true});
 assert.equal(r.exitCode,1);
 assert.ok(r.logs.some(x=>x.includes('outra empresa ficou visível')));
});
test('Employee sessions cannot masquerade as owner/admin fixtures',async()=>{
 const r=await scenario({employee:true});
 assert.equal(r.exitCode,1);
 assert.ok(r.logs.some(x=>x.includes('proprietário ou administrador')));
});
