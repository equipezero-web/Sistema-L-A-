import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.78.0";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const enc=new TextEncoder();
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
async function validSignature(req:Request,dataId:string,secret:string){const sig=req.headers.get('x-signature')||'';const requestId=req.headers.get('x-request-id')||'';let ts='',v1='';for(const part of sig.split(',')){const [k,v]=part.split('=',2).map(x=>x?.trim());if(k==='ts')ts=v||'';if(k==='v1')v1=v||'';}if(!ts||!v1)return false;const manifest=`id:${dataId};request-id:${requestId};ts:${ts};`;const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const raw=await crypto.subtle.sign('HMAC',key,enc.encode(manifest));const hex=[...new Uint8Array(raw)].map(b=>b.toString(16).padStart(2,'0')).join('');return safeEqual(hex,v1);}
async function mpGet(path:string,token:string){const r=await fetch(`https://api.mercadopago.com${path}`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`Mercado Pago ${r.status}`);return await r.json();}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return json({ok:true});
 const mpToken=Deno.env.get('MP_ACCESS_TOKEN');const whSecret=Deno.env.get('MP_WEBHOOK_SECRET');const url=Deno.env.get('SUPABASE_URL');const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!mpToken||!whSecret||!url||!serviceKey)return json({error:'billing secrets not configured'},503);
 let body:any={};try{body=await req.json();}catch{return json({error:'invalid json'},400);}
 const u=new URL(req.url);const dataId=String(u.searchParams.get('data.id')||body?.data?.id||'');const type=String(u.searchParams.get('type')||body?.type||'');
 if(!dataId)return json({error:'missing data id'},400);
 if(!await validSignature(req,dataId,whSecret))return json({error:'invalid signature'},401);
 const sb=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const eventKey=String(body?.id||`${type}:${dataId}:${req.headers.get('x-request-id')||''}`);
 const {data:existing}=await sb.from('saas_billing_webhook_events').select('event_key,status').eq('event_key',eventKey).maybeSingle();if(existing?.status==='processed')return json({ok:true,duplicate:true});
 await sb.from('saas_billing_webhook_events').upsert({event_key:eventKey,provider:'mercado_pago',event_type:type,resource_id:dataId,status:'received',payload:body},{onConflict:'event_key'});
 try{
  let pre:any=null, invoice:any=null;
  if(type==='subscription_authorized_payment'){invoice=await mpGet(`/authorized_payments/${encodeURIComponent(dataId)}`,mpToken);pre=await mpGet(`/preapproval/${encodeURIComponent(String(invoice.preapproval_id))}`,mpToken);}
  else if(type==='subscription_preapproval'){pre=await mpGet(`/preapproval/${encodeURIComponent(dataId)}`,mpToken);const search=await mpGet(`/authorized_payments/search?preapproval_id=${encodeURIComponent(String(pre.id))}`,mpToken);const results=Array.isArray(search?.results)?search.results:[];invoice=results.sort((a:any,b:any)=>String(b.last_modified||b.date_created||'').localeCompare(String(a.last_modified||a.date_created||'')))[0]||null;}
  else {await sb.from('saas_billing_webhook_events').update({status:'ignored',processed_at:new Date().toISOString()}).eq('event_key',eventKey);return json({ok:true,ignored:true});}
  const tenantId=String(pre?.external_reference||invoice?.external_reference||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId))throw new Error('invalid external reference');
  // Trust a signed notification only for the exact subscription registered locally.
  // Never activate another tenant or an unrelated preapproval by external_reference alone.
  const {data:subscription,error:subscriptionError}=await sb.from('saas_subscriptions')
    .select('provider,provider_subscription_id,plan_id').eq('tenant_id',tenantId).maybeSingle();
  const {data:royalPlan,error:planError}=await sb.from('saas_plans')
    .select('id').eq('code','royal-30').maybeSingle();
  if(subscriptionError||planError||!royalPlan||!subscription||
     subscription.provider!=='mercado_pago'||subscription.provider_subscription_id!==String(pre?.id||'')||
     subscription.plan_id!==royalPlan.id)throw new Error('unregistered or mismatched subscription');
  const paymentStatus=invoice?.payment?.status?String(invoice.payment.status):null;const paymentId=invoice?.payment?.id?String(invoice.payment.id):null;const periodEnd=pre?.next_payment_date||null;
  const {error}=await sb.rpc('saas_apply_provider_subscription_service',{p_tenant_id:tenantId,p_provider:'mercado_pago',p_provider_subscription_id:String(pre.id),p_provider_status:String(pre.status||''),p_payment_id:paymentId,p_payment_status:paymentStatus,p_period_end:periodEnd});if(error)throw error;
  await sb.from('saas_billing_webhook_events').update({status:'processed',processed_at:new Date().toISOString(),error_message:null}).eq('event_key',eventKey);return json({ok:true});
 }catch(e){const message=e instanceof Error?e.message:'webhook error';await sb.from('saas_billing_webhook_events').update({status:'error',error_message:message.slice(0,500),processed_at:new Date().toISOString()}).eq('event_key',eventKey);return json({error:'processing failed'},500);}
});