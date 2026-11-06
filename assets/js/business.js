import { supabase } from './supabase.js';

let usageStarted=false;
function redirectToDashboard(){
  const destination=new URL('../../app/index.html',import.meta.url).href;
  if(location.href!==destination)location.replace(destination);
}
function recordActiveUsage(tenantId){
  if(usageStarted)return;
  usageStarted=true;
  let inFlight=false,stopped=false;
  const tick=async()=>{
    if(stopped||inFlight||document.visibilityState!=='visible'||!document.hasFocus())return;
    inFlight=true;
    try{
      const {error}=await supabase.rpc('saas_record_usage',{p_tenant_id:tenantId});
      if(error&&/Acesso negado ou empresa desativada/i.test(error.message||'')){
        stopped=true;
        clearInterval(interval);
        redirectToDashboard();
      }
    }catch(error){console.warn('Registro de uso indisponível:',error)}
    finally{inFlight=false}
  };
  const interval=setInterval(tick,60000);
  void tick();
}
export async function getBusinessContext(){
  const { data:{ user }, error:userError }=await supabase.auth.getUser();
  if(userError||!user){location.replace(new URL('../../auth/login.html',import.meta.url).href);throw userError||new Error('Sessão não encontrada.');}
  const {data:aal,error:aalError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aalError||!aal)throw aalError||new Error('Não foi possível confirmar a proteção da sessão.');
  if(aal.currentLevel==='aal1'&&aal.nextLevel==='aal2'){
    location.replace(new URL('../../auth/login.html',import.meta.url).href);
    throw new Error('Confirme o segundo fator de autenticação para continuar.');
  }
  // A platform administrator must not accidentally operate inside a tenant dashboard.
  const {data:access,error:accessError}=await supabase.rpc('saas_my_access_summary');
  if(accessError||!access)throw accessError||new Error('Não foi possível verificar o perfil da conta.');
  if(access.is_platform_super_admin===true){
    location.replace(new URL('../../super-admin/index.html',import.meta.url).href);
    throw new Error('Use o painel Super Admin para esta conta.');
  }
  const { data:membership,error:memberError }=await supabase.from('saas_members').select('tenant_id,role,status').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle();
  if(memberError) throw memberError;
  if(!membership){redirectToDashboard();throw new Error('Nenhuma empresa ativa vinculada à conta.');}
  const { data:tenant,error:tenantError }=await supabase.from('saas_tenants').select('id,name,business_mode,business_type,active').eq('id',membership.tenant_id).single();
  if(tenantError) throw tenantError;
  if(!tenant.active){redirectToDashboard();throw new Error('Empresa desativada pela plataforma.');}
  recordActiveUsage(tenant.id);return { user, membership, tenant, canManage:['owner','admin'].includes(membership.role) };
}

export async function uploadTenantAsset(tenantId,file,folder='catalog'){
  if(!file) return null;
  const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
  const ext=extensions[file.type];
  if(!ext) throw new Error('Formato não permitido. Use PNG, JPG ou WEBP.');
  if(!Number.isFinite(file.size)||file.size<=0||file.size>5*1024*1024) throw new Error('A imagem deve ter entre 1 byte e 5 MB.');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) throw new Error('Identificador da empresa inválido.');
  if(!['branding','products','services','catalog'].includes(folder)) throw new Error('Pasta de imagem não permitida.');
  const path=`tenants/${tenantId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const {error}=await supabase.storage.from('saas-public-assets').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
  if(error) throw error;
  return supabase.storage.from('saas-public-assets').getPublicUrl(path).data.publicUrl;
}

const PRODUCT_PUBLIC_COLUMNS='id,tenant_id,name,description,sku,price,stock_quantity,image_url,status,created_at,updated_at,published';
export async function listProducts(tenantId,role='employee'){
 const {data,error}=await supabase.from('saas_products').select(PRODUCT_PUBLIC_COLUMNS).eq('tenant_id',tenantId).order('created_at',{ascending:false});
 if(error)throw error;
 const products=data||[];
 if(!['owner','admin'].includes(role))return products;
 const {data:costs,error:costError}=await supabase.rpc('saas_manager_product_costs',{p_tenant_id:tenantId});
 if(costError)throw costError;
 const byId=new Map((costs||[]).map(entry=>[entry.id,Number(entry.cost)]));
 return products.map(product=>({...product,cost:byId.get(product.id)??0}));
}
export async function saveProduct(tenantId,p){if(!p.id){const{data,error}=await supabase.rpc('saas_create_product',{p_tenant_id:tenantId,p_name:p.name.trim(),p_description:p.description?.trim()||null,p_sku:p.sku?.trim()||null,p_price:Number(p.price||0),p_cost:Number(p.cost||0),p_initial_stock:Number(p.stock_quantity||0),p_image_url:p.image_url?.trim()||null,p_status:p.status||'active'});if(error)throw error;if(p.published)await setProductPublished(tenantId,data.id,true);return data}const row={tenant_id:tenantId,name:p.name.trim(),description:p.description?.trim()||null,sku:p.sku?.trim()||null,price:Number(p.price||0),cost:Number(p.cost||0),image_url:p.image_url?.trim()||null,status:p.status||'active',published:!!p.published};const{data,error}=await supabase.from('saas_products').update(row).eq('id',p.id).eq('tenant_id',tenantId).select(PRODUCT_PUBLIC_COLUMNS).single();if(error)throw error;return {...data,cost:row.cost}}
export async function setProductPublished(tenantId,id,published){const{error}=await supabase.from('saas_products').update({published:!!published}).eq('tenant_id',tenantId).eq('id',id);if(error)throw error}
export async function archiveProduct(tenantId,id){const{error}=await supabase.from('saas_products').update({status:'archived',published:false}).eq('tenant_id',tenantId).eq('id',id);if(error)throw error}
export async function adjustInventory(productId,delta,reason){const{data,error}=await supabase.rpc('saas_adjust_inventory',{p_product_id:productId,p_quantity_delta:Number(delta),p_reason:reason,p_reference_type:'manual',p_reference_id:null});if(error)throw error;return data}
export async function listInventoryMovements(tenantId){const{data,error}=await supabase.from('saas_inventory_movements').select('id,product_id,quantity_delta,reason,created_at,saas_products(name,sku)').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(100);if(error)throw error;return data||[]}
export async function listServices(tenantId){const{data,error}=await supabase.from('saas_services').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false});if(error)throw error;return data||[]}
export async function saveService(tenantId,s){const row={tenant_id:tenantId,name:s.name.trim(),description:s.description?.trim()||null,price:Number(s.price||0),duration_minutes:Number(s.duration_minutes||30),image_url:s.image_url?.trim()||null,status:s.status||'active',published:!!s.published};let q=s.id?supabase.from('saas_services').update(row).eq('id',s.id).eq('tenant_id',tenantId):supabase.from('saas_services').insert(row);const{data,error}=await q.select().single();if(error)throw error;return data}
export async function setServicePublished(tenantId,id,published){const{error}=await supabase.from('saas_services').update({published:!!published}).eq('tenant_id',tenantId).eq('id',id);if(error)throw error}
export async function archiveService(tenantId,id){const{error}=await supabase.from('saas_services').update({status:'archived',published:false}).eq('tenant_id',tenantId).eq('id',id);if(error)throw error}
export async function listCustomers(tenantId){const{data,error}=await supabase.from('saas_customers').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false});if(error)throw error;return data||[]}
export async function saveCustomer(tenantId,c){const row={tenant_id:tenantId,name:c.name.trim(),email:c.email?.trim()||null,phone:c.phone?.trim()||null,notes:c.notes?.trim()||null,status:c.status||'active'};let q=c.id?supabase.from('saas_customers').update(row).eq('id',c.id).eq('tenant_id',tenantId):supabase.from('saas_customers').insert(row);const{data,error}=await q.select().single();if(error)throw error;return data}
export async function archiveCustomer(tenantId,id){const{error}=await supabase.from('saas_customers').update({status:'archived'}).eq('tenant_id',tenantId).eq('id',id);if(error)throw error}
export async function listEmployees(tenantId){const{data,error}=await supabase.from('saas_employees').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false});if(error)throw error;return data||[]}
export async function saveEmployee(tenantId,e){const row={tenant_id:tenantId,name:e.name.trim(),email:e.email?.trim()||null,phone:e.phone?.trim()||null,specialty:e.specialty?.trim()||null,avatar_url:e.avatar_url?.trim()||null,status:e.status||'active'};let q=e.id?supabase.from('saas_employees').update(row).eq('id',e.id).eq('tenant_id',tenantId):supabase.from('saas_employees').insert(row);const{data,error}=await q.select().single();if(error)throw error;return data}
export async function archiveEmployee(tenantId,id){const{error}=await supabase.from('saas_employees').update({status:'archived'}).eq('tenant_id',tenantId).eq('id',id);if(error)throw error}
