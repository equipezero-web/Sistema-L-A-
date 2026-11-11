import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const migration=readFileSync('supabase/sql/saas_barber_public_requests_62.sql','utf8');
const store=readFileSync('store/index.html','utf8');
const publicHtml=readFileSync('store/reservar.html','utf8');
const js=readFileSync('assets/js/public-barber-booking.js','utf8');
const agendaJs=readFileSync('assets/js/agenda.js','utf8');
const agendaHtml=readFileSync('app/agenda.html','utf8');
const strip=src=>src.replace(/^import\s*\{[^}]+\}\s*from\s*'[^']+';\s*/gm,'');
const compiled=strip(js);

test('Public barbershop and staff modules parse without browser runtime',()=>{
 assert.doesNotThrow(()=>new vm.Script(compiled));
 assert.doesNotThrow(()=>new vm.Script(strip(agendaJs)));
});
test('Public storefront shows booking CTA only for barbershop template',()=>{
 assert.match(store,/model==='barbershop'/);
 assert.match(store,/id="bookingLink"/);
 assert.match(store,/\.\/reservar\.html\?slug=/);
 assert.match(publicHtml,/id="bookingForm"/);
 assert.match(publicHtml,/id="consent"/);
});
test('Request creation is restricted to verified published store with server-side slot and rate limits',()=>{
 assert.match(migration,/private\.saas_public_store_visible\(s\.tenant_id\)/);
 assert.match(migration,/p_slug=p_slug and s\.template_code='barbershop'/);
 assert.match(migration,/public\.saas_barber_available_slots\(p_slug,p_service_id,p_day,p_employee_id\)/);
 assert.match(migration,/pg_advisory_xact_lock/);
 assert.match(migration,/2 minutes/);
 assert.match(migration,/24 hours/);
 assert.match(migration,/v_service\.price/);
 assert.match(migration,/status','pending'/);
 assert.doesNotMatch(js,/localStorage|service_role|MP_ACCESS_TOKEN/);
});
test('Phone numbers are never available through public RLS or public setup',()=>{
 assert.match(migration,/alter table public\.saas_barber_requests enable row level security/);
 assert.match(migration,/revoke all on public\.saas_barber_requests from public,anon,authenticated/);
 assert.match(migration,/grant select on public\.saas_barber_requests to authenticated/);
 assert.match(migration,/saas_barber_requests_managers_read/);
 assert.doesNotMatch(migration,/grant select on public\.saas_barber_requests to anon/);
 assert.match(migration,/guest_phone text not null/);
 assert.doesNotMatch(js,/from\('saas_barber_requests'\)/);
});
test('Manager must explicitly accept a pending booking before operational appointment exists',()=>{
 assert.match(migration,/create or replace function public\.saas_barber_decide_request/);
 assert.match(migration,/not public\.saas_has_tenant_role\(v_request\.tenant_id/);
 assert.match(migration,/update public\.saas_barber_requests set status='accepted'/);
 assert.match(migration,/insert into public\.saas_appointments\(/);
 assert.match(migration,/booking_origin/);
 assert.match(migration,/status='rejected'/);
 assert.match(agendaJs,/saas_barber_decide_request/);
 assert.match(agendaJs,/saas_complete_appointment/);
});
test('All appointment origins are checked for conflict, including direct staff appointments',()=>{
 assert.match(migration,/create trigger saas_barber_appointment_conflict_guard/);
 assert.match(migration,/before insert or update of starts_at,ends_at,employee_id,status/);
 assert.match(migration,/r\.status='pending' and r\.expires_at>now\(\)/);
 assert.match(migration,/a\.status not in \('cancelled','no_show'\)/);
 assert.match(migration,/v_cursor:=v_cursor\+make_interval/);
 assert.match(migration,/v_closing:=p_day\+v_hours\.closes_at/);
});
test('Business hours are private tenant-specific settings that owner/admin can edit',()=>{
 assert.match(migration,/create table public\.saas_barber_hours/);
 assert.match(migration,/tenant_id uuid primary key references public\.saas_tenants\(id\)/);
 assert.match(migration,/saas_barber_hours_owner_update/);
 assert.match(migration,/grant select,insert,update on public\.saas_barber_hours to authenticated/);
 assert.match(agendaHtml,/id="hoursForm"/);
 assert.match(agendaHtml,/id="requestRows"/);
});

async function customerScenario({employees=[],slots=['09:00','09:30'],createError=null,setup=null}={}){
 const nodes=new Map(),calls=[];
 function elem(tag='div',id=''){
  const item={
   tag,id,value:'',hidden:true,disabled:false,checked:false,required:false,
   textContent:'',innerHTML:'',children:[],listeners:{},style:{},dataset:{},
   addEventListener(type,callback){this.listeners[type]=callback},
   append(...children){this.children.push(...children)},
   replaceChildren(...children){this.children=[...children]},
   setAttribute(k,v){this[k]=v},
   querySelectorAll(selector){return selector==='button'?this.children.filter(x=>x.tag==='button'):[]},
   reset(){this.resetCalled=true}
  };
  return item;
 }
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,elem('div',id));
  return nodes.get(id);
 };
 const shop={tenant_id:'tenant',name:'Lapis Servidor',business_type:'Barbearia',
  template_code:'barbershop',primary_color:'#D4AF37'};
 const sb={
  from(name){
   calls.push(['from',name]);
   const chain={select(){return chain},eq(){return chain},order:async()=>({
    data:[{id:'service-uuid',item_type:'service',name:'Corte',price:30,duration_minutes:45}],
    error:null
   }),maybeSingle:async()=>({data:shop,error:null})};
   return chain;
  },
  async rpc(name,args){
   calls.push(['rpc',name,args]);
   if(name==='saas_barber_public_setup')return {data:setup||{
    timezone:'America/Recife',opens_at:'09:00',closes_at:'18:00',
    employees,days_open:[1,2,3,4,5,6],step_minutes:30
   },error:null};
   if(name==='saas_barber_available_slots')return {data:{slots,timezone:'America/Recife'},error:null};
   if(name==='saas_barber_request_booking')return createError?
    {data:null,error:{message:createError}}:
    {data:{ok:true,status:'pending',code:'LA-TEST000001'},error:null};
   throw Error('unknown rpc '+name);
  }
 };
 const location={search:'?slug=lapis-servidor',href:'https://equipezero-web.github.io/Sistema-L-A-/store/reservar.html'};
 const ctx={document:{getElementById:get,createElement:tag=>elem(tag),
   title:'Agendamento',documentElement:{style:{setProperty(){}}}},location,
   supabase:sb,Intl,URL,URLSearchParams,Date,Number,console:{warn(){}}
 };
 vm.runInNewContext(compiled,ctx,{filename:'public-barber-booking.js'});
 await new Promise(resolve=>setImmediate(resolve));
 return {get,calls,async selectTime(time='09:00'){
   get('service').value='service-uuid';
   await get('service').listeners.change();
   const slot=get('slots').children.find(el=>el.textContent===time);
   assert.ok(slot,'Expected free slot '+time);
   slot.listeners.click();
 },async submit(){
   const e={preventDefault(){}};
   await get('bookingForm').listeners.submit(e);
 }};
}
test('Guest with no staff can select general service and submit a pending request',async()=>{
 const client=await customerScenario();
 assert.equal(client.get('bookingForm').hidden,false);
 assert.equal(client.get('employee').required,false);
 await client.selectTime();
 client.get('guestName').value='Cliente de Teste';
 client.get('guestPhone').value='81999999999';
 client.get('consent').checked=true;
 await client.submit();
 assert.equal(client.get('success').hidden,false);
 assert.match(client.get('success').children[0].textContent,/LA-TEST000001/);
 const booking=client.calls.find(x=>x[1]==='saas_barber_request_booking');
 assert.equal(booking[2].p_employee_id,null);
 assert.equal(booking[2].p_service_id,'service-uuid');
});
test('Guest cannot submit without explicit contact consent',async()=>{
 const client=await customerScenario();
 await client.selectTime();
 client.get('guestName').value='Cliente de Teste';
 client.get('guestPhone').value='81999999999';
 await client.submit();
 assert.match(client.get('notice').textContent,/autorização de contato/);
 assert.equal(client.calls.some(x=>x[1]==='saas_barber_request_booking'),false);
});
test('Guest receives clear error on server booking conflict without false confirmation',async()=>{
 const client=await customerScenario({createError:'Horário indisponível'});
 await client.selectTime();
 client.get('guestName').value='Cliente de Teste';
 client.get('guestPhone').value='81999999999';
 client.get('consent').checked=true;
 await client.submit();
 assert.match(client.get('notice').textContent,/Horário indisponível/);
 assert.equal(client.get('success').hidden,true);
});
test('When staff members exist, client must select a professional',async()=>{
 const client=await customerScenario({employees:[{id:'emp-1',name:'Profissional A'}]});
 assert.equal(client.get('employee').required,true);
 assert.equal(client.get('employee').children.length,2);
});
