import { supabase } from './supabase.js';
import { getSession, getAAL, signOut } from './auth.js';
const $=s=>document.querySelector(s);const brl=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
async function boot(){const session=await getSession();if(!session){location.href='../auth/login.html';return}const aal=await getAAL();if(aal.currentLevel==='aal1'&&aal.nextLevel==='aal2'){location.href='../auth/login.html';return}const {data:m,error}=await supabase.from('saas_members').select('tenant_id,role,status').eq('user_id',session.user.id).eq('status','active');if(error||!m?.length){show('Nenhuma empresa ativa vinculada a esta conta.');return}const member=m[0],tid=member.tenant_id;if(!['owner','admin','employee'].includes(member.role)){show('Permissão da conta não reconhecida.');return}const [{data:t,error:tenantError},{data:p},{data:s,error:settingsError}]=await Promise.all([supabase.from('saas_tenants').select('name,business_mode,business_type').eq('id',tid).single(),supabase.from('saas_profiles').select('full_name').eq('user_id',session.user.id).single(),supabase.from('saas_settings').select('*').eq('tenant_id',tid).single()]);if(tenantError||!t){show('Não foi possível carregar a empresa.');return}if(settingsError){show('Não foi possível carregar as permissões dos módulos.');return}$('#companyName').textContent=t?.name||'Minha empresa';$('#businessType').textContent=t?.business_type||'Empresa';$('#userName').textContent=p?.full_name||session.user.email;$('#userRole').textContent=member.role==='owner'?'Proprietário':member.role==='admin'?'Administrador':'Funcionário';modules(s,t?.business_mode,member.role);await metrics(tid,member.role)}
function modules(settings,mode,role){
  const flags={products:'products_enabled',services:'services_enabled',inventory:'inventory_enabled',appointments:'appointments_enabled',finance:'finance_enabled',ai:'ai_enabled'};
  const denied={
    owner:[],
    admin:['settings','plan'],
    employee:['finance','employees','appearance','reports','settings','plan']
  };
  const blocked=denied[role]||denied.employee;
  document.querySelectorAll('[data-module]').forEach(el=>{
    const module=el.dataset.module;
    const disabled=!!(flags[module]&&settings?.[flags[module]]===false);
    const incompatible=(mode==='services'&&['products','inventory'].includes(module))||(mode==='products'&&module==='services');
    const forbidden=blocked.includes(module);
    const hidden=disabled||incompatible||forbidden;
    el.classList.toggle('hidden',hidden);
    if(hidden){el.setAttribute('aria-hidden','true');el.setAttribute('tabindex','-1')}
    else{el.removeAttribute('aria-hidden');el.removeAttribute('tabindex')}
  });
}
async function metrics(tid,role){const d=new Date();d.setDate(1);d.setHours(0,0,0,0);const base=[supabase.from('saas_orders').select('total,status,created_at').eq('tenant_id',tid).gte('created_at',d.toISOString()),supabase.from('saas_customers').select('id',{count:'exact',head:true}).eq('tenant_id',tid).eq('status','active'),supabase.from('saas_appointments').select('id',{count:'exact',head:true}).eq('tenant_id',tid).gte('starts_at',new Date().toISOString()).neq('status','cancelled')];const [o,c,a]=await Promise.all(base);const completed=(o.data||[]).filter(x=>x.status==='completed').reduce((n,x)=>n+Number(x.total||0),0);$('#metricOrders').textContent=(o.data||[]).length;$('#metricCustomers').textContent=c.count||0;$('#metricAppointments').textContent=a.count||0;if(role==='employee'){$('#metricRevenueCard')?.classList.add('hidden');$('#financialSummary')?.classList.add('hidden');return}const {data:f}=await supabase.from('saas_financial_entries').select('kind,amount').eq('tenant_id',tid).gte('occurred_on',d.toISOString().slice(0,10));const income=(f||[]).filter(x=>x.kind==='income').reduce((n,x)=>n+Number(x.amount||0),0),expense=(f||[]).filter(x=>x.kind==='expense').reduce((n,x)=>n+Number(x.amount||0),0);$('#metricRevenue').textContent=brl.format(income||completed);$('#metricBalance').textContent=brl.format(income-expense)}
function show(x){const e=$('#status');e.textContent=x;e.className='status show error'}
$('#menuToggle')?.addEventListener('click',()=>$('#sidebar').classList.toggle('open'));$('#logout')?.addEventListener('click',async()=>{await signOut();location.href='../index.html'});boot().catch(e=>show(e.message||'Erro ao carregar o painel.'));
