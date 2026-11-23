import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.78.0";
import {buildMerchantPaymentRequest,verifyMerchantPaymentResult} from "../_shared/merchant-payment-contract.mjs";
import {submitMerchantPayment} from "../_shared/merchant-payment-transport.mjs";

const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"apikey, authorization, content-type, x-client-info",
 "Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const key=(name:string,collection:string)=>{
 const direct=Deno.env.get(name);if(direct)return direct;
 try{const j=JSON.parse(Deno.env.get(collection)||"{}");return typeof j.default==="string"?j.default:""}catch{return ""}
};
const slugPattern=/^[a-z0-9][a-z0-9-]{0,79}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Production stays fail-closed. Sandbox requires an explicit env gate, TEST
// public key, TEST seller access token, and the existing tenant activation.
const PAYMENT_PROCESSING_IMPLEMENTED=false;
const sandboxEnabled=()=>Deno.env.get("SAAS_CHECKOUT_SANDBOX_ENABLED")==="true";
const isTestKey=(value:unknown)=>typeof value==="string"&&/^TEST-[A-Za-z0-9-]{10,160}$/.test(value);
const isTestToken=(value:unknown)=>typeof value==="string"&&value.startsWith("TEST-")&&value.length>=20;
const validSlug=(s:unknown)=>typeof s==="string"&&slugPattern.test(s);
const validId=(s:unknown)=>typeof s==="string"&&uuid.test(s);

Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(request.method!=="POST")return reply({ok:false,error:"Método não permitido."},405);
 let input:Record<string,unknown>;
 try{
  const raw=await request.text();
  if(raw.length>12500)return reply({ok:false,error:"Solicitação muito grande."},413);
  input=JSON.parse(raw);
 }catch{return reply({ok:false,error:"Solicitação inválida."},400)}
 if(!input||typeof input!=="object"||Array.isArray(input)||!validSlug(input.slug))
  return reply({ok:false,error:"Loja inválida."},400);
 if(input.action!=="status"&&input.action!=="submit")
  return reply({ok:false,error:"Ação inválida."},400);
 const url=Deno.env.get("SUPABASE_URL");
 const service=key("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
 if(!url||!service)return reply({ok:false,error:"Serviço indisponível."},503);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:ready,error:readyError}=await admin.rpc("saas_transparent_checkout_readiness",{p_slug:input.slug});
 if(readyError)return reply({ok:false,error:"Não foi possível verificar a loja."},503);
 const candidate=Array.isArray(ready)&&ready.length===1?ready[0]:null;
 const sandboxReady=sandboxEnabled()&&candidate?.checkout_enabled===true&&isTestKey(candidate?.public_key);
 const enabled=PAYMENT_PROCESSING_IMPLEMENTED||sandboxReady;
 if(input.action==="status")return reply({ok:true,checkout_enabled:enabled,
   sandbox_only:sandboxReady,payment_methods:enabled?["credit_card","debit_card","pix"]:[],
   public_key:enabled?candidate.public_key:null,
   message:enabled?"Homologação com credenciais TEST.":"Checkout Transparente em homologação. Nenhuma cobrança será realizada."});
 if(!sandboxReady)return reply({ok:false,error:"Cobranças bloqueadas até homologação.",checkout_enabled:false},503);
 if(!validId(input.request_key)||!Array.isArray(input.items)||input.items.length<1||input.items.length>20||
    !input.delivery||typeof input.delivery!=="object"||
    !input.formData||typeof input.formData!=="object")
  return reply({ok:false,error:"Carrinho, entrega ou pagamento inválido."},400);
 const requestedItems=(input.items as unknown[]).map(item=>{
  const x=item as Record<string,unknown>;
  return {product_id:x?.id,quantity:x?.quantity};
 });
 if(requestedItems.some(x=>!validId(x.product_id)||!Number.isInteger(x.quantity)||Number(x.quantity)<1||Number(x.quantity)>99))
  return reply({ok:false,error:"Item inválido."},400);
 // The server-side RPC determines tenant from the published slug, verifies all
 // products, recalculates amounts and persists immutable delivery details.
 const {data:prepared,error:prepareError}=await admin.rpc("saas_online_checkout_prepare_secure",{
   p_slug:input.slug,p_request_key:input.request_key,p_items:requestedItems,p_delivery:input.delivery
 });
 if(prepareError||!Array.isArray(prepared)||prepared.length!==1)
  return reply({ok:false,error:"Não foi possível preparar esta compra. Revise o carrinho e o endereço."},409);
 const intent=prepared[0];
 if(!validId(intent.intent_id)||!validId(intent.attempt_id)||
    !Number.isSafeInteger(Number(intent.amount_cents))||
    Date.parse(intent.expires_at)<=Date.now())
  return reply({ok:false,error:"Cotação inválida ou expirada."},409);
 const {data:sellers,error:sellerError}=await admin.rpc("saas_online_checkout_seller_secret",{p_slug:input.slug});
 if(sellerError||!Array.isArray(sellers)||sellers.length!==1||!isTestToken(sellers[0].access_token)||
    !isTestKey(sellers[0].public_key)||String(sellers[0].tenant_id)!==String(candidate.tenant_id))
  return reply({ok:false,error:"Credenciais TEST do vendedor não autorizadas."},503);
 const seller=sellers[0];
 const delivery=input.delivery as Record<string,unknown>;
 const form=input.formData as Record<string,unknown>;
 if(String(form?.payer?.email||"").trim().toLowerCase()!==String(delivery.email||"").trim().toLowerCase())
  return reply({ok:false,error:"E-mail do comprador inconsistente."},400);
 let req;
 try{
  req=buildMerchantPaymentRequest({intentId:intent.intent_id,attemptId:intent.attempt_id,
    subtotalCents:Number(intent.amount_cents),formData:form});
 }catch{return reply({ok:false,error:"Dados do método de pagamento inválidos."},400)}
 const result=await submitMerchantPayment({
  merchantAccessToken:seller.access_token,idempotencyKey:req.idempotencyKey,payload:req.payload,
  signal:AbortSignal.timeout(12000)
 });
 if(result.kind==="unknown")
  return reply({ok:false,payment_state:"unknown",error:"Resultado não confirmado. Não tente novamente com outra chave; consulte o pagamento."},202);
 if(result.kind==="rejected")
  return reply({ok:false,payment_state:"rejected",error:"Pagamento recusado pelo provedor."},422);
 const checked=verifyMerchantPaymentResult(result.payment,{
  intentId:intent.intent_id,accountId:seller.account_id,subtotalCents:Number(intent.amount_cents)
 });
 if(!checked)return reply({ok:false,payment_state:"needs_review",error:"Pagamento recebido com divergência. A conciliação precisa de revisão."},503);
 const {data:bound,error:bindError}=await admin.rpc("saas_online_transparent_bind_payment",{
  p_intent_id:intent.intent_id,p_payment_id:checked.paymentId,
  p_account_id:seller.account_id,p_amount:Number(intent.amount_cents)/100
 });
 if(bindError||bound!==true)return reply({ok:false,payment_state:"needs_review",error:"Pagamento emitido, mas vínculo pendente. Não tente pagar novamente."},503);
 const {data:recorded,error:reconcileError}=await admin.rpc("saas_online_transparent_reconcile_attempt",{
  p_intent_id:intent.intent_id,p_payment_id:checked.paymentId,p_account_id:seller.account_id,
  p_amount:Number(intent.amount_cents)/100,p_currency:"BRL",p_status:checked.status
 });
 if(reconcileError||recorded!==true)return reply({ok:false,payment_state:"needs_review",error:"Pagamento emitido, mas conciliação pendente."},503);
 let settlement="awaiting_approval";
 if(checked.status==="approved"){
  const {data:state,error:e}=await admin.rpc("saas_online_settle_verified_payment",{p_intent_id:intent.intent_id});
  settlement=e?"needs_review":String(state);
 }
 return reply({ok:true,payment_id:checked.paymentId,payment_status:checked.status,settlement,
  message:checked.status==="approved"&&settlement==="fulfilled"?"Compra confirmada.":
    "Pagamento registrado. Acompanhe a confirmação antes de fazer outro pedido."});
});
