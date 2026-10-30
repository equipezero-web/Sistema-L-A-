import { supabase } from './supabase.js';

export async function getBusinessContext(){
  const { data:{ user }, error:userError }=await supabase.auth.getUser();
  if(userError||!user) throw userError||new Error('Sessão não encontrada.');
  const { data:membership,error:memberError }=await supabase.from('saas_members').select('tenant_id,role,status').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle();
  if(memberError) throw memberError;
  if(!membership) throw new Error('Nenhuma empresa ativa vinculada à conta.');
  const { data:tenant,error:tenantError }=await supabase.from('saas_tenants').select('id,name,business_mode,business_type').eq('id',membership.tenant_id).single();
  if(tenantError) throw tenantError;
  return { user, membership, tenant, canManage:['owner','admin'].includes(membership.role) };
}

export async function listProducts(tenantId){const {data,error}=await supabase.from('saas_products').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false});if(error)throw error;return data||[]}
export async function saveProduct(tenantId,p){const row={tenant_id:tenantId,name:p.name.trim(),description:p.description?.trim()||null,sku:p.sku?.trim()||null,price:Number(p.price||0),cost:Number(p.cost||0),stock_quantity:Number(p.stock_quantity||0),image_url:p.image_url?.trim()||null,status:p.status||'active'};let q=p.id?supabase.from('saas_products').update(row).eq('id',p.id).eq('tenant_id',tenantId):supabase.from('saas_products').insert(row);const{data,error}=await q.select().single();if(error)throw error;return data}
export async function archiveProduct(tenantId,id){const{error}=await supabase.from('saas_products').update({status:'archived'}).eq('tenant_id',tenantId).eq('id',id);if(error)throw error}
export async function adjustInventory(productId,delta,reason){const{data,error}=await supabase.rpc('saas_adjust_inventory',{p_product_id:productId,p_quantity_delta:Number(delta),p_reason:reason,p_reference_type:'manual',p_reference_id:null});if(error)throw error;return data}
export async function listInventoryMovements(tenantId){const{data,error}=await supabase.from('saas_inventory_movements').select('id,product_id,quantity_delta,reason,created_at,saas_products(name,sku)').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(100);if(error)throw error;return data||[]}
export async function listServices(tenantId){const{data,error}=await supabase.from('saas_services').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false});if(error)throw error;return data||[]}
export async function saveService(tenantId,s){const row={tenant_id:tenantId,name:s.name.trim(),description:s.description?.trim()||null,price:Number(s.price||0),duration_minutes:Number(s.duration_minutes||30),image_url:s.image_url?.trim()||null,status:s.status||'active'};let q=s.id?supabase.from('saas_services').update(row).eq('id',s.id).eq('tenant_id',tenantId):supabase.from('saas_services').insert(row);const{data,error}=await q.select().single();if(error)throw error;return data}
export async function archiveService(tenantId,id){const{error}=await supabase.from('saas_services').update({status:'archived'}).eq('tenant_id',tenantId).eq('id',id);if(error)throw error}
export async function listCustomers(tenantId){const{data,error}=await supabase.from('saas_customers').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false});if(error)throw error;return data||[]}
export async function saveCustomer(tenantId,c){const row={tenant_id:tenantId,name:c.name.trim(),email:c.email?.trim()||null,phone:c.phone?.trim()||null,notes:c.notes?.trim()||null,status:c.status||'active'};let q=c.id?supabase.from('saas_customers').update(row).eq('id',c.id).eq('tenant_id',tenantId):supabase.from('saas_customers').insert(row);const{data,error}=await q.select().single();if(error)throw error;return data}
export async function archiveCustomer(tenantId,id){const{error}=await supabase.from('saas_customers').update({status:'archived'}).eq('tenant_id',tenantId).eq('id',id);if(error)throw error}
export async function listEmployees(tenantId){const{data,error}=await supabase.from('saas_employees').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false});if(error)throw error;return data||[]}
export async function saveEmployee(tenantId,e){const row={tenant_id:tenantId,name:e.name.trim(),email:e.email?.trim()||null,phone:e.phone?.trim()||null,specialty:e.specialty?.trim()||null,avatar_url:e.avatar_url?.trim()||null,status:e.status||'active'};let q=e.id?supabase.from('saas_employees').update(row).eq('id',e.id).eq('tenant_id',tenantId):supabase.from('saas_employees').insert(row);const{data,error}=await q.select().single();if(error)throw error;return data}
export async function archiveEmployee(tenantId,id){const{error}=await supabase.from('saas_employees').update({status:'archived'}).eq('tenant_id',tenantId).eq('id',id);if(error)throw error}
