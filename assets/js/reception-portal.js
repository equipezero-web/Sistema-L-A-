import {supabase} from './supabase.js';
const get=id=>document.getElementById(id);
const slug=new URLSearchParams(location.search).get('slug');
let tenantId=null,loggedIn=false,busy=false;
function message(text,error=false){
 const n=get('status');n.textContent=text;n.className='status'+(error?' error':'');
}
function safeImage(url){
 try{const u=new URL(url,location.href);return u.protocol==='https:'?u.href:null}catch{return null}
}
function internalEmail(username){
 return 'r.'+tenantId.replaceAll('-','')+'.'+username+'@accounts.example.invalid';
}
function showDashboard(enabled){
 loggedIn=enabled;
 get('login').hidden=enabled;get('dashboard').hidden=!enabled;
 get('refresh').hidden=!enabled;get('logout').hidden=!enabled;
}
function cell(text){
 const td=document.createElement('td');td.textContent=String(text??'—');return td;
}
function button(label,handler){
 const btn=document.createElement('button');btn.type='button';btn.textContent=label;
 btn.addEventListener('click',async()=>{
  btn.disabled=true;try{await handler()}catch(e){message(e.message||'Ação indisponível.',true)}
  finally{btn.disabled=false}
 });return btn;
}
function formatDate(value){
 return value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
}
function renderRequests(requests){
 const target=get('requestRows');target.replaceChildren();
 if(!requests.length){
  const tr=document.createElement('tr'),td=cell('Nenhuma solicitação recente.');
  td.colSpan=5;tr.append(td);target.append(tr);return;
 }
 for(const req of requests){
  const tr=document.createElement('tr');
  tr.append(cell(formatDate(req.starts_at)),
   cell(req.guest_name+' · '+req.guest_phone),cell(req.service||'—'),cell(
    req.status==='pending'?'Aguardando':req.status==='accepted'?'Confirmado':'Recusado'
   ));
  const actions=document.createElement('td');
  if(req.status==='pending'){
   const expires=new Date(req.expires_at).getTime()<=Date.now();
   if(!expires){
    actions.append(
     button('Confirmar',async()=>{
      if(!confirm('Confirmar este agendamento? O cliente deverá ser avisado pelo telefone informado.'))return;
      const {error}=await supabase.rpc('saas_barber_decide_request',{
       p_request_id:req.id,p_decision:'accept'
      });
      if(error)throw error;
      message('Agendamento confirmado. Avise o cliente pelo telefone.');
      await refresh();
     }),
     button('Recusar',async()=>{
      if(!confirm('Recusar esta solicitação?'))return;
      const {error}=await supabase.rpc('saas_barber_decide_request',{
       p_request_id:req.id,p_decision:'reject'
      });
      if(error)throw error;
      message('Solicitação recusada.');await refresh();
     })
    );
   }else actions.textContent='Expirado';
  }else actions.textContent='—';
  tr.append(actions);target.append(tr);
 }
}
function renderAppointments(items){
 const target=get('appointmentRows');target.replaceChildren();
 if(!items.length){
  const tr=document.createElement('tr'),td=cell('Nenhum atendimento para hoje.');
  td.colSpan=5;tr.append(td);target.append(tr);return;
 }
 for(const item of items){
  const tr=document.createElement('tr');
  tr.append(cell(formatDate(item.starts_at)),
   cell((item.guest_name||'—')+' · '+(item.guest_phone||'—')),
   cell(item.service||'—'),
   cell(item.status==='completed'?'Concluído':item.status==='confirmed'?'Confirmado':item.status));
  const actions=document.createElement('td');
  if(['confirmed','pending'].includes(item.status)){
   actions.append(button('Concluir',async()=>{
    if(!confirm('O serviço já foi realizado? A conclusão registrará o valor no financeiro.'))return;
    const {data,error}=await supabase.rpc('saas_reception_complete',{p_appointment_id:item.id});
    if(error)throw error;
    if(!data?.ok)throw new Error('Servidor não confirmou a conclusão.');
    message('Atendimento concluído e registrado.');await refresh();
   }));
  }else actions.textContent='—';
  tr.append(actions);target.append(tr);
 }
}
async function refresh(){
 if(busy)return;
 busy=true;get('refresh').disabled=true;
 try{
  const {data,error}=await supabase.rpc('saas_reception_dashboard',{p_slug:slug});
  if(error||!data)throw error||new Error('Acesso negado à recepção.');
  showDashboard(true);
  get('staffName').textContent='Usuário: '+data.username;
  renderRequests(Array.isArray(data.requests)?data.requests:[]);
  renderAppointments(Array.isArray(data.today)?data.today:[]);
  message('Agenda atualizada.');
 }catch(e){
  showDashboard(false);
  message(e.message||'Acesso da recepção indisponível.',true);
 }finally{busy=false;get('refresh').disabled=false}
}
get('loginForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const username=get('username').value.trim().toLowerCase();
 const password=get('password').value;
 if(!tenantId||!/^[a-z][a-z0-9._-]{2,19}$/.test(username)){
  message('Informe o usuário de recepção criado pelo administrador.',true);return;
 }
 const btn=get('loginButton');btn.disabled=true;
 try{
  const {error}=await supabase.auth.signInWithPassword({
   email:internalEmail(username),password
  });
  if(error)throw new Error('Usuário ou senha inválidos.');
  get('loginForm').reset();
  await refresh();
  if(!loggedIn){
   await supabase.auth.signOut();
   message('Este usuário não possui acesso ativo à recepção desta empresa.',true);
  }
 }catch(e){message(e.message||'Não foi possível entrar.',true)}
 finally{btn.disabled=false}
});
get('refresh').addEventListener('click',refresh);
get('logout').addEventListener('click',async()=>{
 await supabase.auth.signOut();showDashboard(false);message('Você saiu da recepção.');
});
async function init(){
 if(!slug||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
  throw new Error('Endereço de empresa inválido.');
 const {data,error}=await supabase.from('saas_public_stores')
  .select('tenant_id,name,template_code,logo_url,primary_color').eq('slug',slug).maybeSingle();
 if(error)throw error;
 if(!data||data.template_code!=='barbershop')
  throw new Error('A recepção desta empresa não está disponível.');
 tenantId=data.tenant_id;
 get('shopName').textContent=data.name;
 document.title='Recepção | '+data.name;
 if(/^#[a-f0-9]{6}$/i.test(data.primary_color||''))
  document.documentElement.style.setProperty('--accent',data.primary_color);
 const url=safeImage(data.logo_url);
 if(url){get('shopLogo').src=url;get('shopLogo').hidden=false}
 const {data:{user}}=await supabase.auth.getUser();
 if(user)await refresh();
 else {showDashboard(false);message('Informe o usuário e a senha criados pelo administrador.')}
}
void init().catch(e=>{
 showDashboard(false);get('shopName').textContent='Recepção indisponível';
 message(e.message||'Não foi possível abrir a recepção.',true);
});
