import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/sql/saas_tenant_relational_integrity.sql','utf8');
const relationships=[
 {child:'saas_orders',ref:'customer_id',parent:'saas_customers',delete:'set null (customer_id)'},
 {child:'saas_order_items',ref:'order_id',parent:'saas_orders',delete:'cascade'},
 {child:'saas_order_items',ref:'product_id',parent:'saas_products',delete:'set null (product_id)'},
 {child:'saas_appointments',ref:'customer_id',parent:'saas_customers',delete:'set null (customer_id)'},
 {child:'saas_appointments',ref:'employee_id',parent:'saas_employees',delete:'set null (employee_id)'},
 {child:'saas_appointments',ref:'service_id',parent:'saas_services',delete:'set null (service_id)'},
 {child:'saas_inventory_movements',ref:'product_id',parent:'saas_products',delete:'cascade'}
];

test('All seven business references use an enforced composite foreign key with tenant_id',()=>{
 const normalized=sql.toLowerCase().replace(/\s+/g,' ');
 for(const r of relationships){
  const rule='alter table public.'+r.child+' add constraint ';
  const start=normalized.indexOf(rule);
  assert.notEqual(start,-1,'Missing child '+r.child);
  const sections=normalized.split(/alter table public\./).filter(s=>s.startsWith(r.child+' '));
  const match=sections.find(s=>s.includes('foreign key(tenant_id,'+r.ref+')')&&s.includes('references public.'+r.parent+'(tenant_id,id)'));
  assert.ok(match,r.child+'.'+r.ref+' -> '+r.parent);
  assert.ok(match.includes('on delete '+r.delete),r.child+'.'+r.ref+' deletion behavior must be preserved');
 }
});

test('Only tenant-aware unique indexes are introduced, no RLS or public grants are loosened',()=>{
 for(const table of ['saas_customers','saas_orders','saas_products','saas_employees','saas_services'])
  assert.ok(sql.includes('on public.'+table+'(tenant_id,id)'),table);
 assert.doesNotMatch(sql,/\bdisable row level security\b|\bgrant\s+all\b|\bdrop\s+policy\b|\btruncate\b|\bdelete\s+from\b/i);
});

test('Nullable references preserve tenant_id on parent deletion',()=>{
 assert.equal((sql.match(/on delete set null \([a-z_]+\);/g)||[]).length,5);
 assert.equal((sql.match(/on delete cascade;/g)||[]).length,2);
 assert.doesNotMatch(sql,/on delete set null;/i);
});
