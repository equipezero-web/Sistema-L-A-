import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.78.0";

const headers={"Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const reject=(message:string,status=400)=>respond({ok:false,error:message},status);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function secret(name:string,collection:string){
 const value=Deno.env.get(name);if(value)return value;
 try{const object=JSON.parse(Deno.env.get(collection)||"{}");return typeof object.default==="string"?object.default:""}catch{return ""}
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reject("Método não permitido.",405);
 const authorization=req.headers.get("Authorization")||"";
 if(!authorization.startsWith("Bearer "))return reject("Sessão obrigatória.",401);
 const url=Deno.env.get("SUPABASE_URL");
 const anon=secret("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS");
 const service=secret("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
 if(!url||!anon||!service)return reject("Integração temporariamente indisponível.",503);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},
  auth:{autoRefreshToken:false,persistSession:false}});
 const {data:auth,error:authError}=await userClient.auth.getUser();
 if(authError||!auth.user)return reject("Sessão inválida.",401);
 const {data:aal,error:aalError}=await userClient.auth.mfa.getAuthenticatorAssuranceLevel();
 if(aalError||!aal)return reject("Autenticação não verificada.",403);
 if(aal.currentLevel==="aal1"&&aal.nextLevel==="aal2")
  return reject("Confirme o segundo fator de autenticação.",403);
 let body:Record<string,unknown>;
 try{const raw=await req.text();if(raw.length>1024)return reject("Solicitação excessiva.",413);body=JSON.parse(raw)}
 catch{return reject("Solicitação inválida.",400)}
 if(!body||Array.isArray(body)||typeof body!=="object"||body.action!=="refresh"
    ||typeof body.tenant_id!=="string"||!uuid.test(body.tenant_id))
    return reject("Solicitação inválida.",400);
 const tenantId=body.tenant_id;
 const [{data:member,error:memberError},{data:tenant,error:tenantError},{data:access,error:accessError}]=await Promise.all([
  userClient.from("saas_members").select("role").eq("tenant_id",tenantId)
   .eq("user_id",auth.user.id).eq("status","active").maybeSingle(),
  userClient.from("saas_tenants").select("active,template_code").eq("id",tenantId).maybeSingle(),
  userClient.rpc("saas_my_access_summary")
 ]);
 if(memberError||tenantError||accessError||access?.is_platform_super_admin===true||
    member?.role!=="owner"||tenant?.active!==true||tenant?.template_code!=="virtual_store")
    return reject("Sem permissão.",403);
 const clientId=Deno.env.get("MP_MERCHANT_CLIENT_ID")||"";
 const clientSecret=Deno.env.get("MP_MERCHANT_CLIENT_SECRET")||"";
 if(Deno.env.get("MP_MERCHANT_OAUTH_ENABLED")!=="true"||!/^[0-9]{5,30}$/.test(clientId)||
   clientSecret.length<12)return reject("Renovação não configurada.",503);
 const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:claims,error:claimError}=await admin.rpc("saas_merchant_refresh_claim",{p_tenant_id:tenantId});
 if(claimError)return reject("Não foi possível verificar o prazo do token.",503);
 if(!Array.isArray(claims)||claims.length===0)
  return respond({ok:true,renewed:false,checkout_enabled:false,
   message:"Token não precisa ser renovado, a conta está desconectada ou já existe renovação em andamento."});
 const claim=claims[0];
 const lease=String(claim.lease_id||"");
 const accountId=String(claim.provider_account_id||"");
 const refresh=String(claim.refresh_token||"");
 if(!uuid.test(lease)||!/^[0-9]{5,30}$/.test(accountId)||refresh.length<30)
  return reject("Credenciais inválidas ou indisponíveis.",503);
 try{
  const response=await fetch("https://api.mercadopago.com/oauth/token",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({client_id:clientId,client_secret:clientSecret,
    grant_type:"refresh_token",refresh_token:refresh}),
   signal:AbortSignal.timeout(12000)});
  if(!response.ok){
   // Do not log token bodies or mark the account as revoked on network/provider errors.
   console.error("Merchant refresh returned HTTP status",response.status);
   return reject("Renovação recusada pelo provedor. Pode ser necessário autorizar a conta novamente.",409);
  }
  const token=await response.json();
  const access=String(token?.access_token||"");
  const nextRefresh=String(token?.refresh_token||"");
  const returnedAccount=String(token?.user_id||"");
  const expiry=Number(token?.expires_in);
  if(returnedAccount!==accountId||access.length<30||nextRefresh.length<30||
    !Number.isSafeInteger(expiry)||expiry<60||expiry>31536000)
    return reject("O provedor retornou credenciais inconsistentes.",409);
  if(typeof token?.scope==="string"&&!token.scope.split(/\s+/).includes("offline_access"))
    return reject("O provedor não confirmou a autorização para renovação.",409);
  const {data:committed,error:commitError}=await admin.rpc("saas_merchant_refresh_commit",{
   p_tenant_id:tenantId,p_lease_id:lease,p_account_id:accountId,
   p_access_token:access,p_refresh_token:nextRefresh,p_expires_in:expiry
  });
  if(commitError||committed!==true)return reject("Não foi possível confirmar a atualização segura.",503);
  return respond({ok:true,renewed:true,checkout_enabled:false,
   message:"Credenciais renovadas e armazenadas com segurança."});
 }catch(e){
  console.error("Merchant token refresh failed",e instanceof Error?e.name:"unknown");
  return reject("Falha ao renovar. Nenhuma compra foi habilitada.",503);
 }finally{
  // The commit already cleared the lease; release is only needed on failure.
  const {error:releaseError}=await admin.rpc("saas_merchant_refresh_release",{p_tenant_id:tenantId,p_lease_id:lease});
  if(releaseError)console.error("Merchant lease cleanup failed");
 }
});
