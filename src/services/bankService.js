/**
 * services/bankService.js
 * -----------------------
 * Database operations for bank accounts.
 */

import { supabase } from '../lib/supabase';

export async function fetchBankAccounts(orgId) {
  const { data, error } = await supabase
    .from('bank_accounts').select('*').eq('org_id', orgId).order('sort_order');
  if (error) throw error;
  return data;
}

export async function createBankAccount(orgId, account) {
  const { data, error } = await supabase
    .from('bank_accounts').insert({ org_id: orgId, ...account }).select().single();
  if (error) throw error;
  return data;
}

export async function updateBankAccount(id, updates) {
  const { data, error } = await supabase
    .from('bank_accounts').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteBankAccount(id) {
  const { error } = await supabase.from('bank_accounts').delete().eq('id', id);
  if (error) throw error;
}
