import {supabase} from './supabase.js';
import {getBusinessContext} from './business.js';
const get=id=>document.getElementById(id);
let context,kind;
const msg=(s,e=false)=>{const box=get('status');box.textContent=s;box.className='status show '+(e?'error':'ok')};
const stages={open:'Aberto',in_progress:'Em andamento',done:'Concluído',cancelled:'Cancelado'};
function addLine(parent,tag,text){const el=document.createElement(tag);el.textContent=text;parent.append(el);return el}
async function reload(){
 const board=get('items');board.replaceChildren();
 const {data,error}=await supabase.from('saas_model_work_items')
  .select('id,title,details,stage,priority,due_on,created_at')
  .eq('tenant_id',context.tenant.id).eq('kind',kind).order('created_at',{ascending:false}).limit(100);
 if(error){msg(error.message||'Falha ao listar atividades.',true);return}
 if(!data?.length){addLine(board,'p','Nenhuma atividade cadastrada.');return}
 for(const item of data){
  const article=document.createElement('article');article.className='model-ticket';
  addLine(article,'h3',item.title);
  if(item.details)addLine(article,'p',item.details);
  addLine(article,'small','Prioridade: '+item.priority+' · Situação: '+(stages[item.stage]||item.stage)+(item.due_on?' · Prazo: '+item.due_on:''));
  if(['owner','admin'].includes(context.membership.role)){
   const label=document.createElement('label');label.className='field';label.textContent='Alterar situação';
   const select=document.createElement('select');select.setAttribute('aria-label','Situação de '+item.title);
   for(const [value,title] of Object.entries(stages)){const option=document.createElement('option');option.value=value;option.textContent=title;select.append(option)}
   select.value=item.stage;
   select.addEventListener('change',async()=>{
    const previous=item.stage;select.disabled=true;
    const {error:e}=await supabase.from('saas_model_work_items')
      .update({stage:select.value,updated_at:new Date().toISOString()})
      .eq('id',item.id).eq('tenant_id',context.tenant.id);
    if(e){select.value=previous;msg(e.message,true)}else{item.stage=select.value;msg('Atividade atualizada.')}
    select.disabled=false;
   });
   label.append(select);article.append(label);
  }
  board.append(article);
 }
}
get('workForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!context)return;
 const form=event.currentTarget,button=form.querySelector('button[type=submit]');
 button.disabled=true;
 try{
  const title=form.elements.title.value.trim(),details=form.elements.details.value.trim();
  if(title.length<4)throw new Error('Informe um título com pelo menos 4 caracteres.');
  const {error}=await supabase.from('saas_model_work_items').insert({
   tenant_id:context.tenant.id,created_by:context.user.id,kind,title,details,
   priority:form.elements.priority.value,due_on:form.elements.due_on.value||null
  });
  if(error)throw error;
  form.reset();msg('Atividade registrada somente para esta empresa.');await reload();
 }catch(error){msg(error.message||'Falha ao criar atividade.',true)}finally{button.disabled=false}
});
get('reload').addEventListener('click',()=>{if(context)void reload()});
async function boot(){
 context=await getBusinessContext();
 const model=context.tenant.template_code;
 if(!['instagram_orders','business_communication'].includes(model)){location.replace('./central.html');return}
 kind=model==='instagram_orders'?'instagram_followup':'communication_task';
 get('company').textContent=context.tenant.name;
 get('headline').textContent=model==='instagram_orders'?'Acompanhamento de solicitações Instagram':'Tarefas de comunicação empresarial';
 get('hint').textContent=model==='instagram_orders'
  ?'Organize solicitações registradas manualmente. Sem conexão automática à Meta, sem vender seguidores automaticamente e sem capturar credenciais Instagram.'
  :'Organize projetos e atividades internas de sua empresa. Mensagens e CRM privados não são publicados nesta página.';
 get('workForm').hidden=false;
 await reload();
}
void boot().catch(e=>msg(e.message||'Não foi possível abrir as atividades.',true));
