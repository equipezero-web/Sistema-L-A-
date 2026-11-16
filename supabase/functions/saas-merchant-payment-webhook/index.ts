import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.78.0";

// Dedicated payment webhook for merchant sales, NOT the subscription webhook.
// This verifier records provider-confirmed payment state only. It never fulfills
// a cart, decreases stock, creates an order or activates checkout.
const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
const idPattern=/^[0-9]{1,30}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validStatus=new Set(["pending","in_process","approved","rejected","cancelled","refunded","charged_back"]);
function getKey(key:string,fallback:string){
 const direct=Deno.env.get(key);
 if(direct)return direct;
 try{const values=JSON.parse(Deno.env.get(fallback)||"{}");return typeof values.default==="string"?values.default:""}catch{return ""}
}
function constantHexEqual(a:string,b:string){
 if(a.length!==64||b.length!==64||!/^([a-f0-9]{64})$/i.test(a)||!/^([a-f0-9]{64})$/i.test(b))return false;
 let difference=0;
 for(let i=0;i<64;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
 return difference===0;
}
async function signedWebhook(request:Request,paymentId:string,secret:string){
 const signature=request.headers.get("x-signature")||"";
 const requestId=request.headers.get("x-request-id")||"";
 const ts=signature.match(/(?:^|,)\s*ts=([0-9]{10,13})(?:,|$)/)?.[1]||"";
 const v1=signature.match(/(?:^|,)\s*v1=([a-f0-9]{64})(?:,|$)/i)?.[1]||"";
 if(!ts||!v1||requestId.length<4||requestId.length>200)return false;
 const timestamp=Number(ts);
 if(!Number.isSafeInteger(timestamp))return false;
 const milliseconds=ts.length===13?timestamp:timestamp*1000;
 if(Math.abs(Date.now()-milliseconds)>5*60_000)return false;
 const message=`id:${paymentId};request-id:${requestId};ts:${ts};`;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message));
 const calculated=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
 return constantHexEqual(calculated,v1.toLowerCase());
}
Deno.serve(async(request:Request)=>{
 if(request.method!=="POST")return json({error:"Método não permitido."},405);
 const secret=Deno.env.get("MP_MERCHANT_WEBHOOK_SECRET")||"";
 if(Deno.env.get("MP_MERCHANT_WEBHOOK_ENABLED")!=="true"||secret.length<16)
  return json({error:"Webhook de lojas desativado."},503);
 const url=Deno.env.get("SUPABASE_URL");
 const service=getKey("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
 if(!url||!service)return json({error:"Serviço indisponível."},503);
 const target=new URL(request.url);
 const paymentId=target.searchParams.get("data.id")||"";
 if(!idPattern.test(paymentId))return json({error:"Identificador inválido."},400);
 if(!await signedWebhook(request,paymentId,secret))return json({error:"Assinatura inválida."},401);
 let payload:Record<string,unknown>;
 try{const text=await request.text();if(text.length>8192)return json({error:"Evento muito grande."},413);
  payload=JSON.parse(text)}
 catch{return json({error:"Evento inválido."},400)}
 if(!payload||typeof payload!=="object"||Array.isArray(payload))return json({error:"Evento inválido."},400);
 const data=payload.data as {id?:unknown}|undefined;
 const accountId=String(payload.user_id||"");
 if(payload.type!=="payment"||String(data?.id||"")!==paymentId||!idPattern.test(accountId))
  return json({error:"Evento não corresponde à assinatura."},400);

 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:sellers,error:sellerError}=await db.rpc("saas_online_payment_seller_token",{p_account_id:accountId});
 if(sellerError||!Array.isArray(sellers)||sellers.length!==1)
  return json({error:"Vendedor não autorizado."},403);
 const seller=sellers[0];
 if(String(seller.provider_account_id)!==accountId||typeof seller.access_token!=="string")
  return json({error:"Vendedor inválido."},403);
 try{
  const upstream=await fetch("https://api.mercadopago.com/v1/payments/"+paymentId,{
   headers:{"Authorization":"Bearer "+seller.access_token},
   signal:AbortSignal.timeout(12000)
  });
  if(!upstream.ok){
   console.error("Merchant payment status request failed",upstream.status);
   return json({error:"Pagamento não verificado."},502);
  }
  const payment=await upstream.json();
  const intentId=String(payment.external_reference||"");
  const paymentStatus=String(payment.status||"");
  const preference=String(payment.preference_id||payment.metadata?.saas_preference_id||"");
  const amount=Number(payment.transaction_amount);
  const collector=String(payment.collector_id||payment.collector?.id||"");
  if(String(payment.id)!==paymentId||collector!==accountId||!uuid.test(intentId)||
    !validStatus.has(paymentStatus)||!Number.isFinite(amount)||amount<0||amount>1_000_000||
    String(payment.currency_id)!=="BRL"||preference.length<8)
    return json({error:"Pagamento não corresponde ao pedido da loja."},422);
  const {data:context,error:contextError}=await db.rpc("saas_online_payment_context",{p_intent_id:intentId});
  if(contextError||!Array.isArray(context)||context.length!==1||
    String(context[0].provider_account_id)!==accountId||
    String(context[0].preference_id)!==preference||
    Math.round(Number(context[0].subtotal)*100)!==Math.round(amount*100))
    return json({error:"Pagamento não corresponde ao pedido autorizado."},422);
  const {data:recorded,error:saveError}=await db.rpc("saas_online_payment_record_verified",{
   p_intent_id:intentId,p_payment_id:paymentId,p_account_id:accountId,
   p_amount:amount,p_currency:"BRL",p_status:paymentStatus,p_preference_id:preference
  });
  if(saveError||recorded!==true)return json({error:"Não foi possível confirmar o registro."},503);
  return json({ok:true,recorded:true,fulfillment_enabled:false});
 }catch(err){
  console.error("Merchant payment webhook failure",err instanceof Error?err.name:"unknown");
  return json({error:"Falha ao verificar pagamento."},503);
 }
});
