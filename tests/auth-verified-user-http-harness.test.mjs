import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const auth=readFileSync('assets/js/auth.js','utf8');
const app=readFileSync('assets/js/app.js','utf8');
const superAdmin=readFileSync('assets/js/super-admin.js','utf8');
const httpScript=readFileSync('scripts/verify-tenant-http.mjs','utf8');

test('getVerifiedUser checks user at Auth service and rejects errors',async()=>{
 const snippet=auth.slice(auth.indexOf('export async function getVerifiedUser()'),auth.indexOf('export async function getSession()')).replace('export ','');
 const scenario=async(result)=>{
  const context={supabase:{auth:{getUser:async()=>result}}};
  return vm.runInNewContext(snippet+'\ngetVerifiedUser()',context);
 };
 const verified=await scenario({data:{user:{id:'verified-id'}}});
 assert.equal(verified.id,'verified-id');
 assert.equal(await scenario({data:{user:null}}),null);
 await assert.rejects(()=>scenario({data:{user:null},error:new Error('invalid session')}),/invalid session/);
});
test('getMyProfile uses server-verified user instead of local getSession',()=>{
 const source=auth.slice(auth.indexOf('export async function getMyProfile()'));
 assert.match(source,/const user = await getVerifiedUser\(\)/);
 assert.doesNotMatch(source,/getSession\(\)/);
 assert.match(source,/\.eq\('user_id', user\.id\)/);
});
test('Dashboard validates identity before membership and module access',()=>{
 assert.match(app,/const user=await getVerifiedUser\(\);if\(!user\)/);
 assert.doesNotMatch(app,/getSession\(/);
 assert.match(app,/\.eq\('user_id',user\.id\)/);
 assert.match(app,/const aal=await getAAL\(\)/);
});
test('Super Admin verifies token and AAL2 before any privileged data fetch',()=>{
 const start=superAdmin.indexOf('async function boot()');
 const snippet=superAdmin.slice(start);
 assert.match(snippet,/const user = await getVerifiedUser\(\)/);
 assert.match(snippet,/const profile = await getMyProfile\(\)/);
 assert.match(snippet,/aal\.currentLevel !== 'aal2'/);
 assert.ok(snippet.indexOf('getVerifiedUser()')<snippet.indexOf("supabase.from('saas_tenants')"));
 assert.ok(snippet.indexOf("aal.currentLevel !== 'aal2'")<snippet.indexOf("supabase.from('saas_tenants')"));
 assert.doesNotMatch(snippet,/getSession\(/);
});
test('HTTP test harness is read-only, does not use service key or expose tokens',()=>{
 assert.match(httpScript,/\/auth\/v1\/user/);
 assert.match(httpScript,/\/rest\/v1\/saas_members/);
 assert.match(httpScript,/\/rest\/v1\/rpc\/saas_manager_product_costs/);
 assert.match(httpScript,/\/rest\/v1\/rpc\/saas_platform_tenants/);
 assert.match(httpScript,/SAAS_TEST_A_TOKEN/);
 assert.match(httpScript,/SAAS_TEST_B_TOKEN/);
 assert.doesNotMatch(httpScript,/service_role[\s\S]{0,20}Bearer|\bDELETE\b|'PATCH'|'PUT'|method:'POST',body:\{p_tenant_id:[^}]*update/i);
 assert.match(httpScript,/assert\.notEqual\(a\.tenant,b\.tenant/);
});
