import { supabase } from './supabase.js';

export async function signUpOwner({ fullName, email, phone, password }) {
  return supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, phone } } });
}
export async function signIn(email, password) { return supabase.auth.signInWithPassword({ email, password }); }
export async function signOut() { return supabase.auth.signOut(); }
export async function getSession() { const { data, error } = await supabase.auth.getSession(); if (error) throw error; return data.session; }
export async function getAAL() { const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(); if (error) throw error; return data; }
export async function listMfaFactors() { const { data, error } = await supabase.auth.mfa.listFactors(); if (error) throw error; return data; }
export async function enrollTotp(friendlyName = 'L&A Royal SaaS') { const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName }); if (error) throw error; return data; }
export async function verifyTotpEnrollment(factorId, code) { const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code }); if (error) throw error; return data; }
export async function challengeTotp(factorId, code) { const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code }); if (error) throw error; return data; }
export async function setMfaPreference(preference) { const { error } = await supabase.rpc('saas_set_mfa_preference', { p_preference: preference }); if (error) throw error; }
export async function declineOptionalMfa() { return setMfaPreference('declined'); }
export async function getMyProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase.from('saas_profiles').select('user_id,full_name,is_platform_super_admin,mfa_preference').eq('user_id', session.user.id).single();
  if (error) throw error;
  return data;
}
