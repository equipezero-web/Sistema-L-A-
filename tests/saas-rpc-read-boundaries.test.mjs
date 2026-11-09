import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/sql/saas_rpc_private_read_boundaries.sql','utf8');
const routines=[
 {name:'saas_manager_product_costs',args:'p_tenant_id uuid',call:'p_tenant_id'},
 {name:'saas_my_access_summary',args:'',call:''},
 {name:'saas_my_platform_notice',args:'',call:''}
];

function routine(schema,name){
 const head='create or replace function '+schema+'.'+name+'(';
 const start=sql.toLowerCase().indexOf(head.toLowerCase());
 assert.notEqual(start,-1,head);
 return sql.slice(start).split(/;\s*\n\s*(?=create or replace function|revoke all on function)/)[0];
}

test('Every Data API wrapper delegates to the corresponding private function without definer',()=>{
 for(const {name,args,call} of routines){
  const body=routine('public',name);
  assert.match(body,/security invoker set search_path=''/i);
  assert.ok(body.includes('select private.'+name+'('+call+');'));
  assert.ok(body.includes('returns jsonb'));
  assert.ok(sql.includes('function public.'+name+'('+args+')'));
 }
});
test('Privileged readers remain private with empty search path and authenticated-only EXECUTE',()=>{
 for(const {name,args} of routines){
  const body=routine('private',name);
  assert.match(body,/security definer set search_path=''/i);
  for(const schema of ['private','public']){
   assert.ok(sql.includes('revoke all on function '+schema+'.'+name+'('+args.replace('p_tenant_id uuid','uuid')+') from public,anon,authenticated;'));
   assert.ok(sql.includes('grant execute on function '+schema+'.'+name+'('+args.replace('p_tenant_id uuid','uuid')+') to authenticated;'));
  }
 }
});
test('Cost reader still requires auth.uid, management role, and active tenant',()=>{
 const s=routine('private','saas_manager_product_costs');
 assert.match(s,/auth\.uid\(\)/);
 assert.match(s,/saas_has_tenant_role/);
 assert.match(s,/saas_is_platform_super_admin/);
 assert.match(s,/t\.active is true/);
 assert.match(s,/p\.tenant_id=p_tenant_id/);
});
test('Other readers scope results strictly to requesting user',()=>{
 assert.match(routine('private','saas_my_platform_notice'),/t\.owner_user_id=\(select auth\.uid\(\)\)/);
 assert.match(routine('private','saas_my_access_summary'),/m\.user_id=\(select auth\.uid\(\)\)/);
 assert.match(routine('private','saas_my_access_summary'),/t\.owner_user_id=\(select auth\.uid\(\)\)/);
 assert.match(routine('private','saas_my_access_summary'),/p\.user_id=\(select auth\.uid\(\)\)/);
});
test('Migration makes no policy or billing changes',()=>{
 assert.doesNotMatch(sql,/disable row level security|drop policy|update\s+public\.saas_subscriptions|grant all on table/i);
});
