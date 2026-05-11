/**
 * services/authService.js
 * -----------------------
 * Authentication and organisation operations.
 */

import { supabase } from '../lib/supabase';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

export async function getMyOrgs() {
  const { data, error } = await supabase
    .from('memberships')
    .select('role, organisations(*)')
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(m => ({ ...m.organisations, role: m.role }));
}
