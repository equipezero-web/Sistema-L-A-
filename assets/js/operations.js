import {supabase} from './supabase.js';
import {getBusinessContext} from './business.js';

const el=id=>document.getElementById(id);
const channels=[
 {name:'Painel administrativo',hint:'Visão geral e navegação da empresa',href:'./index.html',roles:['owner','admin','employee']},
 {name:'Minha Loja',hint:'Cores, gradientes, fonte, logo e seções',href:'./aparencia.html',roles:['owner','admin']},
 {name:'Configurações empresariais',hint:'Módulos e permissões',href:'./configuracoes.html',roles:['owner']},
 {name:'Modelos de empresa',hint:'Configurações do modelo escolhido no cadastro',href:'./aparencia.html',roles:['owner','admin']},
 {name:'Equipe e funcionários',hint:'Cadastro de equipe; acesso de usuário é uma etapa separada',href:'./funcionarios.html',roles:['owner','admin']},
 {name:'Clientes',hint:'Cadastros e histórico permitido',href:'./clientes.html',roles:['owner','admin','employee']},
 {name:'Agenda',hint:'Agendamentos e confirmações',href:'./agenda.html',roles:['owner','admin','employee'],module:'appointments'},
 {name:'Vendas',hint:'Pedidos e acompanhamento',href:'./vendas.html',roles:['owner','admin','employee']},
 {name:'Estoque',hint:'Inventário, ajustes e movimentos',href:'./estoque.html',roles:['owner','admin','employee'],module:'inventory'},
 {name:'Financeiro',hint:'Receitas e despesas reais da empresa',href:'./financeiro.html',roles:['owner','admin'],module:'finance'},
 {name:'Relatórios',hint:'Relatórios e exportações disponíveis',href:'./relatorios.html',roles:['owner','admin']},
 {name:'Pagamentos da loja',hint:'Conexão do vendedor e prontidão; checkout ainda em homologação',href:'./pagamentos-loja.html',roles:['owner'],template:'virtual_store'},
 {name:'Plano e assinatura',hint:'Assinatura e acesso empresarial',href:'./plano.html',roles:['owner']},
 {name:'Royal AI',hint:'Análises com dados permitidos, sem operações automáticas irreversíveis',href:'./royal-ai.html',roles:['owner','admin','employee'],module:'ai'}
];
let context=null,settings={},deferredInstall=null;
const say=(message,err=false)=>{const e=el('status');e.textContent=message;e.className='status show '+(err?'error':'ok')};
function item(title,description,meta){
 const li=document.createElement('li'),strong=document.createElement('strong'),small=document.createElement('small');
 strong.textContent=title;small.textContent=description;li.append(strong,small);
 if(meta)li.dataset.id=meta;
 return li;
}
function renderModules(){
 const list=el('modules');list.replaceChildren();
 const q=el('moduleSearch').value.trim().toLocaleLowerCase('pt-BR');
 const role=context.membership.role,mode=context.tenant.business_mode;
 const flags={appointments:'appointments_enabled',inventory:'inventory_enabled',finance:'finance_enabled',ai:'ai_enabled'};
 const restricted=channels.filter(ch=>ch.roles.includes(role)
   &&(!ch.template||ch.template===context.tenant.template_code)
   &&(!ch.module||settings[flags[ch.module]]!==false)
   &&!(mode==='services'&&ch.module==='inventory'));
 for(const channel of restricted.filter(ch=>(ch.name+' '+ch.hint).toLocaleLowerCase('pt-BR').includes(q))){
  const link=document.createElement('a');link.className='ops-module';link.href=channel.href;
  const strong=document.createElement('strong'),span=document.createElement('span'),em=document.createElement('em');
  strong.textContent=channel.name;span.textContent=channel.hint;em.textContent='Abrir módulo';
  link.append(strong,span,em);list.append(link);
 }
 if(!list.childElementCount){const p=document.createElement('p');p.className='muted';p.textContent='Nenhum módulo disponível para esta pesquisa e função.';list.append(p)}
}
async function notifications(){
 const list=el('notificationList');list.replaceChildren(item('Atualizando','Consultando avisos privados…'));
 const {data,error}=await supabase.from('saas_notifications')
  .select('id,title,message,created_at,read_at')
  .eq('tenant_id',context.tenant.id).eq('recipient_user_id',context.user.id)
  .order('created_at',{ascending:false}).limit(30);
 list.replaceChildren();
 if(error){list.append(item('Avisos indisponíveis','Tente atualizar mais tarde.'));return}
 if(!data?.length){list.append(item('Nenhum aviso por enquanto','Notificações serão exibidas quando os módulos publicarem eventos.'));return}
 for(const n of data){
  const li=item(n.title,n.message+' · '+new Date(n.created_at).toLocaleString('pt-BR'));
  if(!n.read_at){
   const button=document.createElement('button');button.className='btn';button.type='button';button.textContent='Marcar como lido';
   button.addEventListener('click',async()=>{button.disabled=true;const {data:ok,error:e}=await supabase.rpc('saas_mark_notification_read',{p_notification_id:n.id});if(e||ok!==true){button.disabled=false;say('Não foi possível atualizar a notificação.',true);return}await notifications()});
   li.append(button);
  }
  list.append(li);
 }
}
async function tickets(){
 const list=el('ticketsList');list.replaceChildren(item('Atualizando','Consultando seus chamados…'));
 const {data,error}=await supabase.from('saas_support_tickets').select('title,status,category,created_at')
  .eq('tenant_id',context.tenant.id).order('created_at',{ascending:false}).limit(30);
 list.replaceChildren();
 if(error){list.append(item('Chamados indisponíveis','Não foi possível consultar o suporte.'));return}
 if(!data?.length){list.append(item('Nenhum chamado','Use o formulário acima para solicitar atendimento.'));return}
 const translate={open:'Aberto',in_progress:'Em análise',resolved:'Resolvido',closed:'Encerrado'};
 for(const t of data)list.append(item(t.title,(translate[t.status]||t.status)+' · '+new Date(t.created_at).toLocaleString('pt-BR')));
}
async function boot(){
 context=await getBusinessContext();
 el('company').textContent=context.tenant.name;
 el('model').textContent='Modelo: '+({barbershop:'Barbearia',virtual_store:'Loja virtual',instagram_orders:'Vendas Instagram',business_communication:'Comunicação empresarial',generic:'Empresa geral'}[context.tenant.template_code]||'Empresarial');
 el('role').textContent='Permissão: '+({owner:'Proprietário',admin:'Administrador',employee:'Funcionário'}[context.membership.role]||context.membership.role);
 const {data:s,error:e}=await supabase.from('saas_settings').select('appointments_enabled,inventory_enabled,finance_enabled,ai_enabled').eq('tenant_id',context.tenant.id).maybeSingle();
 if(e){say('Não foi possível validar as configurações dos módulos.',true);return}
 settings=s||{};
 renderModules();
 const {data:access,error:accessError}=await supabase.rpc('saas_subscription_access',{p_tenant_id:context.tenant.id});
 if(!accessError&&access?.active===true){
  const href='../store/?slug='+encodeURIComponent(context.tenant.slug);
  for(const id of ['publicStore','storeLink']){el(id).href=href;el(id).hidden=false}
 }
 if(context.membership.role!=='employee')el('supportForm').hidden=false;
 await Promise.all([notifications(),tickets()]);
}
el('moduleSearch').addEventListener('input',()=>{if(context)renderModules()});
el('reloadNotifications').addEventListener('click',()=>{if(context)void notifications()});
el('supportForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!context||!['owner','admin'].includes(context.membership.role))return;
 const form=event.currentTarget,button=form.querySelector('button[type=submit]');
 button.disabled=true;
 try{
  const title=String(form.elements.title.value).trim();
  const description=String(form.elements.description.value).trim();
  const category=form.elements.category.value;
  if(title.length<5||description.length<10)throw new Error('Preencha assunto e descrição.');
  const {error}=await supabase.from('saas_support_tickets').insert({
   tenant_id:context.tenant.id,created_by:context.user.id,title,description,category
  });
  if(error)throw error;
  form.reset();say('Chamado registrado. A equipe poderá consultar o pedido pelo sistema.');await tickets();
 }catch(error){say(error.message||'Não foi possível abrir o chamado.',true)}finally{button.disabled=false}
});
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();deferredInstall=event;el('installButton').hidden=false;
});
el('installButton').addEventListener('click',async()=>{
 if(!deferredInstall)return;
 const prompt=deferredInstall;deferredInstall=null;el('installButton').hidden=true;
 await prompt.prompt();el('installHelp').textContent='Confira a solicitação de instalação do navegador.';
});
if('serviceWorker' in navigator && location.protocol==='https:'){
 void navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
}
void boot().catch(error=>say(error.message||'Não foi possível abrir a central.',true));
