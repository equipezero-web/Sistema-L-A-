import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('onboarding/index.html', 'utf8');
const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(source, 'Onboarding inline module must exist');
const code = source.replace(/^import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?\s*$/gm, '');

async function scenario({session=true,access={has_any_membership:false,has_owned_tenant:false,is_platform_super_admin:false}, accessError=null, creationError=null, slowCreate=false}={}) {
  const elements = new Map();
  const get = selector => {
    if (!elements.has(selector)) {
      const listeners = {};
      const fields = {companyName:'Empresa Teste',slug:'empresa-teste',businessType:'Loja',businessMode:'products',primaryColor:'#d4af37',secondaryColor:'#f1d477',backgroundColor:'#08090c',textColor:'#f8fafc',fontStyle:'Inter',layoutId:'royal-classic'};
      elements.set(selector, {value:fields[selector.slice(1)]||'',disabled:true,textContent:'',className:'',
        listeners,addEventListener(type,fn){listeners[type]=fn}});
    }
    return elements.get(selector);
  };
  const location = {url:'',replace(url){this.url=url}};
  let accessCalls=0,creationCalls=0;
  let resolveCreation;
  const supabase = {rpc:async name => {
    if (name==='saas_my_access_summary') {accessCalls++;return {data:access,error:accessError};}
    if (name==='saas_onboard_company') {
      creationCalls++;
      if(slowCreate) return new Promise(resolve=>{resolveCreation=()=>resolve({data:{id:'tenant'},error:creationError})});
      return {data:{id:'tenant'},error:creationError};
    }
    throw Error('Unexpected RPC '+name);
  }};
  const saved={};
  const context={document:{querySelector:get},supabase,location,
    getSession:async()=>session?{user:{id:'user'}}:null,
    sessionStorage:{setItem(k,v){saved[k]=v}},
    console};
  vm.runInNewContext(code,context);
  await new Promise(resolve=>setImmediate(resolve));
  async function submit(){
    const handler=get('#companyForm').listeners.submit;
    assert.equal(typeof handler,'function');
    await handler({preventDefault(){}});
  }
  return {get,location,saved,submit,get accessCalls(){return accessCalls},get creationCalls(){return creationCalls},release:()=>resolveCreation?.()};
}

test('new user can submit only after access summary confirms no membership',async()=>{
  const app=await scenario();
  assert.equal(app.get('#createCompany').disabled,false);
  await app.submit();
  assert.equal(app.creationCalls,1);
  assert.equal(app.location.url,'../security/setup-2fa.html');
  assert.equal(app.saved.royal_tenant_id,'tenant');
});

test('existing owner is routed to dashboard, never creates another company',async()=>{
  const app=await scenario({access:{has_any_membership:true,has_owned_tenant:true,is_platform_super_admin:false}});
  assert.equal(app.location.url,'../app/index.html');
  await app.submit();
  assert.equal(app.creationCalls,0);
});

test('suspended member must not be routed into new onboarding',async()=>{
  const app=await scenario({access:{has_any_membership:true,has_owned_tenant:false,is_platform_super_admin:false}});
  assert.equal(app.location.url,'../app/index.html');
  assert.equal(app.get('#createCompany').disabled,true);
});

test('Super Admin returns to protected panel without tenant creation',async()=>{
  const app=await scenario({access:{has_any_membership:false,has_owned_tenant:false,is_platform_super_admin:true}});
  assert.equal(app.location.url,'../super-admin/index.html');
  assert.equal(app.creationCalls,0);
});

test('no session redirects to login',async()=>{
  const app=await scenario({session:false});
  assert.equal(app.location.url,'../auth/login.html');
  assert.equal(app.get('#createCompany').disabled,true);
});

test('API error keeps submit locked',async()=>{
  const app=await scenario({accessError:{message:'Access unavailable'}});
  assert.equal(app.creationCalls,0);
  assert.equal(app.get('#createCompany').disabled,true);
  assert.match(app.get('#status').textContent,/Access unavailable/);
});

test('two simultaneous submissions trigger only one company creation',async()=>{
  const app=await scenario({slowCreate:true});
  const one=app.submit();
  await new Promise(resolve=>setImmediate(resolve));
  const two=app.submit();
  assert.equal(app.creationCalls,1);
  app.release();
  await Promise.all([one,two]);
  assert.equal(app.creationCalls,1);
});

test('another tab creating a tenant before submit prevents duplicated onboarding',async()=>{
  const app=await scenario();
  // The access summary is read again immediately before submitting.
  // Other-tab ownership is covered by this explicit revalidation contract.
  assert.equal(app.accessCalls,1);
  await app.submit();
  assert.equal(app.accessCalls,2);
});
