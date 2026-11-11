import {supabase} from './supabase.js';
import {getBusinessContext,listCustomers,listServices,listEmployees} from './business.js';

const get=id=>document.getElementById(id);
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let context=null,customers=[],services=[],employees=[],appointments=[];
function message(text,error=false,id='status'){
 const node=get(id);if(!node)return;
 node.textContent=text;node.className='status show '+(error?'error':'ok');
}
function localDate(value){
 const d=new Date(value);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function fillSelect(id,items,emptyLabel){
 const el=get(id);
 el.replaceChildren();
 const blank=document.createElement('option');blank.value='';blank.textContent=emptyLabel;el.append(blank);
 for(const item of items){
  const opt=document.createElement('option');
  opt.value=item.id;opt.textContent=item.name;el.append(opt);
 }
}
async function load(){
 context=await getBusinessContext();
 if(!['owner','admin','employee'].includes(context.membership.role)){
  get('newBtn').disabled=true;
  get('newBtn').classList.add('hidden');
 }
 [customers,services,employees]=await Promise.all([
  listCustomers(context.tenant.id),listServices(context.tenant.id),listEmployees(context.tenant.id)
 ]);
 fillSelect('customer',customers.filter(x=>x.status==='active'),'Sem cliente');
 fillSelect('service',services.filter(x=>x.status==='active'),'Sem serviço');
 fillSelect('employee',employees.filter(x=>x.status==='active'),'Atendimento geral');
 if(context.tenant.template_code==='barbershop'&&context.canManage){
  get('barberAdmin').classList.remove('hidden');
  get('publicBookingLink').href=new URL('../../store/reservar.html?slug='+
    encodeURIComponent(context.tenant.slug),import.meta.url).href;
  await Promise.all([loadBookingHours(),loadRequests()]);
 }
 await render();
}
async function render(){
 const {data,error}=await supabase.from('saas_appointments')
  .select('*,saas_customers(name),saas_services(name),saas_employees(name)')
  .eq('tenant_id',context.tenant.id).order('starts_at',{ascending:false});
 if(error)throw error;
 appointments=data||[];
 drawAgenda();
}
function drawAgenda(){
 const query=get('agendaSearch').value.trim().toLocaleLowerCase('pt-BR');
 const status=get('agendaStatus').value;
 const day=get('agendaDate').value;
 const visible=appointments.filter(item=>{
  const matchesStatus=status==='all'||item.status===status;
  const matchesDay=!day||localDate(item.starts_at)===day;
  const text=[item.guest_name,item.guest_phone,item.saas_customers?.name,
     item.saas_services?.name,item.saas_employees?.name]
     .filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
  return matchesStatus&&matchesDay&&(!query||text.includes(query));
 });
 get('agendaCount').textContent='Exibindo '+visible.length+' de '+appointments.length+' agendamentos';
 get('rows').innerHTML=visible.map(item=>{
  const customer=item.guest_name||item.saas_customers?.name||'—';
  const phone=context.canManage&&item.guest_phone?' · '+item.guest_phone:'';
  const editable=context.canManage&&!['completed','cancelled','no_show'].includes(item.status);
  return '<tr><td>'+escapeHtml(new Date(item.starts_at).toLocaleString('pt-BR'))+'</td>'+
   '<td>'+escapeHtml(customer+phone)+'</td>'+
   '<td>'+escapeHtml(item.saas_services?.name||'—')+'</td>'+
   '<td>'+escapeHtml(item.saas_employees?.name||'Geral')+'</td>'+
   '<td>'+escapeHtml(money(item.price))+'</td>'+
   '<td>'+escapeHtml(item.status)+'</td><td>'+
   (editable?'<button class="btn complete" data-id="'+escapeHtml(item.id)+'">Concluir</button> '+
    '<button class="btn cancel" data-id="'+escapeHtml(item.id)+'">Cancelar</button>':'')+
   '</td></tr>';
 }).join('')||'<tr><td colspan="7">Nenhum agendamento.</td></tr>';
 for(const button of document.querySelectorAll('.complete')){
  button.addEventListener('click',async()=>{
   if(!context?.canManage)return message('Acesso não autorizado.',true);
   button.disabled=true;
   try{
    const {error}=await supabase.rpc('saas_complete_appointment',{p_appointment_id:button.dataset.id});
    if(error)throw error;
    message('Atendimento concluído. O financeiro foi atualizado quando aplicável.');
    await render();
   }catch(e){message(e.message,true)}finally{button.disabled=false}
  });
 }
 for(const button of document.querySelectorAll('.cancel')){
  button.addEventListener('click',async()=>{
   if(!context?.canManage||!confirm('Cancelar este agendamento?'))return;
   button.disabled=true;
   try{
    const {error}=await supabase.from('saas_appointments').update({status:'cancelled'})
      .eq('tenant_id',context.tenant.id).eq('id',button.dataset.id);
    if(error)throw error;
    message('Agendamento cancelado.');await render();
   }catch(e){message(e.message,true)}finally{button.disabled=false}
  });
 }
}
async function loadRequests(){
 const {data,error}=await supabase.from('saas_barber_requests')
  .select('id,guest_name,guest_phone,starts_at,expires_at,status,created_at,saas_services(name),saas_employees(name)')
  .eq('tenant_id',context.tenant.id).order('created_at',{ascending:false}).limit(100);
 if(error)throw error;
 const rows=data||[];
 get('requestRows').innerHTML=rows.map(item=>{
  const expired=item.status==='pending'&&new Date(item.expires_at)<=new Date();
  const current=expired?'Expirado':item.status==='pending'?'Aguardando':item.status==='accepted'?'Confirmado':'Recusado';
  return '<tr><td>'+escapeHtml(new Date(item.starts_at).toLocaleString('pt-BR'))+'</td>'+
   '<td>'+escapeHtml(item.guest_name)+'</td>'+
   '<td>'+escapeHtml(item.guest_phone)+'</td>'+
   '<td>'+escapeHtml(item.saas_services?.name||'—')+'</td>'+
   '<td>'+escapeHtml(item.saas_employees?.name||'Geral')+'</td>'+
   '<td>'+escapeHtml(current)+'</td><td>'+
   (item.status==='pending'&&!expired?
    '<button class="btn decide" data-action="accept" data-id="'+escapeHtml(item.id)+'">Confirmar</button> ':'')+
   (item.status==='pending'?
    '<button class="btn decide" data-action="reject" data-id="'+escapeHtml(item.id)+'">Recusar</button>':'')+
   '</td></tr>';
 }).join('')||'<tr><td colspan="7">Nenhuma solicitação online.</td></tr>';
 for(const button of get('requestRows').querySelectorAll('button.decide')){
  button.addEventListener('click',async()=>{
   if(!context?.canManage)return;
   const action=button.dataset.action;
   if(!confirm(action==='accept'?'Confirmar este horário para o cliente?':'Recusar esta solicitação?'))return;
   button.disabled=true;
   try{
    const {data,error}=await supabase.rpc('saas_barber_decide_request',{
      p_request_id:button.dataset.id,p_decision:action
    });
    if(error)throw error;
    if(!data?.ok)throw new Error('O servidor não confirmou a decisão.');
    message(action==='accept'?'Atendimento confirmado na agenda. Avise o cliente pelo telefone informado.':
      'Solicitação recusada.','', 'requestStatus');
    await Promise.all([loadRequests(),render()]);
   }catch(e){message(e.message,true,'requestStatus')}
   finally{button.disabled=false}
  });
 }
}
async function loadBookingHours(){
 const {data,error}=await supabase.from('saas_barber_hours').select('*')
  .eq('tenant_id',context.tenant.id).maybeSingle();
 if(error)throw error;
 if(!data)return;
 get('opensAt').value=data.opens_at.slice(0,5);
 get('closesAt').value=data.closes_at.slice(0,5);
 get('slotStep').value=String(data.step_minutes);
 get('hoursTimezone').value=data.timezone;
 get('acceptOnline').checked=data.accepting_bookings;
 for(const check of get('openDays').querySelectorAll('input.dayCheck')){
  check.checked=data.days_open.includes(Number(check.value));
 }
}
get('hoursForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!context?.canManage)return message('Somente o gestor pode alterar horários.',true,'requestStatus');
 const values={
  tenant_id:context.tenant.id,
  opens_at:get('opensAt').value,closes_at:get('closesAt').value,
  timezone:get('hoursTimezone').value,step_minutes:Number(get('slotStep').value),
  days_open:[...get('openDays').querySelectorAll('input.dayCheck:checked')]
    .map(input=>Number(input.value)),
  accepting_bookings:get('acceptOnline').checked
 };
 if(values.days_open.length===0||values.opens_at>=values.closes_at){
  message('Escolha ao menos um dia e um intervalo de funcionamento válido.',true,'requestStatus');
  return;
 }
 get('saveHours').disabled=true;
 try{
  const {error}=await supabase.from('saas_barber_hours').upsert(values,{onConflict:'tenant_id'});
  if(error)throw error;
  message('Horários de funcionamento salvos.','', 'requestStatus');
 }catch(e){message(e.message,true,'requestStatus')}
 finally{get('saveHours').disabled=false}
});
get('agendaSearch').addEventListener('input',drawAgenda);
get('agendaStatus').addEventListener('change',drawAgenda);
get('agendaDate').addEventListener('change',drawAgenda);
get('agendaClear').addEventListener('click',()=>{
 get('agendaSearch').value='';get('agendaStatus').value='all';
 get('agendaDate').value='';drawAgenda();
});
get('newBtn').addEventListener('click',()=>{
 if(!['owner','admin','employee'].includes(context?.membership?.role))
  return message('Seu perfil não pode criar agendamentos.',true);
 get('formBox').classList.toggle('hidden');
});
get('service').addEventListener('change',()=>{
 const service=services.find(item=>item.id===get('service').value);
 if(service)get('price').value=service.price;
});
get('form').addEventListener('submit',async event=>{
 event.preventDefault();
 try{
  if(!['owner','admin','employee'].includes(context?.membership?.role))
    throw new Error('Acesso não autorizado.');
  const start=new Date(get('starts').value);
  const end=new Date(get('ends').value);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)
    throw new Error('O horário de término deve ser posterior ao início.');
  const record={
   tenant_id:context.tenant.id,
   customer_id:get('customer').value||null,
   service_id:get('service').value||null,
   employee_id:get('employee').value||null,
   starts_at:start.toISOString(),
   ends_at:end.toISOString(),
   price:Number(get('price').value||0),
   notes:get('notes').value.trim()||null,
   status:'pending'
  };
  const {error}=await supabase.from('saas_appointments').insert(record);
  if(error)throw error;
  message('Agendamento criado.');get('form').reset();
  get('formBox').classList.add('hidden');await render();
 }catch(e){message(e.message,true)}
});
void load().catch(e=>message(e.message||'Não foi possível carregar a agenda.',true));
