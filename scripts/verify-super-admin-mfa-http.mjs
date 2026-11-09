// Opt-in, read-only AAL1 vs AAL2 authorization check for a dedicated TEST Super Admin.
// The two access tokens MUST belong to the SAME user, before and after real MFA.
// Never use customer credentials, production staff, a service role, or store tokens in git.
// All network requests are GET or POST to READ-ONLY RPC saas_platform_tenants.
// Environment: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
// SAAS_TEST_ADMIN_AAL1_TOKEN, SAAS_TEST_ADMIN_AAL2_TOKEN.
// Run: node scripts/verify-super-admin-mfa-http.mjs
import assert from 'node:assert/strict';

const needed=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SAAS_TEST_ADMIN_AAL1_TOKEN','SAAS_TEST_ADMIN_AAL2_TOKEN'];
const missing=needed.filter(k=>!process.env[k]);
if(missing.length){
 console.error('Homologação MFA não iniciada. Variáveis ausentes: '+missing.join(', '));
 process.exitCode=2;
} else {
 const base=process.env.SUPABASE_URL.replace(/\/$/,'');
 const key=process.env.SUPABASE_PUBLISHABLE_KEY;
 assert.match(base,/^https:\/\/[\w.-]+\.supabase\.co$/);
 assert.ok(key.startsWith('sb_publishable_'),'Use uma chave publicável, nunca service_role.');
 const lower={token:process.env.SAAS_TEST_ADMIN_AAL1_TOKEN};
 const higher={token:process.env.SAAS_TEST_ADMIN_AAL2_TOKEN};
 assert.notEqual(lower.token,higher.token,'AAL1 e AAL2 exigem tokens distintos.');
 // JWT decoding is only used to CHECK claims. The token's signature/validity
 // is verified separately by Supabase Auth via /auth/v1/user.
 function claims(token){
   const parts=token.split('.');
   assert.equal(parts.length,3,'Token de acesso JWT inválido.');
   let payload;
   try{payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'))}
   catch{throw new Error('Não foi possível inspecionar claims JWT.')}
   assert.equal(payload.role,'authenticated','Role autenticada obrigatória.');
   assert.ok(typeof payload.sub==='string'&&payload.sub.length>0,'JWT sem sub.');
   assert.ok(typeof payload.exp==='number'&&payload.exp>Math.floor(Date.now()/1000),'JWT expirado.');
   assert.equal(payload.aud,'authenticated','Audience JWT inesperada.');
   assert.equal(payload.iss,base+'/auth/v1','Issuer de outro projeto Supabase.');
   return payload;
 }
 async function request(token,path,{method='GET',body}={}){
   const headers={apikey:key,Authorization:'Bearer '+token,Accept:'application/json'};
   if(body!==undefined)headers['Content-Type']='application/json';
   const result=await fetch(base+path,{method,headers,
     body:body===undefined?undefined:JSON.stringify(body),
     redirect:'error',signal:AbortSignal.timeout(12000)});
   const raw=await result.text();
   let data=null;
   try{data=JSON.parse(raw)}catch{}
   return {ok:result.ok,status:result.status,data};
 }
 try{
   const c1=claims(lower.token),c2=claims(higher.token);
   assert.equal(c1.aal||'aal1','aal1','Token inicial deve estar em AAL1.');
   assert.equal(c2.aal,'aal2','Token final deve estar em AAL2 após o segundo fator.');
   assert.equal(c1.sub,c2.sub,'Tokens devem pertencer à MESMA identidade de teste.');
   const [user1,user2]=await Promise.all([
     request(lower.token,'/auth/v1/user'),request(higher.token,'/auth/v1/user')
   ]);
   assert.ok(user1.ok&&user2.ok,'O Auth rejeitou um dos tokens de homologação.');
   assert.equal(user1.data?.id,c1.sub,'A identidade do AAL1 diverge do Auth.');
   assert.equal(user2.data?.id,c2.sub,'A identidade do AAL2 diverge do Auth.');
   const [denied,allowed]=await Promise.all([
     request(lower.token,'/rest/v1/rpc/saas_platform_tenants',{method:'POST',body:{}}),
     request(higher.token,'/rest/v1/rpc/saas_platform_tenants',{method:'POST',body:{}})
   ]);
   assert.equal(denied.ok,false,'AAL1 não pode acessar listagem privilegiada.');
   assert.ok([400,401,403,404].includes(denied.status),'Resposta de negação HTTP inesperada.');
   assert.equal(allowed.ok,true,'Super Admin AAL2 não conseguiu consultar RPC de leitura.');
   assert.ok(Array.isArray(allowed.data),'A RPC privilegiada deveria devolver uma lista JSON.');
   console.log('Homologação AAL1/AAL2 aprovada: mesma identidade, AAL1 negado, AAL2 autorizado.');
 }catch(error){
   // Do not print full network responses or tokens.
   console.error('Homologação AAL1/AAL2 falhou: '+error.message);
   process.exitCode=1;
 }
}
