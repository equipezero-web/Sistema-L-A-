import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const business=readFileSync('assets/js/business.js','utf8');
const dashboard=readFileSync('assets/js/app.js','utf8');
const code=business.replace(/^import[^\n]*\n/g,'').replace(/\bexport\s+(?=(?:async\s+)?function\b)/g,'').replace(/import\.meta\.url/g,"'https://example.invalid/assets/js/business.js'");

async function run({session=true,level='aal1',next='aal1',superAdmin=false,accessError=null,member=true}={}){
 const calls=[],nav=[];
 const chain={
   select(){return chain},eq(){return chain},limit(){return chain},
   maybeSingle:async()=>({data:member?{tenant_id:'tenant-test',role:'employee',status:'active'}:null,error:null}),
   single:async()=>({data:{id:'tenant-test',name:'Teste',active:true},error:null})
 };
 const supabase={
  auth:{
   getUser:async()=>({data:{user:session?{id:'user-test'}:null},error:null}),
   mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:level,nextLevel:next},error:null})}
  },
  rpc:async name=>{calls.push(name);return {data:{is_platform_super_admin:superAdmin},error:accessError}},
  from:()=>chain
 };
 const location={href:'https://example.invalid/app/produtos.html',replace:url=>nav.push(url)};
 const context={supabase,location,document:{visibilityState:'hidden',hasFocus:()=>false},URL,setInterval:()=>1,clearInterval:()=>{},console,crypto:{}};
 const result=await vm.runInNewContext(code+'\ngetBusinessContext()',context).then(v=>({value:v}),error=>({error}));
 return {calls,nav,...result};
}

test('Unauthenticated internal module redirects to login',async()=>{
 const x=await run({session:false});
 assert.equal(x.nav.length,1);
 assert.match(x.nav[0],/\/auth\/login\.html$/);
 assert.ok(x.error);
});

test('Enrolled MFA at AAL1 must complete challenge before internal modules',async()=>{
 const x=await run({level:'aal1',next:'aal2'});
 assert.equal(x.nav.length,1);
 assert.match(x.nav[0],/\/auth\/login\.html$/);
 assert.deepEqual(x.calls,[]);
 assert.ok(x.error);
});

test('Platform admin cannot operate in a tenant module even with membership',async()=>{
 const x=await run({level:'aal2',next:'aal2',superAdmin:true});
 assert.equal(x.nav.length,1);
 assert.match(x.nav[0],/\/super-admin\/index\.html$/);
 assert.ok(x.error);
});

test('AAL2 employee is allowed in active tenant context',async()=>{
 const x=await run({level:'aal2',next:'aal2'});
 assert.equal(x.nav.length,0);
 assert.equal(x.value.membership.role,'employee');
 assert.equal(x.value.canManage,false);
});

test('Failed profile authorization does not continue to tenant',async()=>{
 const x=await run({accessError:{message:'not available'}});
 assert.ok(x.error);
 assert.equal(x.nav.length,0);
});

test('Dashboard checks platform role even if active membership exists',()=>{
 assert.match(dashboard,/if\(platformAccess\.is_platform_super_admin===true\)\{location\.replace\('\.\.\/super-admin\/index\.html'\);return\}/);
 assert.match(dashboard,/if\(platformAccessError\|\|!platformAccess\)\{show\('Não foi possível verificar o perfil da conta\.'\);return\}/);
});
