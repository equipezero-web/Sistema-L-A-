import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const sales=readFileSync('assets/js/vendas.js','utf8');
const appointments=readFileSync('assets/js/agenda.js','utf8');

test('Sales embed identifies the tenant-scoped customer FK explicitly',()=>{
 assert.match(sales,/saas_customers!saas_orders_tenant_customer_fkey\(name\)/);
 assert.doesNotMatch(sales,/saas_customers\(name\)/);
 assert.match(sales,/\.eq\('tenant_id',ctx\.tenant\.id\)/);
});
test('Appointments embed identifies the tenant-scoped customer FK explicitly',()=>{
 assert.match(appointments,/saas_customers!saas_appointments_tenant_customer_fkey\(name\)/);
 assert.doesNotMatch(appointments,/saas_customers\(name\)/);
 assert.match(appointments,/\.eq\('tenant_id',context\.tenant\.id\)/);
});
test('Both scripts are valid JavaScript',()=>{
 for(const source of [sales,appointments])
  assert.doesNotThrow(()=>new vm.Script(source.replace(/import\s*\{?[^;]*?from\s*'[^']+';?/g,'')));

});
