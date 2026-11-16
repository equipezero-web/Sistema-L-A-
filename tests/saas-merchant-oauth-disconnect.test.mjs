import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/sql/saas_merchant_oauth_disconnect_20261116.sql','utf8');
const edge=readFileSync('supabase/functions/saas-merchant-oauth/index.ts','utf8');
const html=readFileSync('app/pagamentos-loja.html','utf8');
const js=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] || '';
test('Unlink removes server-side pending states and secret references in one transaction',()=>{
 assert.match(sql,/security definer set search_path=''/);
 assert.match(sql,/delete from private\.saas_merchant_oauth_attempts where tenant_id=p_tenant_id/);
 assert.match(sql,/delete from private\.saas_merchant_oauth_credentials where tenant_id=p_tenant_id/);
 assert.match(sql,/delete from vault\.secrets where id in \(v_access,v_refresh\)/);
 assert.match(sql,/set status='revoked',provider_account_label=null,connected_at=null,last_verified_at=null/);
 assert.match(sql,/revoke all on function public\.saas_merchant_oauth_disconnect\(uuid\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.saas_merchant_oauth_disconnect\(uuid\) to service_role/);
});
test('API requires owner and MFA before unlink and does not depend on OAuth feature flag',()=>{
 const guard=edge.indexOf('membership?.role!=="owner"');
 const disconnect=edge.indexOf('if(body.action==="disconnect")');
 assert.ok(guard>0&&disconnect>guard);
 assert.match(edge,/client\.auth\.mfa\.getAuthenticatorAssuranceLevel\(\)/);
 assert.match(edge,/if\(body.action==="start"&&!conf.ready\)/);
 assert.match(edge,/saas_merchant_oauth_disconnect/);
 assert.match(edge,/return reply\(\{ok:true,disconnected:true,checkout_enabled:false/);
 assert.match(edge,/authorize\.searchParams\.set\("scope","offline_access"\)/);
 assert.doesNotMatch(edge,/supabase\.from\("saas_subscriptions"\)/);
});
test('Owner receives explicit warning and local unlink stays a deliberate action',()=>{
 assert.match(html,/id="disconnectMerchant" hidden/);
 assert.match(js,/window\.confirm\(/);
 assert.match(js,/body:\{action:'disconnect',tenant_id:ctx\.tenant\.id\}/);
 assert.match(js,/result\.disconnected!==true/);
 assert.match(html,/não garante revogação da autorização no provedor/);
 assert.doesNotMatch(js,/MP_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/);
 assert.doesNotThrow(()=>new vm.Script(js.replace(/^import\s*\{[^}]+\}\s*from\s*'[^']+';\s*$/gm,'')));
});
