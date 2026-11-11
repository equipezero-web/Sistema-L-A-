import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const authJs=readFileSync('assets/js/auth.js','utf8');
const login=readFileSync('auth/login.html','utf8');
const setup=readFileSync('security/setup-2fa.html','utf8');

const setupSource=setup.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(setupSource,'2FA page must contain its module');
const executable=setupSource.replace(/import\{[^}]+\}from'[^']+';/g,'');

async function scenario({session=true,superAdmin=false,factors=[],level='aal1',search=''}={}){
  const nodes=new Map();
  function getNode(id){
    if(!nodes.has(id)){
      const classes=new Set();
      nodes.set(id,{
        id,textContent:'',src:'',hidden:false,value:'123456',listeners:{},
        classList:{
          add(value){classes.add(value)},
          remove(value){classes.delete(value)},
          contains(value){return classes.has(value)}
        },
        addEventListener(type,listener){this.listeners[type]=listener}
      });
    }
    return nodes.get(id);
  }
  const document={querySelector:selector=>getNode(selector.slice(1))};
  const location={href:'',search,replace(path){this.href=path}};
  let enrollCalls=0,challengeCalls=0,enrollmentVerifications=0,preference=null,profileCalls=0;
  const context={
    document,location,URLSearchParams,
    getSession:async()=>session?{user:{id:'test'}}:null,
    getMyProfile:async()=>{profileCalls++;return {is_platform_super_admin:superAdmin}},
    getAAL:async()=>({currentLevel:level,nextLevel:factors.length?'aal2':'aal1'}),
    listMfaFactors:async()=>({totp:factors}),
    enrollTotp:async()=>{enrollCalls++;return {id:'new',totp:{qr_code:'data:image/svg+xml,mock',secret:'TEST-SECRET'}}},
    verifyTotpEnrollment:async()=>{enrollmentVerifications++;level='aal2'},
    challengeTotp:async()=>{challengeCalls++;level='aal2'},
    declineOptionalMfa:async()=>{preference='declined'},
    setMfaPreference:async value=>{preference=value},
    setTimeout:fn=>{fn()},
    console
  };
  await vm.runInNewContext('(async()=>{'+executable+'})()',context);
  // Allow the async existing-factor detection to finish.
  await new Promise(resolve=>setImmediate(resolve));
  return {
    nodes,location,
    get enrollCalls(){return enrollCalls},
    get challengeCalls(){return challengeCalls},
    get enrollmentVerifications(){return enrollmentVerifications},
    get preference(){return preference},
    get profileCalls(){return profileCalls},
    click:async id=>{const fn=getNode(id).listeners.click;assert.equal(typeof fn,'function','Missing click listener: '+id);await fn()},
    node:getNode
  };
}

test('Sign up requests an explicit, same-site confirmation destination',async()=>{
  const cleaned=authJs.replace(/^import .+;\s*$/gm,'')
    .replace(/\bexport\s+(?=(?:async\s+)?function\b)/g,'')
    .replace(/import\.meta\.url/g,"'https://equipezero-web.github.io/Sistema-L-A-/assets/js/auth.js'");
  let request=null;
  const supabase={auth:{signUp:async input=>{request=input;return {data:{session:null},error:null}}}};
  await vm.runInNewContext(cleaned+'\nsignUpOwner({fullName:"Test",email:"test@example.invalid",phone:"123",password:"any"})',{supabase,URL});
  assert.equal(request.options.emailRedirectTo,'https://equipezero-web.github.io/Sistema-L-A-/auth/login.html');
  assert.equal(request.options.data.full_name,'Test');
});

test('Login can resume a confirmed email session without password re-entry',()=>{
  assert.match(login,/getSession/);
  assert.match(login,/resumeConfirmedSession\(\)/);
  assert.match(login,/if\(session\)await route\(\)/);
});

test('Existing TOTP factor uses challenge instead of attempting enrollment',async()=>{
  const app=await scenario({factors:[{id:'verified-test',status:'verified'}]});
  assert.equal(app.enrollCalls,0);
  assert.equal(app.node('enrollTitle').textContent,'Confirme seu aplicativo autenticador');
  assert.equal(app.node('qr').hidden,true);
  assert.equal(app.node('secret').hidden,true);
  await app.click('confirm');
  assert.equal(app.challengeCalls,1);
  assert.equal(app.enrollmentVerifications,0);
  assert.equal(app.preference,'enabled');
  assert.equal(app.location.href,'../app/plano.html');
});

test('New factor enrolls, verifies and navigates only after AAL2',async()=>{
  const app=await scenario();
  await app.click('enable');
  assert.equal(app.enrollCalls,1);
  assert.equal(app.node('qr').src,'data:image/svg+xml,mock');
  assert.equal(app.node('secret').textContent,'TEST-SECRET');
  await app.click('confirm');
  assert.equal(app.enrollmentVerifications,1);
  assert.equal(app.challengeCalls,0);
  assert.equal(app.preference,'enabled');
  assert.equal(app.location.href,'../app/plano.html');
});

test('Super Admin with a verified factor must complete MFA challenge',async()=>{
  const app=await scenario({superAdmin:true,factors:[{id:'verified-super',status:'verified'}]});
  assert.doesNotMatch(setup,/id="skip"|Agora não/);
  assert.equal(app.node('title').textContent,'Ative a verificação em duas etapas');
  assert.equal(app.location.href,'');
  await app.click('confirm');
  assert.equal(app.challengeCalls,1);
  assert.equal(app.location.href,'../super-admin/index.html');
});

test('Already-verified Super Admin with AAL2 persists preference before moving on',async()=>{
  const app=await scenario({superAdmin:true,factors:[{id:'verified',status:'verified'}],level:'aal2'});
  assert.equal(app.preference,'enabled');
  assert.equal(app.location.href,'../super-admin/index.html');
  assert.equal(app.enrollCalls,0);
});

test('Query string alone cannot elevate regular user to Super Admin',async()=>{
  const app=await scenario({
    search:'?required=1',level:'aal2',
    factors:[{id:'verified-regular',status:'verified'}]
  });
  assert.equal(app.preference,'enabled');
  assert.equal(app.location.href,'../app/plano.html');
});

test('Without a session, 2FA redirects to login without making profile calls',async()=>{
  const app=await scenario({session:false});
  assert.equal(app.location.href,'../auth/login.html');
  assert.equal(app.profileCalls,0);
});
