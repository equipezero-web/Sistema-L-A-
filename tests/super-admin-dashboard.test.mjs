import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync('assets/js/super-admin.js','utf8');
const html=readFileSync('super-admin/index.html','utf8');
const callable=js.replace(/^import\s+.*?;\s*$/gm,'');

test('Super Admin controller parses and protected actions use correct RPCs',()=>{
 assert.doesNotThrow(()=>new vm.Script(callable));
 for(const name of [
  'saas_platform_tenants','saas_platform_audit_filtered',
  'saas_platform_restore_owner','saas_platform_expel_tenant',
  'saas_platform_set_tenant_active'
 ])assert.ok(js.includes(name),name+' not connected');
});

test('Financial attention includes inactive status and expired, missing or invalid end date',()=>{
 const begin=js.indexOf('function paymentAttention(');
 const end=js.indexOf('function drawTenants()',begin);
 assert.ok(begin>=0&&end>begin);
 const f=vm.runInNewContext(js.slice(begin,end)+'\npaymentAttention',{Date});
 assert.equal(f({subscription_status:'active',current_period_end:'2100-01-01T00:00:00Z',last_payment_status:'approved'}),false);
 assert.equal(f({subscription_status:'active',current_period_end:'2020-01-01T00:00:00Z'}),true);
 assert.equal(f({subscription_status:'active',current_period_end:null}),true);
 assert.equal(f({subscription_status:'past_due',current_period_end:'2100-01-01T00:00:00Z'}),true);
 assert.equal(f({subscription_status:null,current_period_end:null}),true);
 assert.equal(f({subscription_status:'active',current_period_end:'2100-01-01T00:00:00Z',last_payment_status:'refunded'}),true);
});

test('Active subscription count excludes expired and missing period',()=>{
 assert.match(js,/\.eq\('status', 'active'\)\.gt\('current_period_end', new Date\(\)\.toISOString\(\)\)/);
});

test('Administrative controls hidden before verified AAL2 and successful data load',()=>{
 assert.match(html,/body:not\(\.super-admin-ready\) main > section\{display:none!important\}/);
 assert.match(js,/if \(aal\.currentLevel !== 'aal2'\)/);
 assert.match(js,/await loadTenants\(\);await loadAudit\(\);document\.body\.classList\.add\('super-admin-ready'\)/);
});

test('Successful admin action is not reported as failed if refresh fails',()=>{
 assert.match(js,/show\('Ação aplicada e registrada\. Atualizando empresas e auditoria\.\.\.'\)/);
 assert.match(js,/catch\(refreshError\)/);
 assert.match(js,/A ação foi aplicada, mas não foi possível atualizar os dados/);
});
