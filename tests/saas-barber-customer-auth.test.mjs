import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/sql/saas_barber_customer_auth_66.sql','utf8');
const html=readFileSync('store/barbearia.html','utf8');
const js=readFileSync('assets/js/barber-original-template.js','utf8');
test('Registration uses verified Supabase account and an isolated customer mapping, not enterprise roles',()=>{
 assert.match(sql,/create table if not exists private\.saas_barber_customer_accounts/);
 assert.match(sql,/primary key \(tenant_id,user_id\)/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on private\.saas_barber_customer_accounts from public,anon,authenticated/);
 assert.match(sql,/u\.email_confirmed_at is not null/);
 assert.match(sql,/u\.is_anonymous is not true/);
 assert.match(sql,/private\.saas_public_store_visible/);
 assert.doesNotMatch(sql,/insert into public\.saas_members/);
});
test('Only a registered client with matching auth.uid may request a booking, and server contact is authoritative',()=>{
 assert.match(sql,/create trigger saas_barber_customer_request_guard before insert/);
 assert.match(sql,/v_user:={0,1}\(select auth\.uid\(\)\)/);
 assert.match(sql,/new\.customer_user_id:=v_user/);
 assert.match(sql,/new\.guest_name:=v_name/);
 assert.match(sql,/new\.guest_phone:=regexp_replace/);
 assert.match(sql,/pg_get_functiondef\('booking_private\.saas_barber_request_booking/);
 assert.match(sql,/v_name is null then/);
 assert.match(sql,/Limite temporário|Aguarde|p_guest_name/);
});
test('Customer history cannot be read for another auth user or company',()=>{
 assert.match(sql,/create or replace function booking_private\.saas_barber_customer_history/);
 assert.match(sql,/r\.customer_user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/a\.user_id=r\.customer_user_id/);
 assert.match(sql,/ps\.slug=p_slug/);
 assert.match(sql,/public\.saas_barber_customer_profile/);
 assert.doesNotMatch(sql,/grant execute on function public\.saas_barber_customer_history\(text\) to anon/);
});
test('Authenticated customer can read only the previously published catalog',()=>{
 assert.match(sql,/drop policy if exists saas_platform_active_guard on public\.saas_public_catalog_items/);
 assert.match(sql,/private\.saas_public_store_visible\(tenant_id\)/);
 assert.match(sql,/with check \(/);
});
test('Client interface supports signup, confirmed email, login, logout and own bookings',()=>{
 for(const id of ['saasCustomerAuthDialog','saasCustomerAuthForm','customerAuthEmail','customerAuthPassword',
  'customerSignupName','customerSignupPhone','customerSignupConsent','saasCustomerCompleteDialog',
  'customerLoginButton','customerLogoutButton','customerCompleteButton'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/supabase\.auth\.signUp/);
 assert.match(js,/emailRedirectTo:redirect/);
 assert.match(js,/supabase\.auth\.signInWithPassword/);
 assert.match(js,/supabase\.auth\.signOut/);
 assert.match(js,/rpc\('saas_barber_customer_register'/);
 assert.match(js,/rpc\('saas_barber_customer_profile'/);
 assert.match(js,/rpc\('saas_barber_customer_history'/);
 assert.match(js,/if\(!profile\)/);
 assert.match(js,/get\('saasGuestName'\)\.value=profile\.name/);
 assert.doesNotMatch(js,/localStorage\./);
 assert.doesNotThrow(()=>new vm.Script(js.replace(/^import \{ supabase \} from '\.\/supabase\.js';/,'')));
});
