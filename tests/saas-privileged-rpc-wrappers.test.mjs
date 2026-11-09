import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/sql/saas_privileged_rpc_private_wrappers.sql','utf8');
const specs=[
 ['saas_platform_audit','integer,integer','p_limit,p_offset','jsonb'],
 ['saas_platform_audit_filtered','integer,integer,uuid,text,date,date','p_limit,p_offset,p_tenant_id,p_action,p_from,p_to','jsonb'],
 ['saas_platform_expel_tenant','uuid,text','p_tenant_id,p_reason','void'],
 ['saas_platform_restore_owner','uuid,text','p_tenant_id,p_reason','void'],
 ['saas_platform_set_tenant_active','uuid,boolean,text','p_tenant_id,p_active,p_reason','void'],
 ['saas_platform_tenants','','','jsonb'],
 ['saas_record_usage','uuid','p_tenant_id','void']
];
test('Public wrappers are SECURITY INVOKER and delegate to private implementations',()=>{
 for(const [name,args,call,ret] of specs){
  const start=sql.indexOf('create or replace function public.'+name+'(');
  assert.notEqual(start,-1,name);
  const end=sql.indexOf('$$;',start);
  const snippet=sql.slice(start,end+3);
  assert.match(snippet,/security invoker set search_path=''/i);
  assert.match(snippet,new RegExp('returns '+ret+'\\s*language sql'));
  assert.ok(snippet.includes('select private.'+name+'('+call+');'),name);
 }
});
test('Private bodies originate from audited existing definitions rather than copied business logic',()=>{
 assert.match(sql,/pg_get_functiondef\(v_oid\)/);
 assert.match(sql,/position\('SECURITY DEFINER' in v_definition\)/);
 assert.match(sql,/position\('SET search_path TO /);
 assert.match(sql,/if not \(select p\.prosecdef/);
 assert.match(sql,/Private RPC already exists/);
});
test('No public/anon execution is granted; authenticated user still has route',()=>{
 for(const [name,args] of specs){
  for(const schema of ['private','public']){
   const sig=schema+'.'+name+'('+args+')';
   assert.ok(sql.includes('revoke all on function '+sig+' from public, anon, authenticated;'),sig+' revoke');
   assert.ok(sql.includes('grant execute on function '+sig+' to authenticated;'),sig+' grant');
  }
 }
 assert.doesNotMatch(sql,/grant execute .* to anon;/i);
});
test('Preserves optional parameter defaults on platform audit APIs',()=>{
 assert.match(sql,/p_limit integer default 50, p_offset integer default 0/);
 assert.match(sql,/p_limit integer default 20, p_offset integer default 0/);
 assert.match(sql,/p_tenant_id uuid default null::uuid/);
 assert.match(sql,/p_action text default null::text/);
 assert.match(sql,/p_from date default null::date/);
 assert.match(sql,/p_to date default null::date/);
});
test('No RLS, checkout, platform privilege or billing switch is changed',()=>{
 assert.doesNotMatch(sql,/disable row level security|drop policy|alter table public\.saas_profiles|update public\.saas_subscriptions|MP_CHECKOUT_ENABLED/i);
});
