import {supabase} from './supabase.js';
import {getBusinessContext} from './business.js';
const get=id=>document.getElementById(id);
const show=(t,e=false)=>{const s=get('status');s.textContent=t;s.className='status show '+(e?'error':'ok')};
let ctx;
async function load(){
 const host=get('orders');host.replaceChildren();
 const {data:orders,error}=await supabase.from('saas_orders').select('id,status,created_at,total')
  .eq('tenant_id',ctx.tenant.id).in('status',['confirmed','completed']).order('created_at',{ascending:false}).limit(50);
 if(error)throw error;
 const {data:records,error:recordError}=await supabase.from('saas_order_fulfillment')
  .select('order_id,state,carrier,tracking_reference,shipping_notes')
  .eq('tenant_id',ctx.tenant.id);
 if(recordError)throw recordError;
 const {data:shipping,error:shippingError}=await supabase.from('saas_order_delivery_details')
  .select('order_id,recipient_name,email,phone,mode,postal_code,street,street_number,complement,neighborhood,city,region')
  .eq('tenant_id',ctx.tenant.id);
 if(shippingError)throw shippingError;
 const deliveryByOrder=new Map((shipping||[]).map(d=>[d.order_id,d]));
 const map=new Map((records||[]).map(f=>[f.order_id,f]));
 if(!orders?.length){host.textContent='Nenhum pedido confirmado ou concluído.';return}
 for(const o of orders){
  const current=map.get(o.id);
  const card=document.createElement('article');card.className='dash-card';
  const h=document.createElement('h3');h.textContent='Pedido '+o.id.slice(0,8)+' · '+o.status;card.append(h);
  const destination=deliveryByOrder.get(o.id);
  if(destination){
    const details=document.createElement('details');
    const summary=document.createElement('summary');summary.textContent='Dados do destinatário e entrega';
    details.append(summary);
    const p=document.createElement('p');
    const place=destination.mode==='pickup'?'Retirada no estabelecimento':
      [destination.street,destination.street_number,destination.complement,destination.neighborhood,
       destination.city,destination.region,destination.postal_code].filter(Boolean).join(', ');
    p.textContent=destination.recipient_name+' · '+destination.phone+' · '+destination.email+' · '+place;
    details.append(p);card.append(details);
  }
  const form=document.createElement('form');form.className='form-grid';
  const field=(label,type,value='',options=[])=>{
   const wrapper=document.createElement('label');wrapper.className='field';
   wrapper.append(document.createTextNode(label));
   const input=document.createElement(type==='select'?'select':'input');
   if(type==='select'){for(const [v,t] of options){const opt=document.createElement('option');opt.value=v;opt.textContent=t;input.append(opt)}}
   else{input.type='text';input.maxLength=180}
   input.value=value;wrapper.append(input);form.append(wrapper);return input;
  };
  const state=field('Etapa','select',current?.state||'preparing',[
   ['preparing','Preparando'],['ready','Pronto para envio'],['shipped','Enviado'],['delivered','Entregue'],['returned','Devolvido']]);
  const carrier=field('Transportadora','input',current?.carrier||'');carrier.maxLength=100;
  const tracking=field('Código de rastreio','input',current?.tracking_reference||'');
  const save=document.createElement('button');save.type='submit';save.className='btn primary';save.textContent='Salvar entrega';
  form.append(save);
  form.addEventListener('submit',async e=>{
   e.preventDefault();save.disabled=true;
   try{
    if(!['owner','admin'].includes(ctx.membership.role))throw Error('Acesso não autorizado.');
    const row={state:state.value,carrier:carrier.value.trim()||null,
      tracking_reference:tracking.value.trim()||null,changed_by:ctx.user.id,updated_at:new Date().toISOString()};
    let result;
    if(current)result=await supabase.from('saas_order_fulfillment').update(row).eq('tenant_id',ctx.tenant.id).eq('order_id',o.id);
    else result=await supabase.from('saas_order_fulfillment').insert({...row,tenant_id:ctx.tenant.id,order_id:o.id,state:'preparing'});
    if(result.error)throw result.error;
    show('Acompanhamento salvo.');await load();
   }catch(err){show(err.message||'Falha ao salvar entrega.',true)}finally{save.disabled=false}
  });
  card.append(form);host.append(card);
 }
}
async function boot(){
 ctx=await getBusinessContext();
 if(ctx.tenant.template_code!=='virtual_store'||!['owner','admin'].includes(ctx.membership.role)){
  location.replace('./central.html');return;
 }
 get('company').textContent=ctx.tenant.name;
 await load();
}
void boot().catch(e=>show(e.message||'Falha ao abrir entregas.',true));
