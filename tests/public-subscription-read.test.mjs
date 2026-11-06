import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql = readFileSync('supabase/sql/saas_public_subscription_read_guard.sql', 'utf8');

test('Store and catalog read policies are RESTRICTIVE, not additional permissive grants', () => {
  for (const table of ['saas_public_stores','saas_public_catalog_items']) {
    const re=new RegExp('create policy saas_public_[\\w]+_subscription_read_guard\\s+on public\\.'+
      table+' as restrictive\\s+for select to anon, authenticated\\s+using \\(private\\.saas_public_store_visible\\(tenant_id\\)\\)', 'i');
    assert.match(sql,re);
  }
});

test('Visibility depends on tenant activation, onboarding, theme publication, subscription and expiry', () => {
  for (const predicate of [
    't.active = true', 't.onboarding_completed = true', 'th.published = true',
    "s.status = 'active'", 's.current_period_end > now()'
  ]) assert.ok(sql.includes(predicate), 'Missing '+predicate);
});

test('Visibility function is private and exposes only a boolean', () => {
  assert.match(sql,/create or replace function private\.saas_public_store_visible\(p_tenant_id uuid\)\s+returns boolean/i);
  assert.match(sql,/security definer\s+set search_path = ''/i);
  assert.match(sql,/revoke all on function private\.saas_public_store_visible\(uuid\) from public, anon, authenticated;/i);
  assert.match(sql,/grant execute on function private\.saas_public_store_visible\(uuid\) to anon, authenticated;/i);
});
