import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/sql/saas_mfa_preference_private_rpc_55.sql','utf8');
const ui=readFileSync('security/setup-2fa.html','utf8');

test('MFA preference only uses a guarded private definer implementation',()=>{
 assert.match(sql,/create or replace function private\.saas_set_mfa_preference\(p_preference text\)[\s\S]*?security definer set search_path=''/i);
 assert.match(sql,/v_uid := \(select auth\.uid\(\)\)/);
 assert.match(sql,/v_uid is null[\s\S]*?authentication required/i);
 assert.match(sql,/p_preference = 'enabled' and v_aal <> 'aal2'/);
 assert.match(sql,/where user_id = v_uid/);
 assert.match(sql,/create or replace function public\.saas_set_mfa_preference\(p_preference text\)[\s\S]*?security invoker set search_path=''/i);
 assert.match(sql,/select private\.saas_set_mfa_preference\(p_preference\)/);
});
test('Only authenticated can call MFA preference; no profile field write grants',()=>{
 for(const schema of ['public','private']){
  assert.match(sql,new RegExp('revoke all on function '+schema+'\\.saas_set_mfa_preference\\(text\\) from public, anon, authenticated','i'));
  assert.match(sql,new RegExp('grant execute on function '+schema+'\\.saas_set_mfa_preference\\(text\\) to authenticated','i'));
 }
 assert.doesNotMatch(sql,/grant\s+update|disable\s+trigger|disable\s+row\s+level|drop\s+(?:table|function)/i);
});
test('Onboarding removes skip and recovers verified 2FA preference without repeating setup',()=>{
 assert.doesNotMatch(ui,/id="skip"|Agora não|declineOptionalMfa|skip\.addEventListener/);
 assert.match(ui,/Ative a verificação em duas etapas/);
 assert.match(ui,/if\(aal\.currentLevel==='aal2'\)\{await setMfaPreference\('enabled'\);next\(\);return\}/);
 assert.match(ui,/verified=true;await setMfaPreference\('enabled'\)/);
 assert.match(ui,/O 2FA já foi confirmado, mas houve falha ao salvar sua preferência/);
 assert.match(ui,/confirm\.disabled=true/);
 assert.match(ui,/confirm\.disabled=false/);
});
