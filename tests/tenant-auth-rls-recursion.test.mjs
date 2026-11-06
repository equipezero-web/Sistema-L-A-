import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/sql/saas_platform_admin_rls_recursion_fix.sql','utf8');

test('Super Admin check reads saas_profiles only inside private SECURITY DEFINER function',()=>{
 assert.match(sql,/create or replace function private\.saas_is_platform_super_admin\(\)/i);
 assert.match(sql,/security definer\s+set search_path = ''/i);
 const wrapper=sql.split(/create or replace function public\.saas_is_platform_super_admin\(\)/i)[1];
 assert.ok(wrapper);
 assert.match(wrapper,/security invoker\s+set search_path = ''/i);
 assert.match(wrapper,/select private\.saas_is_platform_super_admin\(\)/i);
 assert.doesNotMatch(wrapper,/from public\.saas_profiles/i);
});

test('Administrative privileges still require auth.uid and AAL2',()=>{
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/p\.is_platform_super_admin/);
 assert.match(sql,/auth\.jwt\(\) ->> 'aal'/);
 assert.match(sql,/= 'aal2'/);
});

test('Private and public helpers deny anon and PUBLIC execution',()=>{
 for(const schema of ['private','public']){
  assert.ok(sql.includes('revoke all on function '+schema+'.saas_is_platform_super_admin() from public, anon, authenticated;'));
  assert.ok(sql.includes('grant execute on function '+schema+'.saas_is_platform_super_admin() to authenticated;'));
 }
});

test('Migration does not disable RLS or loosen membership table permissions',()=>{
 assert.doesNotMatch(sql,/disable row level security|drop policy|grant all on table|update public\.saas_profiles/i);
});
