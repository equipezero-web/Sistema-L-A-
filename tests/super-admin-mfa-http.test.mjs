import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const script=readFileSync('scripts/verify-super-admin-mfa-http.mjs','utf8')
 .replace(/^import assert from 'node:assert\/strict';\s*/m,'');
const base='https://example.supabase.co';
const sub='10000000-0000-4000-8000-000000000001';
const encode=payload=>[
 Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
 Buffer.from(JSON.stringify(payload)).toString('base64url'),
 'fake-signature'
].join('.');
const token=(aal,user=sub,expires=3600)=>encode({
 role:'authenticated',aud:'authenticated',iss:base+'/auth/v1',
 sub:user,aal,exp:Math.floor(Date.now()/1000)+expires
});

async function scenario({userMismatch=false,stale=false,aal1Allowed=false,aal2Denied=false,missing=false}={}){
 const logs=[],requests=[];
 const low=token('aal1'),high=token('aal2',userMismatch?'20000000-0000-4000-8000-000000000002':sub,stale?-30:3600);
 const process={env:{
   SUPABASE_URL:base,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',
   SAAS_TEST_ADMIN_AAL1_TOKEN:low,SAAS_TEST_ADMIN_AAL2_TOKEN:missing?'':high
 },exitCode:0};
 const response=(status,data)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data)});
 const fetch=async(url,options)=>{
   const path=new URL(url).pathname,auth=options.headers.Authorization;
   requests.push({path,method:options.method});
   if(path==='/auth/v1/user')return response(200,{id:auth==='Bearer '+low?sub:userMismatch?'20000000-0000-4000-8000-000000000002':sub});
   if(path==='/rest/v1/rpc/saas_platform_tenants'){
     const higher=auth==='Bearer '+high;
     return higher?response(aal2Denied?403:200,aal2Denied?{message:'denied'}:[]):response(aal1Allowed?200:403,aal1Allowed?[]:{message:'denied'});
   }
   return response(404,{message:'not found'});
 };
 const ctx={assert,process,fetch,Buffer,URL,Date,AbortSignal,
  console:{error:x=>logs.push(String(x)),log:x=>logs.push(String(x))}};
 await vm.runInNewContext('(async()=>{'+script+'})()',ctx);
 return {code:process.exitCode,logs,requests,low,high};
}
test('Distinct AAL1/AAL2 tokens for the same verified account pass read-only boundary',async()=>{
 const r=await scenario();
 assert.equal(r.code,0,JSON.stringify(r.logs));
 assert.equal(r.requests.filter(x=>x.path==='/auth/v1/user').length,2);
 assert.equal(r.requests.filter(x=>x.path.includes('/rpc/')).length,2);
 assert.ok(r.requests.every(x=>['GET','POST'].includes(x.method)));
 assert.ok(!r.logs.some(x=>x.includes(r.low)||x.includes(r.high)));
});
test('AAL1 privileged access is detected as a security failure',async()=>{
 const r=await scenario({aal1Allowed:true});
 assert.equal(r.code,1);
 assert.ok(r.logs.some(x=>x.includes('AAL1 não pode')));
});
test('AAL2 lacking privileges fails rather than producing a false pass',async()=>{
 const r=await scenario({aal2Denied:true});
 assert.equal(r.code,1);
 assert.ok(r.logs.some(x=>x.includes('AAL2 não conseguiu')));
});
test('Tokens for different users are refused before a privileged request',async()=>{
 const r=await scenario({userMismatch:true});
 assert.equal(r.code,1);
 assert.ok(r.logs.some(x=>x.includes('MESMA identidade')));
 assert.equal(r.requests.length,0);
});
test('Expired AAL2 token is rejected before a privileged request',async()=>{
 const r=await scenario({stale:true});
 assert.equal(r.code,1);
 assert.ok(r.logs.some(x=>x.includes('JWT expirado')));
 assert.equal(r.requests.length,0);
});
test('Missing test tokens result in not-run status, never pass',async()=>{
 const r=await scenario({missing:true});
 assert.equal(r.code,2);
 assert.equal(r.requests.length,0);
});
