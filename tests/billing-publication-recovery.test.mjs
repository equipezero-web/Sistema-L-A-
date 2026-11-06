import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/sql/saas_subscription_preserve_publication.sql','utf8');

test('Recovery leaves the proprietor publication preference untouched',()=>{
  assert.doesNotMatch(sql,/update\s+public\.saas_store_themes\s+set\s+published\s*=\s*false/i);
  assert.match(sql,/perform public\.saas_sync_public_store\(p_tenant_id\);/i);
});

test('Activation requires provider authorization, approved payment and future end date',()=>{
  assert.match(sql,/lower\(coalesce\(p_provider_status,''\)\)='authorized'/);
  assert.match(sql,/lower\(coalesce\(p_payment_status,''\)\)='approved'/);
  assert.match(sql,/and p_period_end is not null\s+and p_period_end > now\(\)/i);
});

test('Existing privileged SQL routine preserves SECURITY DEFINER, private schema and defaults',()=>{
  assert.match(sql,/create or replace function private\.saas_apply_provider_subscription/);
  assert.match(sql,/security definer\s+set search_path = ''/i);
  assert.match(sql,/p_payment_id text default null, p_payment_status text default null/i);
  assert.match(sql,/p_period_end timestamptz default null/i);
});

test('Renewal remains constrained to Royal 30 and Mercado Pago',()=>{
  assert.match(sql,/p_provider <> 'mercado_pago'/);
  assert.match(sql,/code='royal-30' and active=true/);
});

test('Renewal, overdue and cancellation decisions are separately represented',()=>{
  assert.match(sql,/when v_active then 'active'/);
  assert.match(sql,/when lower\(coalesce\(p_provider_status,''\)\) in \('cancelled','canceled'\) then 'cancelled'/);
  assert.match(sql,/else 'past_due'/);
  assert.match(sql,/on conflict\(tenant_id\) do update/);
  assert.match(sql,/insert into public\.saas_audit_logs/);
});
