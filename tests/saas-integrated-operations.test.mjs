import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/sql/saas_operational_support_notifications_20261116.sql','utf8');
const page=readFileSync('app/central.html','utf8');
const js=readFileSync('assets/js/operations.js','utf8');
const dash=readFileSync('app/index.html','utf8');
const admin=readFileSync('assets/js/super-admin.js','utf8');
const adminPage=readFileSync('super-admin/index.html','utf8');
const css=readFileSync('assets/css/operations.css','utf8');
test('central has authenticated context and references existing business modules',()=>{
 assert.match(js,/getBusinessContext\(\)/);
 for(const name of ['Minha Loja','Equipe e funcionários','Financeiro','Royal AI','Pagamentos da loja','Plano e assinatura'])assert.ok(js.includes(name),name);
 assert.match(dash,/href="\.\/central\.html"/);
 assert.match(js,/saas_subscription_access/);
 assert.match(js,/encodeURIComponent\(context\.tenant\.slug\)/);
 assert.match(page,/role="status"/);
});
test('support tickets are tenant-scoped and cannot forge creator or alter tenant',()=>{
 assert.match(sql,/public\.saas_support_tickets/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/created_by=\(select auth\.uid\(\)\)/);
 assert.match(sql,/public\.saas_has_tenant_role\(tenant_id/);
 assert.match(sql,/grant update\(status,updated_at\)/);
 assert.doesNotMatch(sql,/grant select,insert,update on public\.saas_support_tickets to authenticated/);
 assert.match(js,/\.eq\('tenant_id',context\.tenant\.id\)/);
 assert.match(admin,/saas_support_tickets/);
 assert.match(adminPage,/id="supportQueue"/);
});
test('notifications use recipient-only RLS and a read-only inbox',()=>{
 assert.match(sql,/recipient_user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/revoke all on public\.saas_notifications from public,anon,authenticated/);
 assert.match(sql,/grant select on public\.saas_notifications to authenticated/);
 assert.match(sql,/n\.recipient_user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/grant execute on function public\.saas_mark_notification_read\(uuid\) to authenticated/);
 assert.doesNotMatch(sql,/grant update on public\.saas_notifications to authenticated/);
});
test('UI uses safe DOM for ticket and notification rendering',()=>{
 assert.match(js,/document\.createElement/);
 assert.doesNotMatch(js,/innerHTML\s*=|insertAdjacentHTML/);
 assert.match(css,/@media\(max-width:480px\)/);
 assert.match(page,/id="installButton"/);
});
test('central does not activate merchant checkout or modify illustrative dashboard',()=>{
 const payment=readFileSync('supabase/functions/saas-transparent-checkout/index.ts','utf8');
 assert.match(payment,/PAYMENT_PROCESSING_IMPLEMENTED=false/);
 assert.match(dash,/Gráfico ilustrativo/);
 assert.doesNotMatch(js,/MP_ACCESS_TOKEN|service_role|from\('saas_subscriptions'\)\.update/);
});
