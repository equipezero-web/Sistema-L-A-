import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const page=readFileSync('security/trocar-2fa.html','utf8');
const auth=readFileSync('assets/js/auth.js','utf8');
const source=page.match(/<script type="module">([\s\S]+?)<\/script>/)?.[1];
assert.ok(source,'Rotation page must contain a module');
const executable=source.replace(/^import\s*\{[^}]+\}\s*from\s*'[^']+';\s*/m,'');

async function scenario({signedIn=true,level='aal2',verified=1,badCode=false,failUnenrollOnce=false}={}){
 const events=[],nodes=new Map();
 const factors=Array.from({length:verified},(_,i)=>({id:i===0?'old':'backup',status:'verified'}));
 let revokeFailures=failUnenrollOnce?1:0;
 function element(id){
  if(!nodes.has(id)){
   const classes=new Set(['startBox','enrollBox','retryBox'].includes(id)?['hidden']:[]);
   nodes.set(id,{id,src:'',textContent:'',value:'123456',disabled:false,listeners:{},
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
    addEventListener(type,fn){this.listeners[type]=fn}});
  }
  return nodes.get(id);
 }
 const location={href:'',replace(x){this.href=x}};
 const context={
  document:{getElementById:element},location,console,
  getVerifiedUser:async()=>signedIn?{id:'test-user'}:null,
  getAAL:async()=>({currentLevel:level}),
  listMfaFactors:async()=>({totp:factors.map(x=>({...x}))}),
  enrollTotp:async()=>{events.push('enroll');factors.push({id:'new',status:'unverified'});return {id:'new',totp:{qr_code:'data:image/mock',secret:'SYNTHETIC-ROTATION-SECRET'}}},
  verifyTotpEnrollment:async()=>{events.push('verify');if(badCode)throw new Error('invalid code');factors.find(f=>f.id==='new').status='verified'},
  unenrollTotp:async id=>{events.push('unenroll:'+id);if(revokeFailures-->0)throw new Error('revocation failed');const i=factors.findIndex(f=>f.id===id);if(i>=0)factors.splice(i,1)},
  setMfaPreference:async x=>{events.push('preference:'+x)}
 };
 vm.runInNewContext(executable,context);
 await new Promise(resolve=>setImmediate(resolve));
 return {
  events,factors,nodes,location,
  element,
  async click(id){const f=element(id).listeners.click;assert.equal(typeof f,'function','Missing click handler: '+id);await f()}
 };
}
test('New authenticator is verified before old authenticator is revoked',async()=>{
 const app=await scenario();
 assert.equal(app.element('startBox').classList.contains('hidden'),false);
 await app.click('start');
 assert.deepEqual(app.events,['enroll']);
 assert.equal(app.factors.find(f=>f.id==='old').status,'verified');
 await app.click('confirm');
 assert.deepEqual(app.events,['enroll','verify','preference:enabled','unenroll:old']);
 assert.deepEqual(app.factors.map(f=>f.id),['new']);
 assert.equal(app.element('secret').textContent,'');
 assert.equal(app.element('qr').src,'');
 assert.match(app.element('status').textContent,/fator antigo revogado/);
});
test('Incorrect new TOTP code never revokes the old factor',async()=>{
 const app=await scenario({badCode:true});
 await app.click('start');
 await app.click('confirm');
 assert.deepEqual(app.events,['enroll','verify']);
 assert.ok(app.factors.some(f=>f.id==='old'));
 assert.ok(app.factors.some(f=>f.id==='new'&&f.status==='unverified'));
});
test('Failed unenroll remains retriable without revalidating a new factor',async()=>{
 const app=await scenario({failUnenrollOnce:true});
 await app.click('start');
 await app.click('confirm');
 assert.equal(app.element('retryBox').classList.contains('hidden'),false);
 assert.ok(app.factors.some(f=>f.id==='old'));
 await app.click('retry');
 assert.equal(app.element('retryBox').classList.contains('hidden'),true);
 assert.deepEqual(app.events,['enroll','verify','preference:enabled','unenroll:old','preference:enabled','unenroll:old']);
 assert.deepEqual(app.factors.map(f=>f.id),['new']);
});
test('No verified session or no AAL2 cannot initiate a rotation',async()=>{
 for(const options of [{signedIn:false},{level:'aal1'},{verified:0},{verified:2}]){
  const app=await scenario(options);
  assert.equal(app.element('startBox').classList.contains('hidden'),true);
  assert.deepEqual(app.events,[]);
  await app.click('start');
  assert.deepEqual(app.events,[]);
 }
});
test('Auth helper uses user-scoped MFA unenroll and onboarding links to rotation',()=>{
 const setup=readFileSync('security/setup-2fa.html','utf8');
 assert.match(auth,/export async function unenrollTotp\(factorId\)/);
 assert.match(auth,/supabase\.auth\.mfa\.unenroll\(\{ factorId \}\)/);
 assert.match(setup,/href="trocar-2fa\.html"/);
 assert.doesNotMatch(source,/service_role|SUPABASE_SECRET/i);
});
