import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const sql=readFileSync('supabase/sql/saas_business_templates_61.sql','utf8');
const onboard=readFileSync('onboarding/index.html','utf8');
const settings=readFileSync('app/configuracoes.html','utf8');
const store=readFileSync('store/index.html','utf8');
const supported=['generic','barbershop','virtual_store','instagram_orders','business_communication'];

test('All five models are selected during onboarding, never switched from tenant settings',()=>{
 for(const key of supported){
   assert.match(sql,new RegExp("'"+key+"'"),"missing DB model "+key);
   assert.match(onboard,new RegExp('value="'+key+'"'),"missing onboarding choice "+key);
   assert.doesNotMatch(settings,new RegExp('value="'+key+'"'),"model must not be switchable in settings: "+key);
 }
 assert.match(sql,/alter table public\.saas_tenants/);
 assert.match(sql,/alter table public\.saas_public_stores/);
 assert.match(sql,/template_code text not null default 'generic'/);
});
test('Existing barber tenant migrates without altering owner, subscription or trial eligibility',()=>{
 assert.match(sql,/lower\(coalesce\(business_type,''\)\) like '%barbear%'/);
 assert.match(sql,/template_code='barbershop'/);
 assert.match(sql,/not public\.saas_has_commercial_access\(p_tenant_id\)/);
 assert.match(sql,/not t\.onboarding_completed or not th\.published/);
 assert.doesNotMatch(sql,/insert into public\.saas_subscriptions|update public\.saas_subscriptions|delete from public\.saas_subscriptions/);
 assert.doesNotMatch(sql,/drop table|truncate|disable row level security|disable trigger/i);
});
test('New onboarding RPC retains the original atomic creation and verifies the owner',()=>{
 assert.match(sql,/create or replace function public\.saas_onboard_company_template/);
 assert.match(sql,/language plpgsql security invoker set search_path=''/);
 assert.match(sql,/if \(select auth\.uid\(\)\) is null/);
 assert.match(sql,/v_tenant := public\.saas_onboard_company\(/);
 assert.match(sql,/where id=v_tenant\.id and owner_user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/revoke all on function public\.saas_onboard_company_template/);
 assert.match(sql,/grant execute on function public\.saas_onboard_company_template[\s\S]*?to authenticated/);
 assert.match(onboard,/rpc\('saas_onboard_company_template'/);
 assert.match(onboard,/p_template_code: templateCode\.value/);
});
test('Store mirrors template identifier via existing published-only sync and no additional public tables',()=>{
 assert.match(sql,/public\.saas_sync_public_store\(p_tenant_id uuid\)/);
 assert.match(sql,/template_code=excluded\.template_code/);
 assert.match(sql,/th\.published/);
 assert.match(store,/from\('saas_public_stores'\)/);
 assert.match(store,/saas_public_catalog_items/);
 assert.match(store,/template_code,logo_url/);
 assert.doesNotMatch(store,/from\('saas_customers'\)|from\('saas_members'\)|from\('saas_financial_entries'\)/);
});
test('Frontend code parses as JavaScript without importing source project credentials',()=>{
 const s=store.match(/<script type="module">([\s\S]+?)<\/script>/)?.[1];
 const o=onboard.match(/<script type="module">([\s\S]+?)<\/script>/)?.[1];
 assert.ok(s&&o);
 assert.doesNotThrow(()=>new vm.Script(s.replace(/^import\s*\{[^}]*\}\s*from\s*'[^']+';/,'')));
 assert.doesNotThrow(()=>new vm.Script(o.replace(/^import\s*\{[^}]*\}\s*from\s*'[^']+';\s*/gm,'')));
 assert.doesNotMatch(sql+store+onboard+settings,/service_role_key|MP_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/i);
});
