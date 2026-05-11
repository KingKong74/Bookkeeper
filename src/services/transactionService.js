/**
 * services/transactionService.js
 * --------------------------------
 * All database operations for transactions.
 * Components call these functions — they don't touch Supabase directly.
 */

import { supabase } from '../lib/supabase';

const PAGE = 1000;

/** Fetch all transactions for an org within a date range, auto-paginating past Supabase's 1000-row limit */
export async function fetchTransactions(orgId, from, to) {
  const all = [];
  let offset = 0;
  // Try with pending_import filter first; fall back without it if column doesn't exist yet
  // (migration 016 may not have been applied)
  let usePendingFilter = true;
  while (true) {
    let q = supabase
      .from('transactions')
      .select(`*, accounts(id, label, colour, type, account_group), payees(id, name, colour)`)
      .eq('org_id', orgId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (usePendingFilter) q = q.eq('pending_import', false);
    const { data, error } = await q;
    if (error) {
      // If error is about missing column, retry without the filter
      if (usePendingFilter && (error.message?.includes('pending_import') || error.code === '42703' || error.code === 'PGRST204')) {
        usePendingFilter = false;
        continue; // retry this page without the filter
      }
      throw error;
    }
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/** Create a single transaction */
export async function createTransaction(orgId, txn) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({ org_id: orgId, ...txn })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Update a transaction's fields */
export async function updateTransaction(id, updates) {
  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Delete a transaction and its journal lines */
export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Bulk import transactions, deduplicating by import_hash.
 * Returns { inserted: number, skipped: number }
 */
export async function bulkImportTransactions(orgId, transactions) {
  if (!transactions.length) return { inserted: 0, skipped: 0 };

  // Find hashes that already exist
  const hashes = transactions.map(t => t.import_hash).filter(Boolean);
  const { data: existing } = await supabase
    .from('transactions')
    .select('import_hash')
    .eq('org_id', orgId)
    .in('import_hash', hashes.slice(0, 500));

  const existingSet = new Set((existing || []).map(r => r.import_hash));
  const toInsert = transactions.filter(t => !t.import_hash || !existingSet.has(t.import_hash));

  if (!toInsert.length) return { inserted: 0, skipped: transactions.length };

  const rows = toInsert.map(t => ({ org_id: orgId, ...t }));
  let inserted = 0;

  // Insert in batches of 200
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await supabase
      .from('transactions')
      .insert(rows.slice(i, i + 200))
      .select('id');
    if (error) throw error;
    inserted += data?.length ?? 0;
  }

  return { inserted, skipped: transactions.length - inserted };
}
