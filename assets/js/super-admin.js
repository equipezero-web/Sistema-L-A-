import { supabase } from './supabase.js';
import { getSession, getAAL, getMyProfile, signOut } from './auth.js';

const $ = s => document.querySelector(s);
const show = (text, error = false) => { const el = $('#status'); if (!el) return; el.textContent = text; el.className = `status show ${error ? 'error' : 'ok'}`; };

async function boot() {
  const session = await getSession();
  if (!session) { location.href = '../auth/login.html'; return; }
  const profile = await getMyProfile();
  if (!profile?.is_platform_super_admin) { await signOut(); location.href = '../auth/login.html'; return; }
  const aal = await getAAL();
  if (aal.currentLevel !== 'aal2') { location.href = '../auth/login.html'; return; }

  const [{ count: tenants, error: tenantError }, { count: subscriptions, error: subError }] = await Promise.all([
    supabase.from('saas_tenants').select('id', { count: 'exact', head: true }),
    supabase.from('saas_subscriptions').select('tenant_id', { count: 'exact', head: true }).eq('status', 'active')
  ]);
  if (tenantError) throw tenantError;
  if (subError) throw subError;
  $('#adminName').textContent = profile.full_name || session.user.email || 'Super Admin';
  $('#tenantCount').textContent = tenants ?? 0;
  $('#subscriptionCount').textContent = subscriptions ?? 0;
}

$('#logout')?.addEventListener('click', async () => { await signOut(); location.href = '../auth/login.html'; });
boot().catch(err => show(err.message || 'Não foi possível carregar o Super Admin.', true));
