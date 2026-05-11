/**
 * services/categoryService.js
 * ----------------------------
 * Database operations for categories (Chart of Accounts), payees, and auto-cat rules.
 */

import { supabase } from '../lib/supabase';

// ── Categories ────────────────────────────────────────────────────────────────

export async function fetchCategories(orgId) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order');
  if (error) throw error;
  return data;
}

export async function createCategory(orgId, cat) {
  const { data, error } = await supabase
    .from('accounts')
    .insert({ org_id: orgId, ...cat })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id, updates) {
  const { data, error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
}

export async function deactivateCategory(id) {
  const { data, error } = await supabase
    .from('accounts').update({ is_active: false }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ── Payees ────────────────────────────────────────────────────────────────────

export async function fetchPayees(orgId) {
  const { data, error } = await supabase
    .from('payees').select('*').eq('org_id', orgId).order('name');
  if (error) throw error;
  return data;
}

export async function upsertPayee(orgId, name, colour) {
  const { data, error } = await supabase
    .from('payees')
    .upsert({ org_id: orgId, name, colour }, { onConflict: 'org_id,name' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePayee(id) {
  const { error } = await supabase.from('payees').delete().eq('id', id);
  if (error) throw error;
}

// ── Auto-cat rules ────────────────────────────────────────────────────────────

export async function fetchRules(orgId) {
  const { data, error } = await supabase
    .from('auto_cat_rules').select('*').eq('org_id', orgId).order('sort_order');
  if (error) throw error;
  return data;
}

export async function createRule(orgId, rule) {
  const { data, error } = await supabase
    .from('auto_cat_rules').insert({ org_id: orgId, ...rule }).select().single();
  if (error) throw error;
  return data;
}

export async function updateRule(id, updates) {
  const { data, error } = await supabase
    .from('auto_cat_rules').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteRule(id) {
  const { error } = await supabase.from('auto_cat_rules').delete().eq('id', id);
  if (error) throw error;
}
