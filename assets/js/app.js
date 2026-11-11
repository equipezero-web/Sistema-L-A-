import { supabase } from './supabase.js';
import { getVerifiedUser, getAAL, signOut } from './auth.js';
const $=s=>document.querySelector(s);const brl=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
async function boot(){const user=await getVerifiedUser();if(!user){location.href='../auth/login.html';return}const aal=await getAAL();if(aal.currentLevel==='aal1'&&aal.nextLevel==='aal2'){location.href='../auth/login.html';return}const {data:m,error}=await supabase.from('saas_members').select('tenant_id,role,status').eq('user_id',user.id).eq('status','active');if(error){show('Não foi possível verificar o acesso da sua conta.');return}if(!m?.length){const{data:notice}=await supabase.rpc('saas_my_platform_notice');if(!notice){const{data:access,error:accessError}=await supabase.rpc('saas_my_access_summary');if(!accessError&&access?.is_platform_super_admin){location.replace('../super-admin/index.html');return}if(!accessError&&access?.has_any_membership===false&&access?.has_owned_tenant===false){location.replace('../onboarding/index.html');return}}if(notice){$('#platformNotice').classList.remove('hidden');$('#noticeTitle').textContent=notice.title;$('#noticeBody').textContent=notice.message;$('#noticeDate').textContent=new Date(notice.created_at).toLocaleString('pt-BR');show('O acesso da empresa foi suspenso. Consulte o comunicado da plataforma.')}else show('Nenhuma empresa ativa vinculada a esta conta.');document.querySelectorAll('.side-nav a,.quick-grid a').forEach(a=>a.classList.add('hidden'));return}const{data:platformAccess,error:platformAccessError}=await supabase.rpc('saas_my_access_summary');if(platformAccessError||!platformAccess){show('Não foi possível verificar o perfil da conta.');return}if(platformAccess.is_platform_super_admin===true){location.replace('../super-admin/index.html');return}const member=m[0],tid=member.tenant_id;if(!['owner','admin','employee'].includes(member.role)){show('Permissão da conta não reconhecida.');return}const [{data:t,error:tenantError},{data:p},{data:s,error:settingsError}]=await Promise.all([supabase.from('saas_tenants').select('name,business_mode,business_type,active').eq('id',tid).single(),supabase.from('saas_profiles').select('full_name').eq('user_id',user.id).single(),supabase.from('saas_settings').select('*').eq('tenant_id',tid).single()]);if(tenantError||!t){show('Não foi possível carregar a empresa.');return}$('#companyName').textContent=t?.name||'Minha empresa';$('#businessType').textContent=t?.business_type||'Empresa';$('#userName').textContent=p?.full_name||user.email;$('#userRole').textContent=member.role==='owner'?'Proprietário':member.role==='admin'?'Administrador':'Funcionário';await platformNotice(tid,t.active);if(t.active===false){show('Esta empresa foi desativada pela administração da plataforma. Consulte o comunicado abaixo.');document.querySelectorAll('[data-module],.quick-grid a,.side-nav a').forEach(a=>{a.classList.add('hidden');a.setAttribute('aria-hidden','true')});return}if(settingsError){show('Não foi possível carregar as permissões dos módulos.');return}modules(s,t?.business_mode,member.role);if(member.role==='employee'){hideFinancialWidgets()}document.body.classList.add('access-ready');startUsage(tid);await metrics(tid,member.role)}
async function platformNotice(tid,active){const{data,error}=await supabase.from('saas_platform_notices').select('title,message,created_at').eq('tenant_id',tid).order('created_at',{ascending:false}).limit(1);if(error||!data?.length)return;const n=data[0];if(active&&n.title==='Loja desativada pela plataforma')return;$('#platformNotice').classList.remove('hidden');$('#noticeTitle').textContent=n.title;$('#noticeBody').textContent=n.message;$('#noticeDate').textContent=new Date(n.created_at).toLocaleString('pt-BR')}
function startUsage(tid){
 let busy=false,stopped=false,lastAttempt=0;
 const tick=async()=>{
  if(stopped||busy||document.visibilityState!=='visible'||!document.hasFocus()||Date.now()-lastAttempt<30000)return;
  busy=true;lastAttempt=Date.now();
  try{
   const{error}=await supabase.rpc('saas_record_usage',{p_tenant_id:tid});
   if(error&&/Acesso negado ou empresa desativada/i.test(error.message||'')){
    stopped=true;
    clearInterval(interval);
    window.removeEventListener('focus',tick);
    document.removeEventListener('visibilitychange',tick);
    location.reload();
   }
  }catch(error){console.warn('Não foi possível confirmar o uso ativo',error)}
  finally{busy=false}
 };
 const interval=setInterval(tick,60000);
 window.addEventListener('focus',tick);
 document.addEventListener('visibilitychange',tick);
 void tick();
}
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
function hideFinancialWidgets(){
  $('#metricRevenueCard')?.classList.add('hidden');
  $('#financialSummary')?.classList.add('hidden');
}
async function metrics(tid,role){
  const start=new Date();start.setDate(1);start.setHours(0,0,0,0);
  const monthStart=start.toISOString();
  // A count-only query does not retrieve monetary totals for employees.
  const [orders,customers,appointments]=await Promise.all([
    supabase.from('saas_orders').select('id',{count:'exact',head:true}).eq('tenant_id',tid).gte('created_at',monthStart),
    supabase.from('saas_customers').select('id',{count:'exact',head:true}).eq('tenant_id',tid).eq('status','active'),
    supabase.from('saas_appointments').select('id',{count:'exact',head:true}).eq('tenant_id',tid).gte('starts_at',new Date().toISOString()).neq('status','cancelled')
  ]);
  if(orders.error||customers.error||appointments.error){
    show('Não foi possível carregar todos os indicadores operacionais.');
    return;
  }
  $('#metricOrders').textContent=orders.count??0;
  $('#metricCustomers').textContent=customers.count??0;
  $('#metricAppointments').textContent=appointments.count??0;
  if(!['owner','admin'].includes(role)){
    hideFinancialWidgets();
    return;
  }
  const {data:entries,error}=await supabase.from('saas_financial_entries')
    .select('kind,amount').eq('tenant_id',tid).gte('occurred_on',monthStart.slice(0,10));
  if(error){
    $('#metricRevenue').textContent='Indisponível';
    $('#metricBalance').textContent='Indisponível';
    show('Não foi possível carregar os indicadores financeiros.');
    return;
  }
  const income=(entries||[]).filter(x=>x.kind==='income').reduce((sum,x)=>sum+Number(x.amount||0),0);
  const expense=(entries||[]).filter(x=>x.kind==='expense').reduce((sum,x)=>sum+Number(x.amount||0),0);
  $('#metricRevenue').textContent=brl.format(income);
  $('#metricBalance').textContent=brl.format(income-expense);
}
function show(x){const e=$('#status');e.textContent=x;e.className='status show error'}
// Mobile drawer: accessible controls, outside tap, Escape, scrolling restored.
const mobileMenu=$('#menuToggle'),mobileSidebar=$('#sidebar'),mobileBackdrop=$('#sidebarBackdrop');
function closeMobileMenu(restoreFocus=false){
 mobileSidebar?.classList.remove('open');
 document.body.classList.remove('mobile-nav-open');
 if(mobileBackdrop)mobileBackdrop.hidden=true;
 mobileMenu?.setAttribute('aria-expanded','false');
 mobileMenu?.setAttribute('aria-label','Abrir menu de navegação');
 if(restoreFocus&&window.innerWidth<=900)mobileMenu?.focus();
}
function openMobileMenu(){
 if(!mobileSidebar||!mobileMenu)return;
 mobileSidebar.classList.add('open');
 document.body.classList.add('mobile-nav-open');
 if(mobileBackdrop)mobileBackdrop.hidden=false;
 mobileMenu.setAttribute('aria-expanded','true');
 mobileMenu.setAttribute('aria-label','Fechar menu de navegação');
 mobileSidebar.querySelector('a:not(.hidden)')?.focus();
}
mobileMenu?.addEventListener('click',()=>{
 if(mobileSidebar?.classList.contains('open'))closeMobileMenu(true);
 else openMobileMenu();
});
mobileBackdrop?.addEventListener('click',()=>closeMobileMenu(true));
mobileSidebar?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>closeMobileMenu()));
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&mobileSidebar?.classList.contains('open'))closeMobileMenu(true);
});
window.addEventListener('resize',()=>{
 if(window.innerWidth>900&&mobileSidebar?.classList.contains('open'))closeMobileMenu();
});
$('#logout')?.addEventListener('click',async()=>{closeMobileMenu();await signOut();location.href='../index.html'});
boot().catch(e=>show(e.message||'Erro ao carregar o painel.'));
