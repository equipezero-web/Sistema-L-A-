import { supabase } from './supabase.js';

// Adapter for the client-side layout of Adriano Paulo Barbearia.
// No original auth, admin or localStorage logic is executed here:
// every view is populated from the current published SaaS tenant.
const get=id=>document.getElementById(id);
const slug=new URLSearchParams(location.search).get('slug');
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
let store=null,setup=null,services=[],currentService=null,employeeId=null,time='',reqSeq=0;

const escapeText=value=>String(value??'');
const moneyValue=value=>money.format(Number(value||0));
function message(text,error=false){
 const n=get('scheduleNotice');n.textContent=text||'';
 n.style.color=error?'#ffa4a4':'var(--gold-light,#e6c976)';
}
function toast(text,error=false){
 const node=get('saasToast');
 node.textContent=text;node.style.color=error?'#ffa4a4':'#f3dc9e';
}
function go(section){
 const target=get(section);
 if(!target||!target.classList.contains('section'))return;
 document.querySelectorAll('#app .section').forEach(s=>s.classList.toggle('active',s===target));
 document.querySelectorAll('#app nav [data-sec]').forEach(b=>b.classList.toggle('active',b.dataset.sec===section));
 window.scrollTo({top:0,behavior:'smooth'});
}
function dateInZone(timeZone){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'})
 .formatToParts(new Date());
 const x=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return x.year+'-'+x.month+'-'+x.day;
}
function plusDays(ymd,offset){
 const d=new Date(ymd+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);
 return d.toISOString().slice(0,10);
}
function applyBrand(){
 document.title=store.name+' | Agendamentos';
 const primary=/^#[a-f0-9]{6}$/i.test(store.primary_color||'')?store.primary_color:'#D4AF37';
 const root=document.documentElement.style;
 root.setProperty('--gold',primary);root.setProperty('--gold-strong',primary);
 root.setProperty('--template-primary',primary);
 // Match a tenant's configured theme without compromising contrast/readability.
 const bg=/^#[a-f0-9]{6}$/i.test(store.background_color||'')?store.background_color:'#030507';
 root.setProperty('--template-background',bg);
 get('tenantHeroLabel').textContent=store.name.toLocaleUpperCase('pt-BR');
 get('tenantInitial').textContent=store.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
 get('topAvatar').textContent=get('tenantInitial').textContent;
 get('hello').textContent='Olá! Bem-vindo à '+store.name;
 const link=get('backToStore');
 link.href='./?slug='+encodeURIComponent(slug)+'&view=catalogo';
 if(store.logo_url){
  try{
   const image=new URL(store.logo_url,location.href);
   if(image.protocol==='https:'){
    document.querySelectorAll('[data-tenant-logo]').forEach(el=>{
     el.src=image.href;el.alt='Logo '+store.name;el.hidden=false;
    });
   }
  }catch{}
 }
}
function renderServices(){
 const grid=get('serviceChoices');grid.replaceChildren();
 if(!services.length){grid.textContent='Nenhum serviço disponível para agendar.';return;}
 services.forEach(service=>{
  const button=document.createElement('button');
  button.type='button';button.className='choice service';
  const label=document.createElement('span');label.textContent=service.name;
  const price=document.createElement('b');price.textContent=moneyValue(service.price);
  const duration=document.createElement('small');duration.textContent=(service.duration_minutes||30)+' min';
  button.append(label,price,duration);
  if(service.image_url){
   try{
    const url=new URL(service.image_url,location.href);
    if(url.protocol==='https:'){
     const img=document.createElement('img');img.src=url.href;img.alt='';
     img.loading='lazy';img.style.cssText='width:54px;height:54px;object-fit:cover;border-radius:10px;margin-right:10px';
     button.prepend(img);
    }
   }catch{}
  }
  button.addEventListener('click',()=>{
   currentService=service;
   grid.querySelectorAll('.choice').forEach(el=>el.classList.toggle('selected',el===button));
   time='';refreshSummary();void renderSlots();
  });
  grid.append(button);
 });
}
function renderEmployees(){
 const grid=get('employeeChoices');grid.replaceChildren();
 const staff=Array.isArray(setup.employees)?setup.employees:[];
 if(!staff.length){
  const pill=document.createElement('div');
  pill.className='choice selected';pill.textContent='Atendimento geral';
  grid.append(pill);employeeId=null;return;
 }
 const hint=document.createElement('p');
 hint.className='muted';hint.textContent='Escolha o profissional desejado.';
 grid.append(hint);
 for(const employee of staff){
  const button=document.createElement('button');button.type='button';button.className='choice';
  button.textContent=employee.name;
  button.addEventListener('click',()=>{
   employeeId=employee.id;
   grid.querySelectorAll('button').forEach(el=>el.classList.toggle('selected',el===button));
   time='';refreshSummary();void renderSlots();
  });
  grid.append(button);
 }
}
function refreshSummary(){
 get('bookingSummary').classList.toggle('hidden',!currentService);
 get('total').textContent=currentService?moneyValue(currentService.price):moneyValue(0);
 get('durationTotal').textContent=currentService?currentService.duration_minutes+' minutos':'Duração estimada';
 get('bookBtn').disabled=!currentService||!get('datePick').value||!time||
   ((setup?.employees||[]).length>0&&!employeeId);
}
async function renderSlots(){
 const seq=++reqSeq;
 time='';refreshSummary();
 const box=get('slots');box.replaceChildren();
 const day=get('datePick').value;
 if(!currentService||!day){
  box.textContent='Selecione um serviço e uma data para ver os horários.';
  return;
 }
 if((setup?.employees||[]).length&&!employeeId){
  box.textContent='Escolha o profissional para consultar horários.';
  return;
 }
 message('Consultando disponibilidade...');
 try{
  const {data,error}=await supabase.rpc('saas_barber_available_slots',{
   p_slug:slug,p_service_id:currentService.id,p_day:day,p_employee_id:employeeId
  });
  if(error)throw error;
  if(seq!==reqSeq)return;
  const free=Array.isArray(data?.slots)?data.slots:[];
  if(!free.length){box.textContent='Nenhum horário disponível nesta data.';message('Selecione outra data.');return}
  for(const slot of free){
   const b=document.createElement('button');b.type='button';b.className='slot';
   b.textContent=slot;
   b.addEventListener('click',()=>{
    time=slot;box.querySelectorAll('.slot').forEach(el=>el.classList.toggle('selected',el===b));
    message(slot+' selecionado. Solicite seu horário para análise da barbearia.');
    refreshSummary();
   });
   box.append(b);
  }
  message(free.length+' horário(s) livre(s). A solicitação depende de confirmação.');
 }catch(e){
  if(seq!==reqSeq)return;
  box.textContent='Não foi possível consultar a agenda. Atualize a página.';
  message('Horários indisponíveis: '+(e.message||'Tente novamente.'),true);
 }
}
function renderInfo(){
 const grid=get('shopInfoCards');grid.replaceChildren();
 const card=(title,body)=>{
  const article=document.createElement('article');article.className='card';
  const h=document.createElement('h3');h.textContent=title;
  const p=document.createElement('p');p.className='muted';p.textContent=body;
  article.append(h,p);grid.append(article);
 };
 card(store.name, 'Conheça nossos serviços, preços e horários disponíveis. Solicitações sujeitas à confirmação.');
 const dayNames=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
 const openDays=(setup.days_open||[]).map(n=>dayNames[n-1]).filter(Boolean).join(', ');
 const hours=setup.opens_at+' às '+setup.closes_at;
 card('Funcionamento',openDays+' · '+hours+' · '+setup.timezone);
 const label=get('bookingHoursLabel');
 label.textContent=openDays+' · '+hours+'. Escolha uma data nos próximos 30 dias.';
 const club=get('club');
 const foot=club?.querySelector('.card:last-child');
 if(foot)foot.replaceChildren();
 if(foot){
  const h=document.createElement('h3');h.textContent='Horários de funcionamento';
  const p=document.createElement('p');p.textContent=openDays+' · '+hours;
  const note=document.createElement('p');note.className='muted';
  note.textContent='Agendamento mediante disponibilidade e aprovação.';
  foot.append(h,p,note);
 }
 get('clientShopGallery').textContent='As fotos do ambiente serão exibidas quando a barbearia cadastrá-las.';
}
function renderPlans(){
 const plans=get('planGrid');plans.replaceChildren();
 const card=document.createElement('div');card.className='card';
 const h=document.createElement('h3');h.textContent='Planos da barbearia';
 const p=document.createElement('p');p.className='muted';
 p.textContent='Não há planos de assinatura publicados nesta empresa no momento. Consulte a barbearia sobre planos e benefícios.';
 card.append(h,p);plans.append(card);
}
function renderHistory(code){
 const area=get('appointmentList');area.replaceChildren();
 const card=document.createElement('article');card.className='card';
 const title=document.createElement('h3');
 title.textContent=code?'Solicitação registrada: '+code:'Seus agendamentos';
 const text=document.createElement('p');text.className='muted';
 text.textContent=code?
  'Pedido recebido e aguardando confirmação pela barbearia. Guarde este código e aguarde contato pelo telefone informado.':
  'A consulta privada do histórico exige uma conta de cliente verificada. Você pode solicitar um horário na página Início, sem precisar criar uma conta.';
 const note=document.createElement('small');note.className='muted';
 note.textContent='Esta página não mostra dados de outros clientes.';
 card.append(title,text,note);area.append(card);
}
async function init(){
 if(!slug||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
  throw new Error('Link da barbearia inválido.');
 const shop=await supabase.from('saas_public_stores')
  .select('tenant_id,name,slug,template_code,business_type,logo_url,primary_color,background_color')
  .eq('slug',slug).maybeSingle();
 if(shop.error)throw shop.error;
 if(!shop.data||shop.data.template_code!=='barbershop')
  throw new Error('Esta barbearia não está publicada ou não foi encontrada.');
 store=shop.data;applyBrand();
 const [a,b]=await Promise.all([
  supabase.rpc('saas_barber_public_setup',{p_slug:slug}),
  supabase.from('saas_public_catalog_items')
    .select('id,item_type,name,price,duration_minutes,image_url')
    .eq('tenant_id',store.tenant_id).eq('item_type','service').order('name')
 ]);
 if(a.error)throw a.error;if(b.error)throw b.error;
 if(!a.data)throw new Error('A barbearia ainda não habilitou os agendamentos.');
 setup=a.data;services=b.data||[];
 const zone=setup.timezone||'America/Recife';
 const today=dateInZone(zone);
 get('datePick').min=today;get('datePick').max=plusDays(today,30);
 get('datePick').value=today;
 renderServices();renderEmployees();renderInfo();renderPlans();renderHistory(null);
 refreshSummary();await renderSlots();
 toast('Seja bem-vindo à '+store.name);
}

document.querySelectorAll('#app nav [data-sec]').forEach(button=>{
 button.addEventListener('click',()=>go(button.dataset.sec));
});
document.querySelectorAll('#app [data-go]').forEach(button=>{
 button.addEventListener('click',()=>go(button.dataset.go));
});
get('datePick').addEventListener('change',()=>{void renderSlots()});
get('bookBtn').addEventListener('click',()=>{
 if(!currentService||!time||!get('datePick').value)return;
 get('saasGuestDialog').showModal();
});
get('saasGuestCancel').addEventListener('click',()=>get('saasGuestDialog').close());
get('saasGuestForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const name=get('saasGuestName').value.trim();
 const phone=get('saasGuestPhone').value.replace(/\D/g,'');
 const err=get('saasGuestStatus');
 if(name.length<2||name.length>80||phone.length<10||phone.length>13||
    !get('saasGuestConsent').checked){
   err.textContent='Preencha seus dados e autorize o contato da barbearia.';return;
 }
 if(!currentService||!time||!get('datePick').value)return;
 const b=get('saasGuestSend');b.disabled=true;err.textContent='Enviando pedido...';
 try{
  const {data,error}=await supabase.rpc('saas_barber_request_booking',{
   p_slug:slug,p_service_id:currentService.id,
   p_day:get('datePick').value,p_time:time,p_employee_id:employeeId,
   p_guest_name:name,p_guest_phone:phone
  });
  if(error)throw error;
  if(data?.status!=='pending'||!data?.code)throw new Error('O servidor não confirmou a solicitação.');
  get('saasGuestDialog').close();get('saasGuestForm').reset();err.textContent='';
  renderHistory(data.code);go('appointments');
  toast('Pedido '+data.code+' enviado. Aguarde a confirmação da barbearia.');
  time='';refreshSummary();void renderSlots();
 }catch(e){err.textContent=e.message||'Não foi possível solicitar o horário.'}
 finally{b.disabled=false}
});
void init().catch(error=>{
 message('Não foi possível abrir os agendamentos: '+(error.message||'Erro ao carregar.'),true);
 get('serviceChoices').textContent='Barbearia temporariamente indisponível.';
 get('bookBtn').disabled=true;
 toast('Não foi possível carregar esta barbearia.',true);
});
