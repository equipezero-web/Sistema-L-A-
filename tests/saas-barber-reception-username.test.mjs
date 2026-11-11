import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/sql/saas_barber_reception_username_67.sql','utf8');
const edge=readFileSync('supabase/functions/saas-reception-admin/index.ts','utf8');
const adminPage=readFileSync('app/recepcao-contas.html','utf8');
const admin=readFileSync('assets/js/reception-admin.js','utf8');
const portalPage=readFileSync('store/recepcao.html','utf8');
const portal=readFileSync('assets/js/reception-portal.js','utf8');
const appearance=readFileSync('app/aparencia.html','utf8');

test('Reception is separate from SaaS enterprise membership and cannot be self-created',()=>{
 assert.match(sql,/create table if not exists private\.saas_reception_accounts/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on private\.saas_reception_accounts from public,anon,authenticated/);
 assert.doesNotMatch(sql,/insert into public\.saas_members/);
 assert.match(sql,/app_meta_data->>'role'='reception'/);
 assert.match(sql,/booking_private\.saas_reception_admin_link/);
 assert.match(sql,/grant execute on function public\.saas_reception_admin_link\(uuid,uuid,text\) to service_role/);
 assert.doesNotMatch(sql,/grant execute on function public\.saas_reception_admin_link\(uuid,uuid,text\) to authenticated/);
});
test('Only a real tenant owner/admin with valid JWT can provision staff',()=>{
 assert.match(edge,/service\.auth\.getUser\(jwt\)/);
 assert.match(edge,/\.eq\('user_id',user\.id\)/);
 assert.match(edge,/\['owner','admin'\]\.includes\(member\.role\)/);
 assert.match(edge,/tenant\.template_code!=='barbershop'/);
 assert.match(edge,/app_metadata:\{role:'reception',tenant_id:tenantId\}/);
 assert.match(edge,/service\.auth\.admin\.createUser/);
 assert.match(edge,/await service\.auth\.admin\.deleteUser\(staffId\)/);
 assert.match(edge,/known\.some/);
 assert.match(edge,/allowedOrigins/);
 assert.match(edge,/password\.length<12/);
});
test('Reception login is username+password, without user-entered email, and can only access scoped bookings',()=>{
 assert.match(portalPage,/id="username"/);
 assert.match(portalPage,/id="password"/);
 assert.doesNotMatch(portalPage,/id="email"|type="email"/);
 assert.match(portal,/internalEmail\(username\)/);
 assert.match(portal,/auth\.signInWithPassword/);
 assert.match(portal,/rpc\('saas_reception_dashboard'/);
 assert.match(portal,/rpc\('saas_barber_decide_request'/);
 assert.match(portal,/rpc\('saas_reception_complete'/);
 assert.doesNotMatch(portal,/saas_financial_entries|saas_customers|saas_members/);
 assert.match(sql,/a\.user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/a\.active and t\.active/);
 assert.match(sql,/public\.saas_has_commercial_access/);
});
test('Reception completes only permitted appointments and records finances idempotently',()=>{
 assert.match(sql,/saas_reception_complete\(p_appointment_id uuid\)/);
 assert.match(sql,/for update/);
 assert.match(sql,/booking_private\.saas_reception_allowed\(v_appt\.tenant_id\)/);
 assert.match(sql,/A recepção só pode concluir atendimentos de hoje/);
 assert.match(sql,/v_appt\.starts_at>now\(\)\+interval '10 minutes'/);
 assert.match(sql,/on conflict \(tenant_id,reference_type,reference_id\)/);
 assert.match(sql,/saas_guard_operational_status/);
 assert.match(sql,/tg_table_name='saas_appointments'/);
 assert.doesNotMatch(sql,/grant (?:select|update|delete) on public\.saas_financial_entries to authenticated/);
});
test('ADM manages accounts inside Minha Loja and can disable or rotate a password',()=>{
 assert.match(appearance,/id="receptionAccountsLink"/);
 assert.match(adminPage,/id="createForm"/);
 assert.match(adminPage,/id="resetDialog"/);
 assert.match(admin,/functions\.invoke\('saas-reception-admin'/);
 assert.match(admin,/call\('create'/);
 assert.match(admin,/call\('disable'/);
 assert.match(admin,/call\('reset-password'/);
 assert.match(admin,/getBusinessContext\(\)/);
});
test('Existing JS remains valid without importing original project credentials',()=>{
 const stripped=s=>s.replace(/^import\s*\{[^}]*\}\s*from\s*'[^']+';\s*/gm,'')
   .replace(/import\.meta\.url/g,"'https://equipezero-web.github.io/Sistema-L-A-/assets/js/placeholder.js'");
 assert.doesNotThrow(()=>new vm.Script(stripped(admin)));
 assert.doesNotThrow(()=>new vm.Script(stripped(portal)));
 assert.doesNotMatch(edge,/SUPABASE_SERVICE_ROLE_KEY\s*=/);
 assert.doesNotMatch(portal+/password123|admin@/i);
});
