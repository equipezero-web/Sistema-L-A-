import {supabase} from './supabase.js';
import {getBusinessContext} from './business.js';
const get=id=>document.getElementById(id);
let ctx,activeThread=null;
const show=(t,e=false)=>{const n=get('status');n.textContent=t;n.className='status show '+(e?'error':'ok')};
const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e};
async function loadThreads(){
 const host=get('threads');host.replaceChildren();
 const {data,error}=await supabase.from('saas_crm_threads').select('id,subject,status,channel,created_at')
  .eq('tenant_id',ctx.tenant.id).order('created_at',{ascending:false}).limit(60);
 if(error)throw error;
 if(!data?.length){host.append(node('p','Nenhuma conversa cadastrada.'));return}
 for(const t of data){const b=node('button',t.subject+' · '+t.status);b.type='button';b.className='btn';
  b.onclick=()=>loadMessages(t).catch(e=>show(e.message,true));host.append(b)}
}
async function loadMessages(thread){
 activeThread=thread;
 get('threadTitle').textContent=thread.subject;
 get('threadInfo').textContent='Canal de referência: '+thread.channel+'. Sem envio para provedores externos.';
 const host=get('messages');host.replaceChildren();
 const {data,error}=await supabase.from('saas_crm_messages').select('body,created_at')
  .eq('tenant_id',ctx.tenant.id).eq('thread_id',thread.id).order('created_at').limit(100);
 if(error)throw error;
 for(const m of data||[]){const p=node('p',m.body);p.className='crm-msg';const small=node('small',new Date(m.created_at).toLocaleString('pt-BR'));p.append(small);host.append(p)}
 if(!data?.length)host.append(node('p','Nenhuma nota ainda.'));
 get('messageForm').hidden=false;
}
get('newThread').addEventListener('submit',async e=>{
 e.preventDefault();if(!ctx)return;
 const form=e.currentTarget,b=form.querySelector('button');b.disabled=true;
 try{const subject=form.elements.subject.value.trim(),channel=form.elements.channel.value;
  const {error}=await supabase.from('saas_crm_threads').insert({
   tenant_id:ctx.tenant.id,created_by:ctx.user.id,subject,channel});
  if(error)throw error;form.reset();await loadThreads();show('Conversa criada para esta empresa.')
 }catch(err){show(err.message||'Falha ao criar conversa.',true)}finally{b.disabled=false}
});
get('messageForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!ctx||!activeThread)return;
 const form=e.currentTarget,b=form.querySelector('button');b.disabled=true;
 try{const body=form.elements.body.value.trim();if(!body)throw Error('Digite uma nota.');
  const {error}=await supabase.from('saas_crm_messages').insert({
    tenant_id:ctx.tenant.id,thread_id:activeThread.id,author_user_id:ctx.user.id,body});
  if(error)throw error;form.reset();await loadMessages(activeThread);show('Nota interna registrada.')
 }catch(err){show(err.message||'Falha ao salvar nota.',true)}finally{b.disabled=false}
});
async function boot(){
 ctx=await getBusinessContext();get('company').textContent=ctx.tenant.name;
 await loadThreads();
}
void boot().catch(e=>show(e.message||'Falha ao abrir CRM.',true));
