import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync('store/barbearia.html','utf8');
const js=readFileSync('assets/js/barber-original-template.js','utf8');
const store=readFileSync('store/index.html','utf8');
const program=js.replace(/^import\s*\{\s*supabase\s*\}\s*from\s*'[^']+';/,'');
const ids=['app','home','appointments','club','plans','profile','serviceChoices','employeeChoices',
 'datePick','slots','bookingSummary','total','durationTotal','bookBtn','saasGuestDialog','saasGuestForm'];

test('Original barber customer sections and markup are preserved in dedicated template',()=>{
 for(const id of ids)assert.match(html,new RegExp('id="'+id+'"'),id);
 assert.match(html,/class="sidebar"/);
 assert.match(html,/class="booking card"/);
 assert.match(html,/class="service-list" id="serviceChoices"/);
 assert.match(html,/data-sec="home"/);
 assert.match(html,/data-sec="appointments"/);
 assert.match(html,/data-sec="club"/);
 assert.match(html,/data-sec="plans"/);
 assert.match(html,/data-sec="profile"/);
 assert.match(html,/<style>\s*:root/);
 assert.match(html,/\.reception-sidebar/); // Original CSS, not an executable admin portal
 assert.doesNotMatch(html,/id="adminApp"|id="receptionApp"|id="authModal"/);
 assert.doesNotMatch(html,/src="config\.js"|supabase-js@2\.58|localStorage\.setItem/);
 assert.doesNotMatch(html,/on(click|change|blur|submit)="/);
});
test('Published barbershop switches to the original complete experience while other models are preserved',()=>{
 assert.match(store,/store\.template_code === 'barbershop'/);
 assert.match(store,/\.\/barbearia\.html\?slug=/);
 assert.match(store,/get\('view'\) !== 'catalogo'/);
 assert.match(store,/saas_public_stores/);
 assert.match(store,/saas_public_catalog_items/);
});
test('Original code credentials and local customer storage were intentionally NOT reused',()=>{
 assert.doesNotMatch(js,/\\blocalStorage\\.|service_role|ADMIN_PASSWORD|createClient|ap-create-booking/);
 assert.match(js,/rpc\('saas_barber_public_setup'/);
 assert.match(js,/rpc\('saas_barber_available_slots'/);
 assert.match(js,/rpc\('saas_barber_request_booking'/);
 assert.match(js,/data\?\.status!=='pending'/);
 assert.match(js,/store\.name/);
 assert.match(js,/saas_public_stores/);
 assert.match(js,/saas_public_catalog_items/);
 assert.doesNotThrow(()=>new vm.Script(program));
});

function createDom(){
 const nodes=new Map();
 function node(tag='div',id=''){
  const classSet=new Set();
  return {tag,id,hidden:false,value:'',checked:false,disabled:false,
   children:[],dataset:{},listeners:{},textContent:'',innerHTML:'',style:{},
   classList:{
    toggle(key,force){if(force===undefined)force=!classSet.has(key);if(force)classSet.add(key);else classSet.delete(key);return force},
    add(key){classSet.add(key)},remove(key){classSet.delete(key)},contains(key){return classSet.has(key)}
   },
   addEventListener(kind,fn){this.listeners[kind]=fn},
   append(...els){this.children.push(...els)},
   prepend(...els){this.children.unshift(...els)},
   replaceChildren(...els){this.children=[...els]},
   querySelectorAll(selector){return selector==='.choice'||selector==='.slot'?this.children.filter(x=>x.className?.includes(selector.slice(1))):[]},
   querySelector(selector){return selector==='.card:last-child'?get('clubBottom'):null},
   reset(){this.value='';this.checked=false},
   showModal(){this.open=true},close(){this.open=false}
  }
 }
 function get(id){
  if(!nodes.has(id))nodes.set(id,node('div',id));
  return nodes.get(id);
 }
 const navSections=['home','appointments','club','plans','profile'].map(sec=>{const x=node('button');x.dataset.sec=sec;return x});
 const quick=['club','plans'].map(go=>{const x=node('button');x.dataset.go=go;return x});
 const sections=['home','appointments','club','plans','profile'].map(id=>get(id));
 sections.forEach(x=>x.classList.add('section'));
 const doc={
  title:'Original',
  getElementById:get,
  createElement:tag=>node(tag),
  querySelector(query){
   const match=query.match(/^#app nav \[data-sec="([^"]+)"\]$/);
   if(match)return navSections.find(item=>item.dataset.sec===match[1])||null;
   throw Error('Unknown DOM query '+query);
  },
  documentElement:{style:{setProperty(){}}},
  querySelectorAll(query){
   if(query==='#app nav [data-sec]')return navSections;
   if(query==='#app [data-go]')return quick;
   if(query==='#app .section')return sections;
   if(query==='#app nav [data-sec]')return navSections;
   if(query==='[data-tenant-logo]')return [];
   throw Error('Unknown DOM query '+query);
  }
 };
 return {doc,get,navSections,quick};
}
async function scenario({store=null,services=null,employees=[]}={}){
 const dom=createDom(),calls=[],scroller=[];
 const published=store||{
  tenant_id:'tenant-demo',name:'Barbearia Azul',slug:'barbearia-azul',
  template_code:'barbershop',business_type:'Barbearia',
  logo_url:null,primary_color:'#2277AA',background_color:'#050505'
 };
 const catalog=services||[{id:'service-1',item_type:'service',name:'Corte',
  price:30,duration_minutes:45,image_url:null}];
 let bookingCreated=false;
 const sb={
  auth:{getUser:async()=>({data:{user:{id:'customer-test'}},error:null}),signOut:async()=>({error:null})},
  from(table){
   calls.push([table]);
   const chain={
    select(){return chain},eq(){return chain},
    order:async()=>({data:catalog,error:null}),
    maybeSingle:async()=>({data:published,error:null})
   };return chain;
  },
  async rpc(name,args){
   calls.push([name,args]);
   if(name==='saas_barber_public_setup')return {data:{
    opens_at:'09:00',closes_at:'18:00',days_open:[1,2,3,4,5,6],
    timezone:'America/Recife',employees
   },error:null};
   if(name==='saas_barber_available_slots')return {data:{slots:['10:00','10:30']},error:null};
   if(name==='saas_barber_customer_profile')return {data:{name:'Pessoa Teste',phone:'81999999999',email:'cliente@teste.invalid',registered:true},error:null};
   if(name==='saas_barber_customer_history')return {data:bookingCreated?[{service_name:'Corte',code:'LA-1234567890',starts_at:'2026-11-12T13:00:00Z',status:'pending',price:30}]:[],error:null};
   if(name==='saas_barber_request_booking'){bookingCreated=true;return {data:{status:'pending',code:'LA-1234567890'},error:null};}
   throw Error('Unexpected RPC: '+name);
  }
 };
 const context={document:dom.doc,supabase:sb,URL,URLSearchParams,Intl,Number,Date,
  location:{search:'?slug=barbearia-azul',href:'https://example.com/store/barbearia.html'},
  console:{warn(){}},window:{scrollTo(x){scroller.push(x)}}
 };
 vm.runInNewContext(program,context);
 await new Promise(r=>setImmediate(r));
 return {...dom,calls,scroller};
}
test('Original template hydrates tenant brand and published services instead of Adriano hardcodes',async()=>{
 const app=await scenario();
 assert.equal(app.doc.title,'Barbearia Azul | Agendamentos');
 assert.equal(app.get('tenantHeroLabel').textContent,'BARBEARIA AZUL');
 assert.equal(app.get('serviceChoices').children.length,1);
 assert.equal(app.get('serviceChoices').children[0].children[0].textContent,'Corte');
 assert.equal(app.get('serviceChoices').children[0].children[1].textContent,'R$ 30,00');
 assert.equal(app.get('bookBtn').disabled,true);
 assert.equal(app.get('employeeChoices').children[0].textContent,'Atendimento geral');
});
test('Service and slot controls are functional and keep booking pending, not confirmed',async()=>{
 const app=await scenario();
 const service=app.get('serviceChoices').children[0];service.listeners.click();
 await new Promise(r=>setImmediate(r));
 const slot=app.get('slots').children.find(x=>x.textContent==='10:00');
 assert.ok(slot);
 slot.listeners.click();
 assert.equal(app.get('bookBtn').disabled,false);
 await app.get('bookBtn').listeners.click();
 assert.equal(app.get('saasGuestDialog').open,true);
 app.get('saasGuestName').value='Pessoa Teste';
 app.get('saasGuestPhone').value='81999999999';
 app.get('saasGuestConsent').checked=true;
 await app.get('saasGuestForm').listeners.submit({preventDefault(){}});
 assert.equal(app.get('saasGuestDialog').open,false);
 const request=app.calls.find(x=>x[0]==='saas_barber_request_booking');
 assert.equal(request[1].p_service_id,'service-1');
 assert.equal(request[1].p_day,app.get('datePick').value);
 assert.equal(request[1].p_time,'10:00');
 assert.equal(request[1].p_employee_id,null);
 assert.match(app.get('appointmentList').children[0].children[1].textContent,/LA-1234567890/);
 assert.match(app.get('appointmentList').children[0].children[1].textContent,/Em análise/);
});
test('Original navigation remains available, and client contacts are not exposed to public readers',async()=>{
 const app=await scenario();
 app.navSections[2].listeners.click();
 assert.equal(app.get('club').classList.contains('active'),true);
 assert.equal(app.get('home').classList.contains('active'),false);
 assert.match(app.get('appointmentList').children[0].children[1].textContent,/conta de cliente verificada/);
 assert.equal(app.calls.some(x=>x[0]==='saas_barber_requests'),false);
});
