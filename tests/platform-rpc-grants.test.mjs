import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync('supabase/sql/saas_platform_rpc_explicit_grants.sql','utf8');
const signatures=[
 'saas_platform_audit(integer,integer)',
 'saas_platform_audit_filtered(integer,integer,uuid,text,date,date)',
 'saas_platform_expel_tenant(uuid,text)',
 'saas_platform_restore_owner(uuid,text)',
 'saas_platform_set_tenant_active(uuid,boolean,text)',
 'saas_platform_tenants()'
];

test('Sensitive RPCs explicitly revoke public execution and grant only authenticated',()=>{
 for(const signature of signatures){
   assert.ok(sql.includes('revoke execute on function public.'+signature+' from public, anon, authenticated;'),signature+' missing revoke');
   assert.ok(sql.includes('grant execute on function public.'+signature+' to authenticated;'),signature+' missing allowed caller');
 }
});

test('Platform audit and usage tables do not have browser permissions',()=>{
 for(const table of ['saas_platform_actions','saas_usage_minutes']){
   assert.ok(sql.includes('revoke all on table public.'+table+' from public, anon, authenticated;'));
   assert.ok(!sql.includes('grant select on table public.'+table+' to authenticated'));
 }
});

test('Privileged data still requires server-side Super Admin AAL2 check',()=>{
 assert.match(sql,/saas_is_platform_super_admin\(\)/);
 assert.match(sql,/AAL2 session/);
 assert.doesNotMatch(sql,/grant\s+execute\s+on\s+function[^;]*\s+to\s+(?:public|anon);/i);
});
