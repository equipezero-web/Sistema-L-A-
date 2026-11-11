import {supabase} from './supabase.js';
import {getBusinessContext} from './business.js';
const get=id=>document.getElementById(id);
let ctx=null,accounts=[],resetId=null;
function msg(message,error=false){
 const n=get('status');n.textContent=message;n.className='status show '+(error?'error':'ok');
}
async function call(action,extras={}){
 if(!ctx)throw new Error('Empresa não carregada.');
 const {data,error}=await supabase.functions.invoke('saas-reception-admin',{
  body:{action,tenant_id:ctx.tenant.id,...extras}
 });
 if(error){
  let details=null;
  try{details=await error.context?.json?.()}catch{}
  throw new Error(details?.error||error.message||'Não foi possível contatar o serviço de recepção.');
 }
 if(data?.error)throw new Error(data.error);
 return data;
}
function draw(){
 const target=get('rows');target.replaceChildren();
 if(!accounts.length){
  const tr=document.createElement('tr'),td=document.createElement('td');
  td.colSpan=4;td.textContent='Nenhuma conta de recepção cadastrada.';
  tr.append(td);target.append(tr);return;
 }
 for(const account of accounts){
  const tr=document.createElement('tr');
  for(const value of [account.username,account.active?'Ativo':'Desativado',
   new Date(account.created_at).toLocaleDateString('pt-BR')]){
   const td=document.createElement('td');td.textContent=value;tr.append(td);
  }
  const actions=document.createElement('td');
  if(account.active){
   const reset=document.createElement('button');reset.type='button';reset.className='btn';
   reset.textContent='Redefinir senha';
   reset.addEventListener('click',()=>{
    resetId=account.user_id;
    get('resetAccount').textContent='Nova senha para '+account.username;
    get('resetForm').reset();
    get('resetDialog').showModal();
   });
   const disable=document.createElement('button');disable.type='button';disable.className='btn';
   disable.textContent='Desativar';
   disable.addEventListener('click',async()=>{
    if(!confirm('Desativar a conta '+account.username+'? O acesso será interrompido.'))return;
    disable.disabled=true;
    try{await call('disable',{user_id:account.user_id});msg('Conta desativada.');await refresh()}
    catch(e){msg(e.message,true)}finally{disable.disabled=false}
   });
   actions.append(reset,disable);
  }else actions.textContent='Acesso bloqueado';
  tr.append(actions);target.append(tr);
 }
}
async function refresh(){
 const data=await call('list');
 accounts=Array.isArray(data.accounts)?data.accounts:[];
 draw();
}
get('createForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const username=get('username').value.trim().toLowerCase();
 const password=get('password').value;
 const button=get('createButton');button.disabled=true;
 try{
  if(!/^[a-z][a-z0-9._-]{2,19}$/.test(username))
   throw new Error('Usuário inválido: use 3–20 caracteres, começando com letra.');
  if(password.length<12||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password))
   throw new Error('A senha deve ter no mínimo 12 caracteres, com maiúscula, minúscula e número.');
  await call('create',{username,password});
  get('createForm').reset();
  msg('Usuário '+username+' criado. Compartilhe a senha inicial de forma privada.');
  await refresh();
 }catch(e){msg(e.message,true)}
 finally{button.disabled=false}
});
get('resetClose').onclick=get('resetCancel').onclick=()=>get('resetDialog').close();
get('resetForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if(!resetId)return;
 const b=get('resetForm').querySelector('button[type="submit"]');
 b.disabled=true;
 try{
  await call('reset-password',{user_id:resetId,password:get('resetPassword').value});
  get('resetDialog').close();get('resetForm').reset();resetId=null;
  msg('Senha redefinida. Informe a nova senha diretamente ao recepcionista.');
 }catch(err){msg(err.message,true)}finally{b.disabled=false}
});
async function init(){
 ctx=await getBusinessContext();
 if(!['owner','admin'].includes(ctx.membership.role)||ctx.tenant.template_code!=='barbershop'){
  location.replace('./index.html');return;
 }
 get('company').textContent=ctx.tenant.name;
 get('receptionLink').href=new URL('../store/recepcao.html?slug='+
  encodeURIComponent(ctx.tenant.slug),import.meta.url).href;
 await refresh();
}
void init().catch(e=>msg(e.message||'Falha ao carregar contas de recepção.',true));
