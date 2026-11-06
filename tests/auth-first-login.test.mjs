import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('assets/js/app.js','utf8');
const executable=source
  .replace(/^import .+;\s*$/gm,'')
  .replace(/boot\(\)\.catch\(e=>show\(e\.message\|\|'Erro ao carregar o painel\.'\)\);/,'');
if (executable.includes('boot().catch')) throw new Error('Boot hook not removed');

async function runCase({
  session=true,members=[],membersError=null,notice=null,
  access={has_any_membership:false,has_owned_tenant:false,is_platform_super_admin:false},
  accessError=null,aal={currentLevel:'aal1',nextLevel:'aal1'}
}={}){
  const elements=new Map();
  function node(key){
    if(!elements.has(key)){
      const classes=new Set(['hidden']);
      elements.set(key,{
        textContent:'',className:'',attributes:new Map(),
        classList:{
          add(value){classes.add(value)},remove(value){classes.delete(value)},
          contains(value){return classes.has(value)}
        },
        addEventListener(){},setAttribute(k,v){this.attributes.set(k,v)}
      });
    }
    return elements.get(key);
  }
  const location={href:'https://example.test/Sistema-L-A-/app/index.html',navigation:null,
    replace(url){this.navigation=url}
  };
  const supabase={
    from(table){
      if(table!=='saas_members')throw new Error('Unexpected table: '+table);
      const result={data:members,error:membersError};
      const chain={select(){return chain},eq(){return chain},
        then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}};
      return chain;
    },
    rpc(name){
      if(name==='saas_my_platform_notice')return Promise.resolve({data:notice,error:null});
      if(name==='saas_my_access_summary')return Promise.resolve({data:access,error:accessError});
      throw Error('Unexpected RPC: '+name);
    }
  };
  const document={
    querySelector:node,querySelectorAll(){return []}
  };
  const context={
    supabase,
    getSession:async()=>session?{user:{id:'test-user',email:'new@example.invalid'}}:null,
    getAAL:async()=>aal,signOut:async()=>{},
    document,location,
    Intl,Date,console,window:{},
    setInterval(){return 1},clearInterval(){}
  };
  const promise=vm.runInNewContext(executable+'\nboot();',context);
  await promise;
  return {location,elements};
}

test('brand-new account is redirected to onboarding',async()=>{
  const result=await runCase();
  assert.equal(result.location.navigation,'../onboarding/index.html');
});
test('suspended employee without owner notice does not enter onboarding',async()=>{
  const result=await runCase({access:{
    has_any_membership:true,has_owned_tenant:false,is_platform_super_admin:false
  }});
  assert.equal(result.location.navigation,null);
  assert.match(result.elements.get('#status').textContent,/Nenhuma empresa ativa/);
});
test('suspended owner sees platform notice instead of onboarding',async()=>{
  const result=await runCase({notice:{
    title:'Acesso à plataforma encerrado',message:'Motivo de teste',created_at:'2026-11-06T12:00:00Z'
  }});
  assert.equal(result.location.navigation,null);
  assert.equal(result.elements.get('#noticeTitle').textContent,'Acesso à plataforma encerrado');
});
test('Super Admin without tenant is routed to protected administrative panel',async()=>{
  const result=await runCase({access:{
    has_any_membership:false,has_owned_tenant:false,is_platform_super_admin:true
  }});
  assert.equal(result.location.navigation,'../super-admin/index.html');
});
test('existing owner without an active membership cannot be treated as a new account',async()=>{
  const result=await runCase({access:{
    has_any_membership:false,has_owned_tenant:true,is_platform_super_admin:false
  }});
  assert.equal(result.location.navigation,null);
});
test('summary API failure must not assume the user is new',async()=>{
  const result=await runCase({accessError:{message:'network failure'}});
  assert.equal(result.location.navigation,null);
});
test('unauthenticated user is redirected to login',async()=>{
  const result=await runCase({session:false});
  assert.equal(result.location.href,'../auth/login.html');
});
