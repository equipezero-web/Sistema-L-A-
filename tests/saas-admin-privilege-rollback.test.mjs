import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/tests/saas_admin_privileges_rollback.sql','utf8');

test('Role regression uses transaction-scoped fixture, never COMMIT',()=>{
 assert.match(sql,/^begin;/m);
 assert.match(sql,/^rollback;/m);
 assert.doesNotMatch(sql,/^\s*commit\s*;/im);
 assert.match(sql,/create temporary table _saas53_identity on commit drop/i);
 assert.match(sql,/set local role authenticated/i);
 assert.match(sql,/insert into auth\.users\(/i);
 assert.doesNotMatch(sql,/alter\s+table\s+.*disable\s+trigger|disable\s+row\s+level\s+security|set\s+row_security\s*=\s*off/i);
});
test('AAL1/AAL2 negative Super Admin controls cannot be silently bypassed',()=>{
 assert.match(sql,/array\['aal1','aal2'\]/);
 assert.match(sql,/public\.saas_is_platform_super_admin\(\)/);
 assert.match(sql,/public\.saas_platform_tenants\(\)/);
 assert.match(sql,/v_rpc\s*<>\s*'DENIED'/);
 assert.match(sql,/v_admin\s+or/);
 assert.doesNotMatch(sql,/update\s+auth\.users\b/i);
});
test('Profile privilege denial and legitimate name updates are both checked',()=>{
 assert.match(sql,/set is_platform_super_admin=true/);
 assert.match(sql,/when insufficient_privilege then v_priv:='DENIED_BY_GRANT'/);
 assert.match(sql,/v_priv='ALLOWED'/);
 assert.match(sql,/set full_name='SaaS validation 53'/);
 assert.match(sql,/v_count<>1/);
});
