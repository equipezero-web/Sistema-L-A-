import{ supabase }from'./supabase.js';import{getBusinessContext}from'./business.js';const $=id=>document.getElementById(id),money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});let ctx,allEntries=[],visibleEntries=[];const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));function msg(t,e=false){$('status').textContent=t;$('status').className='status show '+(e?'error':'ok')}function displayEntries(){
 const from=$('financeFrom').value,to=$('financeTo').value,query=$('financeSearch').value.trim().toLocaleLowerCase('pt-BR');
 visibleEntries=allEntries.filter(x=>(!from||x.occurred_on>=from)&&(!to||x.occurred_on<=to)&&(!query||(String(x.description||'')+' '+String(x.category||'')).toLocaleLowerCase('pt-BR').includes(query)));
 const inc=visibleEntries.filter(x=>x.kind==='income').reduce((s,x)=>s+Number(x.amount),0);
 const exp=visibleEntries.filter(x=>x.kind==='expense').reduce((s,x)=>s+Number(x.amount),0);
 $('income').textContent=money(inc);$('expense').textContent=money(exp);$('balance').textContent=money(inc-exp);
 $('rows').innerHTML=visibleEntries.map(x=>`<tr><td>${new Date(x.occurred_on+'T12:00:00').toLocaleDateString('pt-BR')}</td><td>${x.kind==='income'?'Receita':'Despesa'}</td><td>${escapeHtml(x.description)}</td><td>${escapeHtml(x.category||'—')}</td><td>${money(x.amount)}</td><td>${escapeHtml(x.reference_type||'Manual')}</td></tr>`).join('')||'<tr><td colspan="6">Nenhum lançamento para os filtros selecionados.</td></tr>';
 $('financeExport').disabled=visibleEntries.length===0;
}
async function render(){
 const {data,error}=await supabase.from('saas_financial_entries').select('*').eq('tenant_id',ctx.tenant.id).order('occurred_on',{ascending:false}).order('created_at',{ascending:false});
 if(error)throw error;allEntries=data||[];displayEntries();
}
function csvCell(value){let s=String(value??'');if(/^[\\t\\r\\n ]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
function exportFinance(){
 if(!ctx||!['owner','admin'].includes(ctx.membership.role)||!visibleEntries.length)return;
 const lines=[['Data','Tipo','Descrição','Categoria','Valor','Origem'],...visibleEntries.map(x=>[x.occurred_on,x.kind==='income'?'Receita':'Despesa',x.description,x.category||'',x.amount,x.reference_type||'Manual'])];
 const csv='\\uFEFF'+lines.map(row=>row.map(csvCell).join(';')).join('\\r\\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='royal-financeiro.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
for(const id of ['financeFrom','financeTo','financeSearch'])$(id).addEventListener('input',displayEntries);
$('financeExport').addEventListener('click',exportFinance);
async function load(){ctx=await getBusinessContext();if(!['owner','admin'].includes(ctx.membership.role)){location.replace('./index.html');return}$('date').value=new Date().toISOString().slice(0,10);await render()}$('newBtn').onclick=()=>{if(!ctx||!['owner','admin'].includes(ctx.membership.role))return msg('Seu perfil não pode criar lançamentos.',true);$('formBox').classList.toggle('hidden')};$('form').onsubmit=async e=>{e.preventDefault();try{if(!ctx||!['owner','admin'].includes(ctx.membership.role))throw new Error('Seu perfil não pode criar lançamentos.');const{error}=await supabase.from('saas_financial_entries').insert({tenant_id:ctx.tenant.id,kind:$('kind').value,description:$('description').value.trim(),amount:Number($('amount').value),occurred_on:$('date').value,category:$('category').value.trim()||null,created_by:ctx.user.id});if(error)throw error;msg('Lançamento registrado.');$('form').reset();$('date').value=new Date().toISOString().slice(0,10);$('formBox').classList.add('hidden');await render()}catch(e){msg(e.message,true)}};load().catch(e=>msg(e.message,true));