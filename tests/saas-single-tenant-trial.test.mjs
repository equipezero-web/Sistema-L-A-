import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync('supabase/sql/saas_single_tenant_trial_access_58.sql','utf8');
const plans=readFileSync('app/plano.html','utf8');
const settings=readFileSync('app/configuracoes.html','utf8');
const appearance=readFileSync('assets/js/appearance.js','utf8');

test('Trial grant is tenant-scoped, has an expiration and cannot mark payment approved',()=>{
  assert.match(migration,/tenant_id uuid primary key references public\.saas_tenants\(id\)/i);
  assert.match(migration,/private\.saas_tenant_trial_access/i);
  assert.match(migration,/enable row level security/i);
  assert.match(migration,/revoke all on private\.saas_tenant_trial_access from public, anon, authenticated/i);
  assert.match(migration,/tr\.expires_at > now\(\)/);
  assert.match(migration,/now\(\)\+interval '7 days'/i);
  assert.match(migration,/b26cb679-bbbb-4e62-95f3-4b7f907c090d/);
  assert.match(migration,/slug='lapis-servidor'/);
  assert.match(migration,/if exists \(select 1 from public\.saas_subscriptions where tenant_id=v_tenant\)/);
  assert.doesNotMatch(migration,/\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?saas_subscriptions\b/i);
});
test('Subscription remains a real payment while commercial access allows paid OR explicit trial',()=>{
  assert.match(migration,/create or replace function public\.saas_has_commercial_access/);
  assert.match(migration,/public\.saas_has_active_subscription\(p_tenant_id\)[\s\S]*?or private\.saas_trial_active\(p_tenant_id\)/);
  assert.doesNotMatch(migration,/create or replace function public\.saas_has_active_subscription/);
  assert.match(migration,/'access_type', case/);
  assert.match(migration,/when private\.saas_trial_active\(p_tenant_id\) then 'trial'/);
  assert.match(migration,/'trial_expires_at',private\.saas_trial_expires_at\(p_tenant_id\)/);
  assert.match(migration,/auth\.uid\(\)\) is not null/);
});
test('All publication gates enforce tenant-specific commercial access and retain published+active rules',()=>{
  assert.match(migration,/create or replace function public\.saas_enforce_catalog_subscription/);
  assert.match(migration,/create or replace function public\.saas_enforce_store_subscription/);
  assert.match(migration,/not public\.saas_has_commercial_access\(new\.tenant_id\)/);
  assert.match(migration,/t\.active=true[\s\S]*?t\.onboarding_completed=true and th\.published=true/);
  assert.match(migration,/not public\.saas_has_commercial_access\(p_tenant_id\)/);
  assert.match(migration,/p_publish and not public\.saas_has_commercial_access\(p_tenant_id\)/);
});
test('Plans and settings display test access accurately without pretending a paid subscription',()=>{
  assert.match(plans,/access\?\.access_type==='trial'/);
  assert.match(plans,/Acesso de homologação ativo/);
  assert.match(plans,/Nenhuma assinatura paga foi criada/);
  assert.match(plans,/Nenhuma cobrança foi realizada/);
  assert.match(settings,/access_type==='trial'/);
  assert.match(settings,/Acesso de homologação temporário ativo/);
  assert.match(appearance,/subscriptionActive=!!access\?\.active/);
});
