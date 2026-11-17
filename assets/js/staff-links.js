import {supabase} from './supabase.js';
import {getBusinessContext} from './business.js';
const el=id=>document.getElementById(id);let ctx,staff=[],members=[];
const msg=(s,e=false)=>{const n=el('status');n.textContent=s;n.className='status show '+(e?'error':'ok')};
function option(value,label){const x=document.createElement('option');x.value=value;x.textContent=label;return x}
async function reload(){
 const [e,m]=await Promise.all([
  supabase.from('saas_employees').select('id,name,user_id,status').eq('tenant_id',ctx.tenant.id).order('name'),
  supabase.from('saas_members').select('user_id,role,status').eq('tenant_id',ctx.tenant.id).eq('role','employee').eq('status','active')
 ]);
 if(e.error||m.error)throw e.error||m.error;
 staff=e.data||[];members=m.data||[];
 const employee=el('employee'),member=el('member'),table=el('links');
 employee.replaceChildren(option('','Selecione'));member.replaceChildren(option('','Selecione'));
 for(const s of staff.filter(x=>x.status==='active'))employee.append(option(s.id,s.name));
 for(const m of members)member.append(option(m.user_id,'Funcionário autorizado · '+m.user_id.slice(0,8)));
 table.replaceChildren();
 for(const s of staff){
  const row=document.createElement('tr'),n=document.createElement('td'),account=document.createElement('td');
  n.textContent=s.name;account.textContent=s.user_id?'Conta '+s.user_id.slice(0,8):'Sem vínculo';
  row.append(n,account);table.append(row)
 }
 el('linkForm').hidden=false;
}
el('linkForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!ctx)return;
 const employeeId=el('employee').value,userId=el('member').value;
 if(!employeeId||!userId){msg('Selecione funcionário e conta autorizada.',true);return}
 const button=event.currentTarget.querySelector('button');button.disabled=true;
 try{const {data,error}=await supabase.rpc('saas_link_employee_login',{p_tenant_id:ctx.tenant.id,p_employee_id:employeeId,p_user_id:userId});
 if(error||data!==true)throw error||Error('Vínculo não confirmado.');
 msg('Conta vinculada sem alterar cargo ou permissões.');await reload()
 }catch(e){msg(e.message||'Falha ao vincular.',true)}finally{button.disabled=false}
});
async function boot(){
 ctx=await getBusinessContext();
 if(!['owner','admin'].includes(ctx.membership.role)){location.replace('./index.html');return}
 el('company').textContent=ctx.tenant.name;await reload()
}
void boot().catch(e=>msg(e.message||'Falha ao carregar.',true));
