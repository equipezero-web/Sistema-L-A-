// Provisioning of reception users is ONLY available to authenticated owner/admin.
// The public signup endpoint NEVER creates reception accounts.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.78.0?target=deno';

const baseUrl=Deno.env.get('SUPABASE_URL')||'';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const allowedOrigins=new Set(['https://equipezero-web.github.io']);
const uuidRx=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usernameRx=/^[a-z][a-z0-9._-]{2,19}$/;
const service=createClient(baseUrl,serviceKey,{
 auth:{persistSession:false,autoRefreshToken:false}
});
function cors(origin:string|null){
 const valid=origin&&allowedOrigins.has(origin);
 return {'Content-Type':'application/json',
  ...(valid?{'Access-Control-Allow-Origin':origin,
     'Access-Control-Allow-Methods':'POST,OPTIONS',
     'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
     'Vary':'Origin'}:{})};
}
function response(payload:unknown,status:number,origin:string|null){
 return new Response(JSON.stringify(payload),{status,headers:cors(origin)});
}
function internalAddress(tenantId:string,username:string){
 return 'r.'+tenantId.replaceAll('-','')+'.'+username+'@accounts.example.invalid';
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin');
 if(origin&&!allowedOrigins.has(origin))
  return response({error:'Origem não permitida.'},403,origin);
 if(req.method==='OPTIONS')
  return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=='POST')return response({error:'Método não permitido.'},405,origin);
 if(!baseUrl||!serviceKey)return response({error:'Serviço não configurado.'},503,origin);
 const authorization=req.headers.get('authorization')||'';
 const jwt=authorization.replace(/^Bearer\s+/i,'');
 if(!jwt||jwt===authorization)return response({error:'Sessão administrativa necessária.'},401,origin);
 try{
  const {data:identity,error:identityError}=await service.auth.getUser(jwt);
  const user=identity?.user;
  if(identityError||!user)return response({error:'Sessão inválida.'},401,origin);
  const raw=await req.text();
  if(raw.length>2000)return response({error:'Solicitação muito grande.'},413,origin);
  const body=JSON.parse(raw);
  const tenantId=String(body.tenant_id||'');
  const action=String(body.action||'');
  if(!uuidRx.test(tenantId))return response({error:'Empresa inválida.'},400,origin);
  const [{data:member,error:memberError},{data:tenant,error:tenantError}]=await Promise.all([
   service.from('saas_members').select('role,status')
    .eq('tenant_id',tenantId).eq('user_id',user.id).eq('status','active').maybeSingle(),
   service.from('saas_tenants').select('id,active,template_code')
    .eq('id',tenantId).maybeSingle()
  ]);
  if(memberError||tenantError||!member||!tenant||!tenant.active||
     tenant.template_code!=='barbershop'||!['owner','admin'].includes(member.role))
   return response({error:'Somente o administrador da barbearia pode gerenciar a recepção.'},403,origin);

  const {data:accounts,error:listError}=await service.rpc('saas_reception_admin_accounts',{
   p_tenant_id:tenantId
  });
  if(listError)throw listError;
  const known=Array.isArray(accounts)?accounts:[];
  if(action==='list')return response({ok:true,accounts:known},200,origin);

  if(action==='create'){
   const username=String(body.username||'').trim().toLowerCase();
   const password=String(body.password||'');
   if(!usernameRx.test(username))
    return response({error:'Usuário deve ter entre 3 e 20 caracteres: letras, números, ponto, hífen ou sublinhado.'},400,origin);
   if(password.length<12||password.length>72||
      !/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password))
    return response({error:'A senha deve ter de 12 a 72 caracteres, com letras maiúsculas, minúsculas e número.'},400,origin);
   if(known.some((account:{username:string})=>account.username===username))
    return response({error:'Este usuário já existe nesta empresa.'},409,origin);
   const {data:created,error:createError}=await service.auth.admin.createUser({
    email:internalAddress(tenantId,username),password,email_confirm:true,
    app_metadata:{role:'reception',tenant_id:tenantId}
   });
   if(createError||!created?.user)
    return response({error:createError?.message||'Não foi possível criar a conta de recepção.'},400,origin);
   const staffId=created.user.id;
   const {error:linkError}=await service.rpc('saas_reception_admin_link',{
    p_tenant_id:tenantId,p_user_id:staffId,p_username:username
   });
   if(linkError){
    await service.auth.admin.deleteUser(staffId);
    throw linkError;
   }
   return response({ok:true,username},201,origin);
  }
  const staffId=String(body.user_id||'');
  const account=known.find((a:{user_id:string})=>a.user_id===staffId);
  if(!account||!uuidRx.test(staffId))
   return response({error:'Conta de recepção não encontrada.'},404,origin);
  if(action==='disable'){
   const {data:disabled,error}=await service.rpc('saas_reception_admin_disable',{
    p_tenant_id:tenantId,p_user_id:staffId
   });
   if(error||disabled!==true)throw error||new Error('Não foi possível desativar.');
   const ban=await service.auth.admin.updateUserById(staffId,{ban_duration:'876000h'});
   if(ban.error)console.warn('Reception auth ban pending',ban.error.message);
   return response({ok:true,disabled:true},200,origin);
  }
  if(action==='reset-password'){
   if(account.active!==true)return response({error:'A conta está desativada.'},409,origin);
   const password=String(body.password||'');
   if(password.length<12||password.length>72||!/[a-z]/.test(password)||
      !/[A-Z]/.test(password)||!/[0-9]/.test(password))
    return response({error:'Senha deve ter 12-72 caracteres, maiúsculas, minúsculas e número.'},400,origin);
   const {error}=await service.auth.admin.updateUserById(staffId,{password});
   if(error)throw error;
   return response({ok:true,updated:true},200,origin);
  }
  return response({error:'Ação inválida.'},400,origin);
 }catch(error){
  console.error('Reception admin provisioning error',error instanceof Error?error.message:'unknown');
  return response({error:'Não foi possível concluir a solicitação. Confira os dados e tente novamente.'},500,origin);
 }
});
