import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const dashboard=readFileSync('app/index.html','utf8');
const settings=readFileSync('app/configuracoes.html','utf8');
const store=readFileSync('store/index.html','utf8');
const appearance=readFileSync('assets/js/appearance.js','utf8');
const script=settings.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Settings must expose a module script');
const executable=script
 .replace(/^import\s*\{[^}]*\}\s*from\s*'[^']+';\s*/gm,'')
 .replace(/import\.meta\.url/g,"'https://equipezero-web.github.io/Sistema-L-A-/app/configuracoes.html'");

const flags=['products_enabled','services_enabled','inventory_enabled','appointments_enabled','finance_enabled','ai_enabled'];
async function run({role='owner',mode='products',active=false,published=false,error=null}={}){
 const nodes=new Map(),calls=[],updates=[],nav=[];
 function element(id){
  if(!nodes.has(id))nodes.set(id,{
   id,textContent:'',checked:false,disabled:false,hidden:true,href:'',listeners:{},
   addEventListener(k,fn){this.listeners[k]=fn}
  });
  return nodes.get(id);
 }
 const settingsRecord=Object.fromEntries(flags.map(id=>[id,true]));
 const tables={
  saas_settings:settingsRecord,
  saas_store_themes:{published},
  saas_tenants:{slug:'minha-loja-teste',template_code:'generic'}
 };
 const supabase={
  from(name){
   const row=tables[name];
   const query={
    select(_columns){return query},
    update(payload){updates.push({table:name,payload});return query},
    eq(_key,_value){return query},
    async single(){return {data:name==='saas_settings'&&updates.length?{tenant_id:'tenant-test'}:row,error}}
   };
   calls.push(name);
   return query;
  },
  async rpc(name){calls.push(name);return {data:{active},error:null}}
 };
 const location={replace:path=>nav.push(path)};
 const ctx={membership:{role},tenant:{id:'tenant-test',name:'Loja Teste',business_mode:mode}};
 const context={
  supabase,location,URL,
  document:{getElementById:element},
  getBusinessContext:async()=>ctx
 };
 const result=vm.runInNewContext(executable,context);
 await new Promise(resolve=>setImmediate(resolve));
 return {
  element,calls,updates,nav,
  async save(){const fn=element('settingsForm').listeners.submit;assert.equal(typeof fn,'function');await fn({preventDefault(){}})},

 };
}
test('Navigation points to actual Settings page, not an empty hash',()=>{
 assert.match(dashboard,/data-module="settings" href="\.\/configuracoes\.html"/);
 assert.doesNotMatch(dashboard,/href="#configuracoes"/);
 assert.match(settings,/id="settingsForm"/);
 assert.match(settings,/import \{getBusinessContext\} from '\.\.\/assets\/js\/business\.js'/);
});
test('Owner can load settings without active subscription, but storefront remains hidden',async()=>{
 const app=await run();
 assert.equal(app.element('settingsForm').hidden,false);
 assert.equal(app.element('storeLinkBox').hidden,true);
 assert.match(app.element('storeState').textContent,/assinatura ou uma autorização temporária de teste/);
 assert.equal(app.element('services_enabled').checked,false);
 assert.equal(app.element('services_enabled').disabled,true);
});
test('Owner saves only tenant-scoped module flags and cannot activate storefront via form',async()=>{
 const app=await run({mode:'services'});
 await app.save();
 assert.equal(app.updates.length,1);
 assert.equal(app.updates[0].table,'saas_settings');
 assert.deepEqual(Object.keys(app.updates[0].payload),flags);
 assert.equal(app.updates[0].payload.products_enabled,false);
 assert.equal(app.updates[0].payload.inventory_enabled,false);
 assert.equal(app.element('storeLinkBox').hidden,true);
});
test('Only an owner can edit settings; non-owner is redirected',async()=>{
 const app=await run({role:'employee'});
 assert.deepEqual(app.nav,['./index.html']);
 assert.equal(app.calls.length,0);
 await app.save();
 assert.equal(app.updates.length,0);
});
test('Public storefront link exists only with active subscription and published theme',async()=>{
 const active=await run({active:true,published:true});
 assert.equal(active.element('storeLinkBox').hidden,false);
 assert.equal(active.element('storeLink').href,'https://equipezero-web.github.io/Sistema-L-A-/store/?slug=minha-loja-teste');
 const unpaid=await run({active:false,published:true});
 assert.equal(unpaid.element('storeLinkBox').hidden,true);
 const draft=await run({active:true,published:false});
 assert.equal(draft.element('storeLinkBox').hidden,true);
});
test('Customer-facing page is a public catalog, not a consumer checkout or admin panel',()=>{
 assert.match(store,/from\('saas_public_stores'\)/);
 assert.match(store,/saas_public_catalog_items/);
 assert.doesNotMatch(store,/saas_members|saas_settings/);
 assert.match(appearance,/\.\.\/store\/\?slug=/);
});

test('Company template is immutable from settings; public link uses canonical resolver',async()=>{
 const app=await run({role:'owner',active:true,published:true});
 assert.doesNotMatch(settings,/id="templateCode"|id="templateForm"|saveTemplate|\.update\(\{template_code:/);
 assert.doesNotMatch(settings,/Modelo da empresa/);
 assert.equal(app.element('storeLink').href,'https://equipezero-web.github.io/Sistema-L-A-/store/?slug=minha-loja-teste');
 assert.equal(app.updates.length,0);
});
