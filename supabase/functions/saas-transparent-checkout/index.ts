import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.78.0";

const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"apikey, authorization, content-type, x-client-info",
 "Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const key=(name:string,collection:string)=>{
 const direct=Deno.env.get(name);if(direct)return direct;
 try{const j=JSON.parse(Deno.env.get(collection)||"{}");return typeof j.default==="string"?j.default:""}catch{return ""}
};
const slugPattern=/^[a-z0-9][a-z0-9-]{0,79}$/;

// This version does NOT create payments, process tokens, or fulfill orders.
// Never enable a real payment until an idempotent backend processor AND
// stock/order reconciliation are reviewed and production-tested.
const PAYMENT_PROCESSING_IMPLEMENTED=false;

Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(request.method!=="POST")return reply({ok:false,error:"Método não permitido."},405);
 let input:Record<string,unknown>;
 try{
  const raw=await request.text();
  if(raw.length>1024)return reply({ok:false,error:"Solicitação muito grande."},413);
  input=JSON.parse(raw);
 }catch{return reply({ok:false,error:"Solicitação inválida."},400)}
 if(!input||typeof input!=="object"||Array.isArray(input))
  return reply({ok:false,error:"Solicitação inválida."},400);
 if(input.action==="submit")
  return reply({ok:false,error:"Pagamentos ainda não habilitados.",checkout_enabled:false},503);
 if(input.action!=="status"||typeof input.slug!=="string"||!slugPattern.test(input.slug))
  return reply({ok:false,error:"Loja ou ação inválida."},400);
 const url=Deno.env.get("SUPABASE_URL");
 const service=key("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
 if(!url||!service)return reply({ok:false,error:"Serviço indisponível."},503);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:ready,error}=await admin.rpc("saas_transparent_checkout_readiness",{p_slug:input.slug});
 if(error)return reply({ok:false,error:"Não foi possível confirmar pagamentos."},503);
 // A configured seller alone must not activate payments.
 const candidate=Array.isArray(ready)&&ready.length===1?ready[0]:null;
 const featureEnabled=Deno.env.get("SAAS_TRANSPARENT_CHECKOUT_ENABLED")==="true";
 const enabled=PAYMENT_PROCESSING_IMPLEMENTED&&featureEnabled&&candidate?.checkout_enabled===true;
 return reply({ok:true,checkout_enabled:enabled,
  payment_methods:enabled?["credit_card","debit_card","pix","ticket"]:[],
  public_key:enabled?candidate.public_key:null,
  message:enabled?"Pagamento autorizado para esta loja.":"Checkout Transparente em homologação. Nenhuma cobrança será realizada."});
});
