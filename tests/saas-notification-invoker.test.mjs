import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/sql/saas_notification_read_invoker_20261119.sql','utf8');
const ui=readFileSync('assets/js/operations.js','utf8');

test('notification updates restricted to recipient and own tenant by RLS',()=>{
 assert.match(sql,/for update to authenticated/);
 assert.match(sql,/recipient_user_id=\(select auth\.uid\(\)\)/g);
 assert.match(sql,/public\.saas_is_tenant_member\(tenant_id\)/g);
 assert.match(sql,/with check/);
});
test('RPC executes with caller privileges and updates only read timestamp',()=>{
 assert.match(sql,/security invoker set search_path=''/);
 assert.match(sql,/grant update\(read_at\) on public\.saas_notifications to authenticated/);
 assert.match(sql,/revoke update on public\.saas_notifications from authenticated/);
 assert.match(sql,/grant execute on function public\.saas_mark_notification_read\(uuid\) to authenticated/);
 assert.doesNotMatch(sql,/language plpgsql security definer/i);
 assert.match(ui,/saas_mark_notification_read/);
});
