import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const money=(v:number)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct=(a:number,b:number)=>b===0?(a>0?100:0):((a-b)/Math.abs(b))*100;
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
  const auth=req.headers.get('Authorization');if(!auth)return new Response(JSON.stringify({error:'Não autenticado.'}),{status:401,headers:cors});
  const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:uerr}=await sb.auth.getUser();if(uerr||!user)return new Response(JSON.stringify({error:'Sessão inválida.'}),{status:401,headers:cors});
  const body=await req.json();const tenantId=String(body.tenant_id||'');const prompt=String(body.prompt||'').trim().slice(0,2000);
  if(!tenantId||!prompt)return new Response(JSON.stringify({error:'Empresa e pergunta são obrigatórias.'}),{status:400,headers:cors});
  const {data:snapshot,error:serr}=await sb.rpc('saas_ai_role_snapshot',{p_tenant_id:tenantId});if(serr||!snapshot)return new Response(JSON.stringify({error:'Sem permissão para consultar esta empresa.'}),{status:403,headers:cors});
  const {data:member,error:memberError}=await sb.from('saas_members').select('role').eq('tenant_id',tenantId).eq('user_id',user.id).eq('status','active').maybeSingle();
  if(memberError||!member)return new Response(JSON.stringify({error:'Sem permissão para consultar esta empresa.'}),{status:403,headers:cors});
  if(member.role==='employee'){
    const p=prompt.toLowerCase();
    const products=snapshot.products||[];
    const low=products.filter((x:any)=>Number(x.stock)<=5);
    const answer=/finance|fatur|receita|despesa|saldo|lucro|custo|margem|rentab|preju|valor vendido/.test(p)
      ? 'Análises financeiras estão disponíveis apenas para Owner e Admin. Posso ajudar com estoque, agenda, serviços e clientes.'
      : /estoque|produto|venda/.test(p)
      ? (low.length?'Produtos com estoque baixo: '+low.slice(0,6).map((x:any)=>x.name+' ('+x.stock+')').join(', ')+'.':'Não encontrei produtos ativos com estoque baixo.')
      : /agenda|servi|funcion/.test(p)
      ? 'Nos últimos 30 dias houve '+(snapshot.appointments_30d||0)+' agendamento(s); '+(snapshot.completed_appointments_30d||0)+' concluído(s). Há '+(snapshot.upcoming_appointments||0)+' compromisso(s) nos próximos 7 dias.'
      : 'Resumo operacional: '+(snapshot.orders_30d||0)+' pedido(s), '+(snapshot.appointments_30d||0)+' agendamento(s) nos últimos 30 dias e '+(snapshot.active_customers||0)+' cliente(s) ativo(s). '+(low.length?low.length+' produto(s) com estoque baixo.':'');
    const {error:logError}=await sb.from('saas_ai_logs').insert({tenant_id:tenantId,user_id:user.id,prompt,response_summary:answer,status:'completed'});
    if(logError)console.error('AI log error',logError.message);
    return new Response(JSON.stringify({answer,insights:[],snapshot_at:new Date().toISOString()}),{headers:cors});
  }
  const p=prompt.toLowerCase(),fin=snapshot.financial_30d||{},prev=snapshot.financial_previous_30d||{};const income=Number(fin.income||0),expense=Number(fin.expense||0),balance=income-expense,prevIncome=Number(prev.income||0);let answer='';let insights:string[]=[];
  const lows=(snapshot.products||[]).filter((x:any)=>Number(x.stock)<=5);const topP=snapshot.top_products_30d||[],topS=snapshot.top_services_30d||[];const growth=pct(income,prevIncome);
  if(balance<0)insights.push(`Atenção: as despesas superam as receitas em ${money(Math.abs(balance))} nos últimos 30 dias.`);
  if(lows.length)insights.push(`${lows.length} produto(s) estão com estoque de até 5 unidades.`);
  if(growth>10)insights.push(`As receitas cresceram ${growth.toFixed(1)}% contra os 30 dias anteriores.`);else if(growth<-10)insights.push(`As receitas caíram ${Math.abs(growth).toFixed(1)}% contra os 30 dias anteriores.`);
  if(/estoque|produto|venda/.test(p)){answer=lows.length?`Há ${lows.length} produto(s) em atenção no estoque: ${lows.slice(0,6).map((x:any)=>`${x.name} (${x.stock})`).join(', ')}. ${topP.length?`Mais vendido no período: ${topP[0].name}, com ${topP[0].quantity} unidade(s) e ${money(topP[0].revenue)} em vendas concluídas.`:''} Priorize reposição considerando giro, margem e prazo do fornecedor.`:'Não encontrei produtos ativos com estoque de até 5 unidades. '+(topP.length?`O produto de maior giro foi ${topP[0].name}, com ${topP[0].quantity} unidade(s).`:'Ainda não há vendas concluídas suficientes para ranking de produtos.');}
  else if(/finance|fatur|receita|despesa|saldo|lucro/.test(p)){answer=`Nos últimos 30 dias: receitas ${money(income)}, despesas ${money(expense)} e saldo operacional ${money(balance)}. Em relação aos 30 dias anteriores, a receita variou ${growth.toFixed(1)}%. Foram ${snapshot.completed_orders_30d||0} pedidos concluídos, somando ${money(snapshot.order_revenue_30d||0)} em vendas concluídas. Saldo operacional não equivale necessariamente a lucro contábil.`;}
  else if(/cliente/.test(p)){answer=`Existem ${snapshot.active_customers||0} cliente(s) ativo(s). Nos últimos 30 dias houve ${snapshot.orders_30d||0} pedido(s) e ${snapshot.appointments_30d||0} agendamento(s). Use recorrência de compra e retorno à agenda como próximos indicadores de fidelização.`;}
  else if(/servi|agenda|funcion/.test(p)){answer=`Nos últimos 30 dias foram registrados ${snapshot.appointments_30d||0} agendamento(s), dos quais ${snapshot.completed_appointments_30d||0} foram concluídos. Há ${snapshot.upcoming_appointments||0} compromisso(s) nos próximos 7 dias e ${snapshot.active_employees||0} funcionário(s) ativo(s). ${topS.length?`Serviço mais realizado: ${topS[0].name}, com ${topS[0].appointments} atendimento(s).`:''}`;}
  else if(/oportun|melhor|recom|prioridade|diagn/.test(p)){answer=`Prioridades encontradas: ${insights.length?insights.join(' '):'não identifiquei alerta crítico no recorte atual.'} ${topP.length?`Produto de maior giro: ${topP[0].name}. `:''}${topS.length?`Serviço mais realizado: ${topS[0].name}. `:''}Recomendo acompanhar receita, margem, estoque crítico e conversão de pedidos/agendamentos antes de aumentar despesas.`;}
  else answer=`Resumo dos últimos 30 dias: ${snapshot.orders_30d||0} pedido(s), ${snapshot.completed_orders_30d||0} concluído(s), ${snapshot.appointments_30d||0} agendamento(s), ${snapshot.active_customers||0} cliente(s) ativo(s), receitas ${money(income)}, despesas ${money(expense)} e saldo ${money(balance)}. ${insights.join(' ')}`;
  const {error:logError}=await sb.from('saas_ai_logs').insert({tenant_id:tenantId,user_id:user.id,prompt,response_summary:answer,status:'completed'});if(logError)console.error('AI log error',logError.message);
  return new Response(JSON.stringify({answer,insights,snapshot_at:new Date().toISOString()}),{headers:cors});
 }catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:'Erro inesperado.'}),{status:500,headers:cors});}
});