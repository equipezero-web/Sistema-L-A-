import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.78.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, GET, OPTIONS",
 "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
 "Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Type":"application/json; charset=utf-8"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statePattern=/^[a-zA-Z0-9_-]{40,100}$/;
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const error=(message:string,status=400)=>reply({ok:false,error:message},status);
const configured=(key:string,collection:string)=>{
 const direct=Deno.env.get(key);if(direct)return direct;
 try{const data=JSON.parse(Deno.env.get(collection)||"{}");return typeof data.default==="string"?data.default:""}catch{return ""}
};
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const random=()=>{const b=new Uint8Array(48);crypto.getRandomValues(b);return base64url(b)};
async function hash(value:string){
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
 return [...bytes].map(v=>v.toString(16).padStart(2,"0")).join("");
}
async function challenge(value:string){
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
 return base64url(bytes);
}
function providerConfig(){
 const url=Deno.env.get("SUPABASE_URL");
 const anon=configured("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS");
 const service=configured("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
 const clientId=Deno.env.get("MP_MERCHANT_CLIENT_ID")||"";
 const clientSecret=Deno.env.get("MP_MERCHANT_CLIENT_SECRET")||"";
 const redirect=Deno.env.get("MP_MERCHANT_REDIRECT_URI")||"";
 if(!url||!anon||!service)return null;
 const expected=new URL("/functions/v1/saas-merchant-oauth",url).href;
 if(redirect!==expected)return {ready:false,reason:"Callback OAuth não configurado.",url,anon,service,redirect,clientId,clientSecret};
 const ready=Deno.env.get("MP_MERCHANT_OAUTH_ENABLED")==="true"
  && /^\d{5,30}$/.test(clientId) && clientSecret.length>=12;
 return {ready,url,anon,service,redirect,clientId,clientSecret};
}
const trustedReturn=(result:"connected"|"denied"|"error")=>{
 const destination=new URL("https://equipezero-web.github.io/Sistema-L-A-/app/pagamentos-loja.html");
 destination.searchParams.set("oauth",result);
 return new Response(null,{status:303,headers:{"Location":destination.href,"Referrer-Policy":"no-referrer","Cache-Control":"no-store"}});
};
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 const conf=providerConfig();
 if(!conf)return error("Serviço indisponível.",503);
 const admin=createClient(conf.url,conf.service,{auth:{autoRefreshToken:false,persistSession:false}});
 if(req.method==="GET"){
  const incoming=new URL(req.url);
  if(incoming.pathname!==new URL(conf.redirect||new URL("/functions/v1/saas-merchant-oauth",conf.url)).pathname)return error("Rota inválida.",404);
  const state=incoming.searchParams.get("state")||"";
  if(!statePattern.test(state))return error("Autorização inválida.",400);
  // Consume the one-time state even on denial; a replay cannot exchange a code.
  const {data:attempts,error:consumeError}=await admin.rpc("saas_merchant_oauth_consume",{p_state_hash:await hash(state)});
  if(consumeError||!Array.isArray(attempts)||attempts.length!==1)return error("Autorização expirada ou já utilizada.",410);
  const attempt=attempts[0];
  if(incoming.searchParams.has("error"))return trustedReturn("denied");
  const authCode=incoming.searchParams.get("code")||"";
  if(!conf.ready||!authCode||authCode.length>1200||!uuid.test(attempt.tenant_id))return trustedReturn("error");
  try{
   const {data:owner,error:ownerError}=await admin.from("saas_members").select("role,status")
    .eq("tenant_id",attempt.tenant_id).eq("user_id",attempt.owner_user_id).eq("status","active").maybeSingle();
   const {data:tenant,error:tenantError}=await admin.from("saas_tenants").select("template_code,active")
    .eq("id",attempt.tenant_id).maybeSingle();
   if(ownerError||tenantError||owner?.role!=="owner"||tenant?.active!==true||tenant?.template_code!=="virtual_store")
    return trustedReturn("error");
   const body=new URLSearchParams({client_id:conf.clientId,client_secret:conf.clientSecret,
     grant_type:"authorization_code",code:authCode,redirect_uri:conf.redirect,code_verifier:attempt.code_verifier});
   const response=await fetch("https://api.mercadopago.com/oauth/token",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body,
    signal:AbortSignal.timeout(12000)});
   if(!response.ok)return trustedReturn("error");
   const tokens=await response.json();
   const accountId=String(tokens?.user_id||"");
   const access=String(tokens?.access_token||"");
   const refresh=String(tokens?.refresh_token||"");
   const expires=Number(tokens?.expires_in);
   if(!/^\d{5,30}$/.test(accountId)||access.length<30||refresh.length<30||!Number.isSafeInteger(expires)||expires<60)return trustedReturn("error");
   // Confirm returned credentials identify the seller who authorized this app.
   const sellerResponse=await fetch("https://api.mercadopago.com/users/me",{
    headers:{Authorization:"Bearer "+access},signal:AbortSignal.timeout(12000)});
   if(!sellerResponse.ok)return trustedReturn("error");
   const seller=await sellerResponse.json();
   if(String(seller?.id||"")!==accountId)return trustedReturn("error");
   const {error:saveError}=await admin.rpc("saas_merchant_oauth_complete",{
    p_tenant_id:attempt.tenant_id,p_provider_account_id:accountId,
    p_access_token:access,p_refresh_token:refresh,p_expires_in:expires});
   if(saveError){console.error("Merchant credential storage failed");return trustedReturn("error")}
   return trustedReturn("connected");
  }catch(e){console.error("Merchant OAuth exchange failed",e instanceof Error?e.name:"unknown");return trustedReturn("error")}
 }
 if(req.method!=="POST")return error("Método não permitido.",405);
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer "))return error("Sessão necessária.",401);
 const client=createClient(conf.url,conf.anon,{global:{headers:{Authorization:auth}},
  auth:{autoRefreshToken:false,persistSession:false}});
 const {data:userData,error:userError}=await client.auth.getUser();
 if(userError||!userData?.user)return error("Sessão inválida.",401);
 let body:Record<string,unknown>;
 try{const raw=await req.text();if(raw.length>2048)return error("Solicitação muito grande.",413);body=JSON.parse(raw)}
 catch{return error("Solicitação inválida.",400)}
 if(!body||typeof body!=="object"||Array.isArray(body))return error("Solicitação inválida.",400);
 if(body.action==="status")return reply({ok:true,oauth_ready:conf.ready===true,checkout_enabled:false});
 if(body.action!=="start")return error("Ação inválida.",400);
 if(!conf.ready)return error("Conexão Mercado Pago ainda não configurada pelo administrador da plataforma.",503);
 const tenantId=String(body.tenant_id||"");
 if(!uuid.test(tenantId))return error("Empresa inválida.",400);
 const [{data:membership,error:memberError},{data:tenant,error:tenantError},{data:access,error:accessError}]=await Promise.all([
  client.from("saas_members").select("role,status").eq("tenant_id",tenantId).eq("user_id",userData.user.id).eq("status","active").maybeSingle(),
  client.from("saas_tenants").select("template_code,active").eq("id",tenantId).maybeSingle(),
  client.rpc("saas_my_access_summary")
 ]);
 if(memberError||tenantError||accessError||access?.is_platform_super_admin===true||membership?.role!=="owner"||
    tenant?.template_code!=="virtual_store"||tenant?.active!==true)return error("Operação não autorizada.",403);
 const state=random(),verifier=random();
 const {error:beginError}=await admin.rpc("saas_merchant_oauth_begin",{
  p_tenant_id:tenantId,p_owner_id:userData.user.id,p_state_hash:await hash(state),p_code_verifier:verifier
 });
 if(beginError)return error("Não foi possível iniciar a autorização.",503);
 const authorize=new URL("https://auth.mercadopago.com/authorization");
 authorize.searchParams.set("client_id",conf.clientId);
 authorize.searchParams.set("response_type","code");
 authorize.searchParams.set("platform_id","mp");
 authorize.searchParams.set("redirect_uri",conf.redirect);
 authorize.searchParams.set("state",state);
 authorize.searchParams.set("code_challenge",await challenge(verifier));
 authorize.searchParams.set("code_challenge_method","S256");
 return reply({ok:true,authorization_url:authorize.href,expires_in:600,checkout_enabled:false});
});
