import { supabase } from './supabase.js';
import { getSession, getAAL, getMyProfile, signOut } from './auth.js';

const $ = s => document.querySelector(s);
const show = (text, error = false) => { const el = $('#status'); if (!el) return; el.textContent = text; el.className = `status show ${error ? 'error' : 'ok'}`; };

let tenantsData=[],pendingAction=null,auditOffset=0,auditRequestId=0;const AUDIT_PAGE_SIZE=20;
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const formatDate=v=>v?new Date(v).toLocaleDateString('pt-BR'):'—';
function paymentAttention(t){return ['rejected','failed','refunded','charged_back'].includes(String(t.last_payment_status||'').toLowerCase())||!!t.current_period_end&&new Date(t.current_period_end)<new Date()&&!['active','authorized'].includes(String(t.subscription_status||'').toLowerCase())}
function drawTenants(){
 const query=$('#tenantSearch').value.toLocaleLowerCase('pt-BR').trim(),filter=$('#tenantFilter').value;
 const visible=tenantsData.filter(t=>t.name.toLocaleLowerCase('pt-BR').includes(query)&&(filter==='all'||filter==='due'&&paymentAttention(t)||filter==='active'&&t.active||filter==='suspended'&&!t.active));
 $('#tenantList').replaceChildren();
 if(!visible.length){$('#tenantList').textContent='Nenhuma empresa encontrada.';return}
 for(const t of visible){
  const el=document.createElement('article');el.className='royal-tenant';
  const due=paymentAttention(t);
  el.innerHTML=`<div class="royal-tenant-head"><div><div class="eyebrow">Cliente da plataforma</div><h3>${esc(t.name)}</h3><small>${esc(t.slug)}</small></div><span class="royal-tag">${t.active?'Ativa':t.last_access_action==='expel'?'Expulsa':'Desativada'}</span></div><div class="royal-meta"><span>Assinatura: ${esc(t.subscription_status||'Não identificada')}</span><span>Vencimento: ${formatDate(t.current_period_end)}</span><span>${due?'Revisar cobrança':'Situação financeira sem alerta de vencimento'}</span><span>Uso registrado: ${Number(t.active_minutes||0)} min</span><span>Última atividade: ${t.last_activity?new Date(t.last_activity).toLocaleString('pt-BR'):'Sem registro'}</span></div><div class="royal-actions"><button class="btn ${t.active?'royal-danger':''}" data-id="${esc(t.id)}">${t.active?'Desativar loja':t.last_access_action==='expel'?'Acesso bloqueado por expulsão':'Reativar loja'}</button></div>`;
  el.querySelector('button').disabled=!t.active&&t.last_access_action==='expel';el.querySelector('button').onclick=()=>{pendingAction={id:t.id,name:t.name,active:!t.active,action:t.active?'suspend':'reactivate'};$('#dialogTitle').textContent=t.active?'Confirmar desativação da loja':'Confirmar reativação';$('#dialogDescription').textContent=t.active?`A loja de "${t.name}" será desativada. Informe o motivo para o cliente.`:`A loja de "${t.name}" será reativada. Atenção: se houve expulsão, os vínculos dos usuários continuarão suspensos; esta ação NÃO recupera o acesso. Informe o motivo.`;$('#actionReason').value='';$('#confirmAction').textContent=t.active?'Confirmar desativação':'Confirmar reativação';$('#expelConfirmBox').hidden=true;$('#tenantDialog').showModal()};
  if(!t.active&&t.last_access_action==='expel'){const restore=document.createElement('button');restore.className='btn';restore.textContent='Restaurar acesso do proprietário';restore.onclick=()=>{pendingAction={id:t.id,name:t.name,action:'restore'};$('#dialogTitle').textContent='Restaurar proprietário após expulsão';$('#dialogDescription').textContent='Esta operação só será permitida quando houver expulsão pendente. A loja será reativada e somente o vínculo do proprietário será restaurado. Os demais usuários continuarão suspensos. Informe o motivo e confirme o nome da empresa.';$('#actionReason').value='';$('#confirmAction').textContent='Confirmar restauração';$('#expelConfirmBox').hidden=false;$('#expelTargetName').textContent=t.name;$('#expelConfirmName').value='';$('#tenantDialog').showModal()};el.querySelector('.royal-actions').appendChild(restore)}if(t.active){const expel=document.createElement('button');expel.className='btn royal-danger';expel.textContent='Expulsar cliente';expel.onclick=()=>{pendingAction={id:t.id,name:t.name,action:'expel'};$('#dialogTitle').textContent='Confirmar expulsão do cliente';$('#dialogDescription').textContent=`A empresa "${t.name}" será desativada e seus membros perderão o acesso. Os dados serão preservados. Informe o motivo da expulsão.`;$('#actionReason').value='';$('#confirmAction').textContent='Confirmar expulsão';$('#expelConfirmBox').hidden=false;$('#expelTargetName').textContent=t.name;$('#expelConfirmName').value='';$('#tenantDialog').showModal()};el.querySelector('.royal-actions').appendChild(expel)}$('#tenantList').appendChild(el);
 }
}
async function loadTenants(){const{data,error}=await supabase.rpc('saas_platform_tenants');if(error)throw error;tenantsData=data||[];drawTenants();populateAuditTenants()}
$('#tenantSearch').addEventListener('input',drawTenants);
$('#tenantFilter').addEventListener('change',drawTenants);
$('#cancelAction').onclick=()=>$('#tenantDialog').close();
$('#tenantActionForm').onsubmit=async e=>{e.preventDefault();if(!pendingAction)return;const reason=$('#actionReason').value.trim();if(['expel','restore'].includes(pendingAction.action)&&$('#expelConfirmName').value.trim()!==pendingAction.name){show('Digite exatamente o nome da empresa para confirmar a operação.',true);return}if(reason.length<10)return show('Descreva o motivo com pelo menos 10 caracteres.',true);const button=$('#confirmAction');button.disabled=true;try{const{error}=pendingAction.action==='restore'?await supabase.rpc('saas_platform_restore_owner',{p_tenant_id:pendingAction.id,p_reason:reason}):pendingAction.action==='expel'?await supabase.rpc('saas_platform_expel_tenant',{p_tenant_id:pendingAction.id,p_reason:reason}):await supabase.rpc('saas_platform_set_tenant_active',{p_tenant_id:pendingAction.id,p_active:pendingAction.active,p_reason:reason});if(error)throw error;$('#tenantDialog').close();pendingAction=null;await loadTenants();auditOffset=0;await loadAudit();show('Ação registrada. O aviso foi disponibilizado ao proprietário; acessos expulsos não são restaurados automaticamente.')}catch(err){show(err.message,true)}finally{button.disabled=false}};
function populateAuditTenants(){
 const select=$('#auditTenant'),selected=select.value;
 const all=document.createElement('option');all.value='';all.textContent='Todas as empresas';
 select.replaceChildren(all);
 for(const tenant of [...tenantsData].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))){
  const option=document.createElement('option');option.value=tenant.id;option.textContent=tenant.name;select.appendChild(option);
 }
 select.value=Array.from(select.options).some(option=>option.value===selected)?selected:'';
}
function auditFilters(){
 return {
  p_tenant_id:$('#auditTenant').value||null,
  p_action:$('#auditAction').value||null,
  p_from:$('#auditStart').value||null,
  p_to:$('#auditEnd').value||null
 };
}
function resetAuditPage(){auditOffset=0;void loadAudit()}
for(const id of ['auditTenant','auditAction','auditStart','auditEnd']){
 $('#'+id).addEventListener('change',resetAuditPage);
}
$('#auditClear').onclick=()=>{
 for(const id of ['auditTenant','auditAction','auditStart','auditEnd'])$('#'+id).value='';
 resetAuditPage();
};
async function loadAudit(){
 const status=$('#auditStatus'),list=$('#auditList');
 const filters=auditFilters(),requestId=++auditRequestId;
 $('#auditPrevious').disabled=true;$('#auditNext').disabled=true;
 if(filters.p_from&&filters.p_to&&filters.p_from>filters.p_to){
  list.replaceChildren();status.textContent='A data inicial não pode ser posterior à data final.';
  $('#auditPage').textContent='Período inválido';return;
 }
 status.textContent='Carregando histórico...';
 const{data,error}=await supabase.rpc('saas_platform_audit_filtered',{
  p_limit:AUDIT_PAGE_SIZE,p_offset:auditOffset,...filters
 });
 if(requestId!==auditRequestId)return;
 if(error){status.textContent='Não foi possível carregar a auditoria: '+error.message;return}
 const items=Array.isArray(data?.items)?data.items:[],total=Number(data?.total||0);
 list.replaceChildren();
 const names={suspend:'Desativação',reactivate:'Reativação',expel:'Expulsão',restore:'Recuperação do proprietário'};
 for(const a of items){
  const item=document.createElement('article');item.className='royal-tenant';
  const head=document.createElement('h3');head.textContent=(names[a.action]||a.action)+' · '+(a.tenant_name||'Empresa não identificada');
  const meta=document.createElement('p');meta.textContent='Data: '+new Date(a.created_at).toLocaleString('pt-BR',{timeZone:'America/Recife'})+' · Responsável: '+(a.actor_name||'Administrador');
  const reason=document.createElement('p');reason.textContent='Justificativa: '+(a.reason||'Não informada');
  item.append(head,meta,reason);list.appendChild(item);
 }
 status.textContent=items.length?'':'Nenhuma decisão corresponde aos filtros.';
 $('#auditPrevious').disabled=auditOffset===0;
 $('#auditNext').disabled=auditOffset+items.length>=total;
 $('#auditPage').textContent=total?((auditOffset+1)+'–'+(auditOffset+items.length)+' de '+total):'0 registros';
}
$('#auditPrevious').onclick=()=>{auditOffset=Math.max(0,auditOffset-AUDIT_PAGE_SIZE);void loadAudit()};
$('#auditNext').onclick=()=>{auditOffset+=AUDIT_PAGE_SIZE;void loadAudit()};
async function boot() {
  const session = await getSession();
  if (!session) { location.href = '../auth/login.html'; return; }
  const profile = await getMyProfile();
  if (!profile?.is_platform_super_admin) { await signOut(); location.href = '../auth/login.html'; return; }
  const aal = await getAAL();
  if (aal.currentLevel !== 'aal2') { location.href = '../auth/login.html'; return; }

  const [{ count: tenants, error: tenantError }, { count: subscriptions, error: subError }] = await Promise.all([
    supabase.from('saas_tenants').select('id', { count: 'exact', head: true }),
    supabase.from('saas_subscriptions').select('tenant_id', { count: 'exact', head: true }).eq('status', 'active')
  ]);
  if (tenantError) throw tenantError;
  if (subError) throw subError;
  $('#adminName').textContent = profile.full_name || session.user.email || 'Super Admin';
  $('#tenantCount').textContent = tenants ?? 0;
  $('#subscriptionCount').textContent = subscriptions ?? 0;await loadTenants();await loadAudit();
}

$('#logout')?.addEventListener('click', async () => { await signOut(); location.href = '../auth/login.html'; });
boot().catch(err => show(err.message || 'Não foi possível carregar o Super Admin.', true));
