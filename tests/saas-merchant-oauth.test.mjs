import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const sql=readFileSync('supabase/sql/saas_merchant_oauth_20261116.sql','utf8');
const source=readFileSync('supabase/functions/saas-merchant-oauth/index.ts','utf8');
const page=readFileSync('app/pagamentos-loja.html','utf8');
const pageCode=page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
const cleaned=pageCode.replace(/^import\s*\{[^}]+\}\s*from\s*'[^']+';\s*$/gm,'');
test('OAuth attempts use backend-only private state and single-use consumption',()=>{
 assert.match(sql,/create table if not exists private\.saas_merchant_oauth_attempts/);
 assert.match(sql,/expires_at timestamptz not null/);
 assert.match(sql,/delete from private\.saas_merchant_oauth_attempts a/);
 assert.match(sql,/a\.expires_at>now\(\)/);
 assert.match(sql,/return query\s+delete/);
 assert.match(sql,/revoke all on function public\.saas_merchant_oauth_consume\(text\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.saas_merchant_oauth_consume\(text\) to service_role/);
});
test('OAuth credentials are never exposed in a browser readable public table',()=>{
 assert.match(sql,/private\.saas_merchant_oauth_credentials/);
 assert.match(sql,/vault\.create_secret/);
 assert.match(sql,/vault\.update_secret/);
 assert.match(sql,/revoke all on private\.saas_merchant_oauth_credentials from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.saas_merchant_oauth_complete\(uuid,text,text,text,integer\) to service_role/);
 assert.doesNotMatch(page,/client_secret|access_token|refresh_token|MP_MERCHANT_CLIENT_SECRET/);
});
test('OAuth Edge Function is feature gated, verifies owner, strict callback and provider',()=>{
 assert.match(source,/MP_MERCHANT_OAUTH_ENABLED/);
 assert.match(source,/MP_MERCHANT_CLIENT_SECRET/);
 assert.match(source,/redirect!==expected/);
 assert.match(source,/client\.auth\.getUser\(\)/);
 assert.match(source,/membership\?\.role!=="owner"/);
 assert.match(source,/tenant\?\.template_code!=="virtual_store"/);
 assert.match(source,/statePattern\.test\(state\)/);
 assert.match(source,/saas_merchant_oauth_consume/);
 assert.match(source,/saas_merchant_oauth_begin/);
 assert.match(source,/saas_merchant_oauth_complete/);
 assert.match(source,/code_verifier:attempt\.code_verifier/);
 assert.match(source,/code_challenge_method","S256"/);
 assert.match(source,/https:\/\/auth\.mercadopago\.com\/authorization/);
 assert.match(source,/https:\/\/api\.mercadopago\.com\/oauth\/token/);
 assert.match(source,/https:\/\/api\.mercadopago\.com\/users\/me/);
 assert.match(source,/seller\?\.id/);
 assert.match(source,/checkout_enabled:false/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|document\.cookie|console\.log\(tokens/);
});
test('Owner interface sends no secrets and only trusts Mercado Pago official authorization URL',()=>{
 assert.match(page,/id="connectMerchant"[^>]*disabled/);
 assert.match(pageCode,/body:\{action:'status'\}/);
 assert.match(pageCode,/body:\{action:'start',tenant_id:ctx\.tenant\.id\}/);
 assert.match(pageCode,/target\.hostname!=='auth\.mercadopago\.com'/);
 assert.match(pageCode,/location\.assign\(target\.href\)/);
 assert.doesNotMatch(pageCode,/MP_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|client_secret/);
 assert.doesNotThrow(()=>new vm.Script(cleaned));
});
