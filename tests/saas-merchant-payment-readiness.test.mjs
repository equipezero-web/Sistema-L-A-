import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const sql=read('supabase/sql/saas_merchant_payment_readiness_68.sql');
const settings=read('app/configuracoes.html');
const panel=read('app/pagamentos-loja.html');
const code=panel.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
const clean=src=>src.replace(/^import\s*\{[^}]+\}\s*from\s*'[^']+';\s*$/gm,'');
test('Merchant state has strict owner-only read policy without browser write grants',()=>{
 assert.match(sql,/create table if not exists public\.saas_merchant_payment_connections/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.saas_merchant_payment_connections from public, anon, authenticated/);
 assert.match(sql,/grant select on public\.saas_merchant_payment_connections to authenticated/);
 assert.match(sql,/for select to authenticated/);
 assert.match(sql,/saas_has_tenant_role\(tenant_id,ARRAY\['owner'/);
 assert.doesNotMatch(sql,/grant (insert|update|delete|all) on public\.saas_merchant_payment_connections to authenticated/i);
 assert.doesNotMatch(sql,/access_token|refresh_token|client_secret|merchant_token|payment_key/i);
});
test('Status page does not solicit financial credentials or enable checkout',()=>{
 assert.match(settings,/href="\.\/pagamentos-loja\.html"/);
 assert.match(settings,/merchantPaymentsLink'\)\.hidden=context\.tenant\.template_code!=='virtual_store'/);
 assert.match(panel,/id="connectMerchant"[^>]*disabled/);
 assert.match(panel,/em preparação/);
 assert.match(panel,/getBusinessContext\(\)/);
 assert.match(code,/ctx\.membership\.role!=='owner'/);
 assert.match(code,/ctx\.tenant\.template_code!=='virtual_store'/);
 assert.match(code,/\.eq\('tenant_id',ctx\.tenant\.id\)/);
 assert.doesNotMatch(code,/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
 assert.doesNotMatch(code,/service_role|SUPABASE_SERVICE_ROLE_KEY|MP_ACCESS_TOKEN|MP_CLIENT_SECRET/);
});
test('Status page uses textContent rather than injected markup for merchant data',()=>{
 assert.match(code,/get\('merchantLabel'\)\.textContent=data\.provider_account_label/);
 assert.match(code,/get\('merchantVerified'\)\.textContent=timestamp\.toLocaleString/);
 assert.ok(code);
 assert.doesNotThrow(()=>new vm.Script(clean(code)));
});
test('Payment routes remain separate from SaaS subscription checkout',()=>{
 const billing=read('supabase/functions/saas-billing/index.ts');
 assert.match(billing,/saas_subscriptions/);
 assert.match(panel,/\.\/plano\.html/);
 assert.doesNotMatch(panel,/checkout_enabled\s*:\s*true/);
});
