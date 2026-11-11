import { supabase } from './supabase.js';

const get = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const slug = params.get('slug');
const currency = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
let store = null;
let setup = null;
let services = [];
let selectedTime = '';
let availabilitySequence = 0;

function message(text,error=false) {
 const node=get('notice');
 node.textContent=text;
 node.className='booking-status'+(error?' error':'');
}
function zoneDate(date,timeZone) {
 const parts = new Intl.DateTimeFormat('en-GB',{
  timeZone,year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(date);
 const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return v.year+'-'+v.month+'-'+v.day;
}
function plusDays(ymd,days) {
 const day = new Date(ymd+'T12:00:00Z');
 day.setUTCDate(day.getUTCDate()+days);
 return day.toISOString().slice(0,10);
}
function option(value,label) {
 const element=document.createElement('option');
 element.value=value;
 element.textContent=label;
 return element;
}
function currentService() {return services.find(item=>item.id===get('service').value);}
function currentEmployee() {
 return (setup?.employees||[]).find(item=>item.id===get('employee').value);
}
function updateSummary() {
 const svc=currentService();
 get('sumService').textContent=svc?.name||'—';
 get('sumEmployee').textContent=currentEmployee()?.name||((setup?.employees||[]).length?'—':'Atendimento geral');
 get('sumDate').textContent=get('day').value?get('day').value.split('-').reverse().join('/'):'—';
 get('sumTime').textContent=selectedTime||'—';
 get('sumDuration').textContent=svc?.duration_minutes?svc.duration_minutes+' min':'—';
 get('sumPrice').textContent=svc?currency.format(Number(svc.price||0)):'—';
}
async function refreshSlots() {
 const serial=++availabilitySequence;
 const service=currentService(),day=get('day').value;
 selectedTime='';
 get('selectedTime').value='';
 get('slots').replaceChildren();
 updateSummary();
 if(!service||!day) {
  message('Escolha um serviço e uma data para consultar horários.');
  return;
 }
 if((setup?.employees||[]).length && !currentEmployee()) {
  message('Selecione o profissional para consultar horários.');
  return;
 }
 message('Consultando horários disponíveis...');
 try {
  const {data,error}=await supabase.rpc('saas_barber_available_slots',{
    p_slug:slug,p_service_id:service.id,p_day:day,
    p_employee_id:currentEmployee()?.id||null
  });
  if(error)throw error;
  if(serial!==availabilitySequence)return;
  const slots=Array.isArray(data?.slots)?data.slots:[];
  if(!slots.length){
    message('Nenhum horário disponível neste dia. Escolha outra data.');
    return;
  }
  for(const time of slots) {
    const button=document.createElement('button');
    button.type='button';button.className='slot';
    button.textContent=time;button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{
      selectedTime=time;
      get('selectedTime').value=time;
      for(const sibling of get('slots').querySelectorAll('button'))
       sibling.setAttribute('aria-pressed',sibling===button?'true':'false');
      updateSummary();
      message('Horário '+time+' selecionado. Complete seus dados para solicitar.');
    });
    get('slots').append(button);
  }
  message('Selecione um dos horários disponíveis.');
 }catch(e){
  if(serial!==availabilitySequence)return;
  message('Não foi possível consultar os horários. Atualize a página e tente novamente.',true);
  console.warn('Horários indisponíveis:',e);
 }
}
async function load() {
 try {
  if(!slug||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){
   throw new Error('Link de barbearia inválido.');
  }
  get('backStore').href='./?slug='+encodeURIComponent(slug);
  const {data:shop,error:shopError}=await supabase
    .from('saas_public_stores')
    .select('tenant_id,name,business_type,template_code,logo_url,primary_color')
    .eq('slug',slug).maybeSingle();
  if(shopError)throw shopError;
  if(!shop||shop.template_code!=='barbershop') {
   throw new Error('Esta página só está disponível para barbearias publicadas.');
  }
  store=shop;
  get('shopName').textContent=shop.name;
  document.title='Agendar | '+shop.name;
  get('shopType').textContent=shop.business_type||'Barbearia';
  if(/^#[0-9a-f]{6}$/i.test(shop.primary_color||'')){
   document.documentElement.style.setProperty('--booking-gold',shop.primary_color);
  }
  if(shop.logo_url){
    try{
     const src=new URL(shop.logo_url,location.href);
     if(src.protocol==='https:'){get('shopLogo').src=src.href;get('shopLogo').hidden=false;}
    }catch{}
  }
  const [setupResult,catalogResult]=await Promise.all([
   supabase.rpc('saas_barber_public_setup',{p_slug:slug}),
   supabase.from('saas_public_catalog_items')
     .select('id,item_type,name,price,duration_minutes')
     .eq('tenant_id',shop.tenant_id).eq('item_type','service').order('name')
  ]);
  if(setupResult.error)throw setupResult.error;
  if(catalogResult.error)throw catalogResult.error;
  setup=setupResult.data;
  if(!setup)throw new Error('A barbearia ainda não habilitou os agendamentos online.');
  services=catalogResult.data||[];
  if(!services.length)throw new Error('Nenhum serviço publicado para agendamento.');
  for(const item of services){
   get('service').append(option(item.id,
      item.name+' — '+currency.format(Number(item.price||0))+
      (item.duration_minutes?' · '+item.duration_minutes+' min':'')));
  }
  const staff=Array.isArray(setup.employees)?setup.employees:[];
  get('employee').replaceChildren();
  if(staff.length){
   get('employee').append(option('','Selecione o profissional'));
   for(const person of staff)get('employee').append(option(person.id,person.name));
   get('employee').required=true;
  } else {
   get('employee').append(option('','Atendimento geral'));
   get('employee').required=false;
  }
  get('openingHours').textContent='Funcionamento: '+setup.opens_at+' às '+setup.closes_at+
    ' · Horários em '+setup.timezone.replace('America/','')+
    ' · Solicitações sujeitas à confirmação.';
  const today=zoneDate(new Date(),setup.timezone);
  get('day').min=today;get('day').max=plusDays(today,30);
  get('day').value=today;
  get('bookingForm').hidden=false;
  updateSummary();
  await refreshSlots();
 }catch(e){
  get('bookingForm').hidden=true;
  get('shopName').textContent=store?.name||'Agendamento indisponível';
  message(e.message||'Não foi possível carregar a barbearia.',true);
 }
}
get('service').addEventListener('change',refreshSlots);
get('employee').addEventListener('change',refreshSlots);
get('day').addEventListener('change',refreshSlots);
get('bookingForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const service=currentService();
 const phone=get('guestPhone').value.replace(/[^0-9]/g,'');
 const name=get('guestName').value.trim();
 if(!service||!get('day').value||!selectedTime){
  message('Selecione serviço, data e um horário disponível.',true);return;
 }
 if((setup?.employees||[]).length&&!currentEmployee()){
  message('Selecione o profissional desejado.',true);return;
 }
 if(name.length<2||name.length>80||phone.length<10||phone.length>13||!get('consent').checked){
  message('Informe nome, telefone e confirme a autorização de contato.',true);return;
 }
 const button=get('send');
 button.disabled=true;
 message('Enviando solicitação para a barbearia...');
 try {
  const {data,error}=await supabase.rpc('saas_barber_request_booking',{
   p_slug:slug,p_service_id:service.id,p_day:get('day').value,
   p_time:selectedTime,p_employee_id:currentEmployee()?.id||null,
   p_guest_name:name,p_guest_phone:phone
  });
  if(error)throw error;
  if(!data?.ok||data?.status!=='pending'||!data?.code){
   throw new Error('O servidor não confirmou o recebimento da solicitação.');
  }
  get('success').hidden=false;
  get('success').replaceChildren();
  const strong=document.createElement('strong');
  strong.textContent='Solicitação recebida — '+data.code;
  const detail=document.createElement('p');
  detail.textContent='Guarde este código. O agendamento ainda está pendente de análise. A barbearia poderá entrar em contato pelo telefone informado.';
  get('success').append(strong,detail);
  get('bookingForm').reset();
  selectedTime='';get('selectedTime').value='';
  updateSummary();
  message('Solicitação registrada. Aguarde o contato da empresa.');
  await refreshSlots();
  message('Solicitação registrada. Aguarde a confirmação da empresa.');
 }catch(e){
  message(e.message||'Não foi possível registrar a solicitação. Tente novamente.',true);
 }finally{button.disabled=false}
});
void load();