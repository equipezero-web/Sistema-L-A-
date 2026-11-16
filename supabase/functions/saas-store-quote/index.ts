import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.78.0";

// Public, read-only quotation endpoint. It cannot reserve stock, create orders,
// initiate payment or access SaaS subscription billing credentials.
const cors={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"apikey, authorization, content-type, x-client-info",
 "Cache-Control":"no-store",
 "Content-Type":"application/json; charset=utf-8",
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern=/^[a-z0-9][a-z0-9-]{0,79}$/;
function respond(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors})}
function bad(message:string,status=400){return respond({ok:false,error:message},status)}
function validate(body:unknown){
 if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Solicitação inválida.");
 const b=body as Record<string,unknown>;
 if(typeof b.slug!=="string"||!slugPattern.test(b.slug))throw Error("Loja inválida.");
 if(!Array.isArray(b.items)||b.items.length<1||b.items.length>20)throw Error("Selecione entre 1 e 20 produtos.");
 const items=b.items.map(x=>{
  if(!x||typeof x!=="object"||Array.isArray(x))throw Error("Item inválido.");
  const item=x as Record<string,unknown>;
  if(typeof item.id!=="string"||!uuid.test(item.id)||!Number.isInteger(item.quantity)||Number(item.quantity)<1||Number(item.quantity)>99)
   throw Error("Identificador ou quantidade de produto inválida.");
  return {id:item.id.toLowerCase(),quantity:Number(item.quantity)};
 });
 if(new Set(items.map(x=>x.id)).size!==items.length)throw Error("Produtos duplicados na seleção.");
 if(items.reduce((sum,x)=>sum+x.quantity,0)>200)throw Error("A quantidade máxima da seleção é 200 unidades.");
 return {slug:b.slug,items};
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return bad("Método não permitido.",405);
 try{
  if(Number(req.headers.get("content-length")||0)>4096)return bad("Solicitação muito grande.",413);
  const raw=await req.text();
  if(raw.length>4096)return bad("Solicitação muito grande.",413);
  const payload=validate(JSON.parse(raw));
  const url=Deno.env.get("SUPABASE_URL");
  const key=Deno.env.get("SUPABASE_ANON_KEY");
  if(!url||!key)return bad("Serviço de consulta temporariamente indisponível.",503);
  // Use anon privileges, not service_role. Publication RLS applies to both reads.
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:store,error:storeError}=await db.from("saas_public_stores")
    .select("tenant_id,template_code").eq("slug",payload.slug).maybeSingle();
  if(storeError)return bad("Não foi possível verificar a loja.",503);
  if(!store||store.template_code!=="virtual_store")return bad("Loja indisponível.",404);
  const ids=payload.items.map(x=>x.id);
  const {data:catalog,error:catalogError}=await db.from("saas_public_catalog_items")
    .select("id,name,price,in_stock,item_type").eq("tenant_id",store.tenant_id)
    .eq("item_type","product").in("id",ids);
  if(catalogError)return bad("Não foi possível conferir os produtos.",503);
  const byId=new Map((catalog||[]).map(p=>[String(p.id).toLowerCase(),p]));
  let subtotalCents=0;
  const lines=[];
  for(const requested of payload.items){
   const p=byId.get(requested.id);
   if(!p||p.in_stock!==true)return bad("Um produto está indisponível. Atualize o catálogo.",409);
   const price=Number(p.price);
   if(!Number.isFinite(price)||price<0||price>1000000)return bad("Preço indisponível para este produto.",409);
   const unitCents=Math.round(price*100);
   const lineCents=unitCents*requested.quantity;
   subtotalCents+=lineCents;
   if(!Number.isSafeInteger(subtotalCents))return bad("Subtotal inválido.",400);
   lines.push({id:requested.id,name:String(p.name||"Produto"),quantity:requested.quantity,unit_cents:unitCents,total_cents:lineCents});
  }
  const now=Date.now();
  return respond({ok:true,items:lines,subtotal_cents:subtotalCents,currency:"BRL",
    issued_at:new Date(now).toISOString(),expires_at:new Date(now+120000).toISOString(),
    checkout_enabled:false,
    message:"Cotação informativa. Não reserva estoque, não cria pedidos e não cobra pagamentos."});
 }catch(e){
  if(e instanceof SyntaxError)return bad("JSON inválido.");
  if(e instanceof Error&&/inválid|Selecione|duplicados|quantidade máxima/i.test(e.message))return bad(e.message);
  console.error("Public store quote failure",e instanceof Error?e.name:"error");
  return bad("Não foi possível calcular os valores agora.",503);
 }
});
