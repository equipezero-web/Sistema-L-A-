import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync('supabase/sql/saas_tenant_composite_fk_indexes_54.sql','utf8');
const expectations=[
 ['saas_appointments_tenant_customer_idx','saas_appointments','customer_id'],
 ['saas_appointments_tenant_employee_idx','saas_appointments','employee_id'],
 ['saas_appointments_tenant_service_idx','saas_appointments','service_id'],
 ['saas_order_items_tenant_order_idx','saas_order_items','order_id'],
 ['saas_order_items_tenant_product_idx','saas_order_items','product_id'],
 ['saas_orders_tenant_customer_idx','saas_orders','customer_id'],
];
test('All six tenant-scoped composite FKs are covered by an index with correct column order',()=>{
 const ddl=[...source.matchAll(/create\s+index\s+if\s+not\s+exists\s+(\w+)\s+on\s+public\.(\w+)\s*\(\s*tenant_id\s*,\s*(\w+)\s*\)\s*;/gi)]
   .map(([,index,table,other])=>[index,table,other]);
 assert.deepEqual(ddl,expectations);
});
test('Index migration does not mutate records, authorization or billing',()=>{
 const sql=source.replace(/--[^\n]*/g,'').trim();
 assert.doesNotMatch(sql,/\b(drop|truncate|alter|delete|insert|update|grant|revoke|security\s+definer|service_role)\b/i);
 assert.equal((sql.match(/create\s+index\s+if\s+not\s+exists/gi)||[]).length,6);
});
