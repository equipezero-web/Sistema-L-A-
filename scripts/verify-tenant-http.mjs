// Manual, read-only HTTP authorization smoke test.
// Requires two dedicated owner/admin test identities with at least one row per audited table.
// Do not run with customer credentials or production application users.
// Usage: SAAS_TEST_A_TOKEN=... SAAS_TEST_A_TENANT_ID=... SAAS_TEST_B_TOKEN=...
//        SAAS_TEST_B_TENANT_ID=... SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=...
//        node scripts/verify-tenant-http.mjs
// All requests are GET or POST to read-only RPCs. No service_role is accepted.
import assert from 'node:assert/strict';

const keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SAAS_TEST_A_TOKEN','SAAS_TEST_A_TENANT_ID','SAAS_TEST_B_TOKEN','SAAS_TEST_B_TENANT_ID'];
const missing=keys.filter(key=>!process.env[key]);
if(missing.length) {
 console.error('Configuração de homologação ausente: '+missing.join(', '));
 process.exitCode=2;
} else {
 const base=process.env.SUPABASE_URL.replace(/\/$/,'');
 const key=process.env.SUPABASE_PUBLISHABLE_KEY;
 assert.match(base,/^https:\/\/[\w.-]+\.supabase\.co$/,'Use apenas o domínio Supabase esperado.');
 assert.ok(key.startsWith('sb_publishable_'),'Chave publishable obrigatória: nunca utilizar service_role.');
 const a={token:process.env.SAAS_TEST_A_TOKEN,tenant:process.env.SAAS_TEST_A_TENANT_ID};
 const b={token:process.env.SAAS_TEST_B_TOKEN,tenant:process.env.SAAS_TEST_B_TENANT_ID};
 for (const u of [a,b])assert.match(u.tenant,/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i,'Tenant ID inválido');
 assert.notEqual(a.tenant,b.tenant,'Empresas de teste devem ser distintas.');
 assert.notEqual(a.token,b.token,'Tokens de homologação devem pertencer a usuários diferentes.');

 async function call(u,path,{method='GET',body}={}) {
   const headers={apikey:key,Authorization:'Bearer '+u.token,Accept:'application/json'};
   if(body!==undefined)headers['Content-Type']='application/json';
   const response=await fetch(base+path,{
     method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000)
   });
   const raw=await response.text();
   let data;
   try{data=JSON.parse(raw)}catch{data=null}
   return {status:response.status,ok:response.ok,data};
 }
 const uuid=encodeURIComponent;
 async function checkUser(u,label) {
  const r=await call(u,'/auth/v1/user');
  assert.ok(r.ok,label+': token não foi aceito pelo Auth (HTTP '+r.status+')');
  assert.ok(r.data?.id,label+': Auth não forneceu um identificador.');
  return r.data.id;
 }
 async function memberRows(u,tenant) {
  const path='/rest/v1/saas_members?select=tenant_id%2Cuser_id%2Crole%2Cstatus&tenant_id=eq.'+uuid(tenant)+'&status=eq.active';
  const r=await call(u,path);
  assert.ok(r.ok,'Consulta de membros falhou (HTTP '+r.status+')');
  assert.ok(Array.isArray(r.data));
  return r.data;
 }
 // Require a real record in each test tenant before claiming isolation.
 // Query foreign rows by their verified UUID, not an empty tenant filter.
 async function ownRecord(u,tenant,table){
  const path='/rest/v1/'+table+'?select=id%2Ctenant_id&tenant_id=eq.'+uuid(tenant)+'&limit=1';
  const r=await call(u,path);
  assert.ok(r.ok,'SELECT '+table+' falhou (HTTP '+r.status+')');
  assert.ok(Array.isArray(r.data)&&r.data.length===1,table+': a empresa de homologação precisa ter pelo menos um registro de teste.');
  assert.equal(r.data[0].tenant_id,tenant,table+': registro inconsistente com a empresa.');
  assert.match(r.data[0].id,/^[\\da-f]{8}(-[\\da-f]{4}){3}-[\\da-f]{12}$/i);
  return r.data[0].id;
 }
 async function crossRead(u,tenant,table,recordId){
  const path='/rest/v1/'+table+'?select=id%2Ctenant_id&id=eq.'+uuid(recordId)+'&tenant_id=eq.'+uuid(tenant);
  const r=await call(u,path);
  assert.ok(r.ok,'SELECT '+table+' cruzado falhou (HTTP '+r.status+')');
  assert.deepEqual(r.data,[],table+': registro comprovadamente existente da outra empresa ficou visível!');
 }
 async function foreignCosts(u,tenant){
  const r=await call(u,'/rest/v1/rpc/saas_manager_product_costs',{
    method:'POST',body:{p_tenant_id:tenant}
  });
  assert.ok(!r.ok,'RPC de custos de outra empresa não deveria ser permitida.');
  assert.ok([400,401,403,404].includes(r.status),'RPC retornou HTTP inesperado '+r.status);
 }
 async function noPlatformAccess(u){
  const r=await call(u,'/rest/v1/rpc/saas_platform_tenants',{method:'POST',body:{}});
  assert.ok(!r.ok,'Usuário comum recebeu permissão de listar empresas da plataforma.');
 }
 try{
  const [uidA,uidB]=await Promise.all([checkUser(a,'A'),checkUser(b,'B')]);
  assert.notEqual(uidA,uidB,'As contas de teste devem ser distintas.');
  const cases=[['A',a,a,b,uidA],['B',b,b,a,uidB]];
  const tables=['saas_customers','saas_products','saas_orders','saas_financial_entries'];
  const fixtures={};
  for(const [label,u,own,,uid] of cases){
   const memberships=await memberRows(u,own.tenant);
   assert.ok(memberships.some(r=>r.user_id===uid&&['owner','admin'].includes(r.role)),
      'A conta '+label+' precisa ser proprietário ou administrador ativo da empresa de homologação.');
   fixtures[label]={};
   for(const table of tables) fixtures[label][table]=await ownRecord(u,own.tenant,table);
  }
  for (const [label,u,,other] of cases){
   assert.deepEqual(await memberRows(u,other.tenant),[],'Acesso aos membros de outra empresa.');
   const otherLabel=label==='A'?'B':'A';
   for(const table of tables)
     await crossRead(u,other.tenant,table,fixtures[otherLabel][table]);
   await foreignCosts(u,other.tenant);
   await noPlatformAccess(u);
   console.log(label+': identidade validada; dados próprios presentes; registros existentes de outra empresa invisíveis.');
  }
  console.log('Homologação HTTP de leitura concluída com duas contas de teste.');
 } catch (err){
  console.error('Homologação HTTP falhou: '+err.message);
  process.exitCode=1;
 }
}
