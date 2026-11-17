import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=x=>readFileSync(x,'utf8');
const appearance=file('assets/js/appearance.js');
const store=file('store/index.html');
const reception=file('supabase/functions/saas-reception-admin/index.ts');
const login=file('auth/login.html');
const security=file('assets/js/account-security.js');
const recovery=file('assets/js/password-recovery.js');
const sql=file('supabase/sql/saas_model_work_items_20261117.sql');
const board=file('assets/js/model-workflow.js');
const ops=file('assets/js/operations.js');

test('reception creation and credential changes require strong MFA after verified JWT',()=>{
 assert.match(reception,/service\.auth\.getUser\(jwt\)/);
 assert.match(reception,/claims\.sub===user\.id&&claims\.aal==='aal2'/);
 assert.match(reception,/if\(assurance!=='aal2'\)/);
 assert.match(reception,/create','disable','reset-password/);
 assert.match(reception,/tenant\.template_code!=='barbershop'/);
});
test('owner can revoke sessions and password reset uses recovery event',()=>{
 assert.match(security,/getVerifiedUser\(\)/);
 assert.match(security,/signOut\(\{scope:'others'\}\)/);
 assert.match(security,/signOut\(\{scope:'global'\}\)/);
 assert.match(recovery,/resetPasswordForEmail\(email,\{redirectTo\}\)/);
 assert.match(recovery,/event==='PASSWORD_RECOVERY'/);
 assert.match(recovery,/auth\.updateUser\(\{password\}\)/);
 assert.match(login,/href="recuperar\.html"/);
});
test('editor stores tenant-scoped model content without replacing global settings',()=>{
 for(const key of ['heroHeadline','heroDescription','modelBannerFile','modelNotice','modelSectionGap'])
  assert.match(file('app/aparencia.html'),new RegExp('id="'+key+'"'));
 assert.match(appearance,/existing\.data\?\.design_settings/);
 assert.match(appearance,/modelContent/);
 assert.match(appearance,/uploadTenantAsset\(ctx\.tenant\.id,bannerFile,'branding'\)/);
 assert.match(store,/store\.design_settings\?\.modelContent/);
 assert.match(store,/catalogEl\.hidden=true/);
});
test('internal model workflow is isolated to Instagram and communication tenants',()=>{
 assert.match(sql,/enable row level security/);
 assert.match(sql,/grant update\(stage,updated_at\)/);
 assert.match(sql,/created_by=\(select auth\.uid\(\)\)/);
 assert.match(sql,/t\.template_code='instagram_orders' and kind='instagram_followup'/);
 assert.match(sql,/t\.template_code='business_communication' and kind='communication_task'/);
 assert.match(board,/getBusinessContext\(\)/);
 assert.match(board,/\.eq\('tenant_id',context\.tenant\.id\)/);
 assert.match(ops,/template:'instagram_orders'/);
 assert.match(ops,/template:'business_communication'/);
});
test('public commerce remains locked and private model data is not exposed',()=>{
 assert.match(file('supabase/functions/saas-transparent-checkout/index.ts'),/PAYMENT_PROCESSING_IMPLEMENTED=false/);
 assert.doesNotMatch(store,/from\('saas_model_work_items'\)/);
 assert.doesNotMatch(board,/MP_ACCESS_TOKEN|service_role/);
});
