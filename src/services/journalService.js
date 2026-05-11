/**
 * services/journalService.js
 * --------------------------
 * All journal entry database operations and double-entry posting logic.
 * Business rules for journal creation live here, not in components.
 */

import { supabase } from '../lib/supabase';
import { buildJournalLines, buildReversalLines } from '../utils/journalMath';

const PAGE = 1000;

/** Fetch all journal entries with their lines, paginating past the 1000-row limit */
export async function fetchJournals(orgId) {
  // Fetch entries and lines separately — nested select hits 1000-row limit on lines
  let entries = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('org_id', orgId)
      .order('date', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    entries.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  if (!entries.length) return [];

  // Fetch lines in chunks of 200 IDs
  const entryIds = entries.map(e => e.id);
  let lines = [];
  for (let i = 0; i < entryIds.length; i += 200) {
    let lineOffset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('journal_lines')
        .select('*')
        .in('journal_entry_id', entryIds.slice(i, i + 200))
        .range(lineOffset, lineOffset + PAGE - 1);
      if (error) throw error;
      if (!data?.length) break;
      lines.push(...data);
      if (data.length < PAGE) break;
      lineOffset += PAGE;
    }
  }

  // Join lines onto entries
  const linesByEntry = {};
  for (const l of lines) {
    if (!linesByEntry[l.journal_entry_id]) linesByEntry[l.journal_entry_id] = [];
    linesByEntry[l.journal_entry_id].push(l);
  }
  return entries.map(e => ({ ...e, journal_lines: linesByEntry[e.id] ?? [] }));
}

/**
 * Post a double-entry journal for a categorised transaction.
 * If one already exists for this transaction, it is reversed first.
 *
 * @param {string} orgId
 * @param {object} txn       - transaction object
 * @param {object|null} category - category (null to unassign/reverse only)
 * @param {object|null} bankAccount
 * @returns {object|null} - the new journal entry, or null if only reversed
 */
export async function postCategoryJournal(orgId, txn, category, bankAccount) {
  if (!orgId || !txn?.id) return null;

  // Find and reverse any existing journal for this transaction
  const { data: existing } = await supabase
    .from('journal_entries')
    .select('id, journal_lines(*)')
    .eq('org_id', orgId)
    .eq('transaction_id', txn.id)
    .eq('is_reversal', false)
    .maybeSingle();

  if (existing) {
    const reversalLines = buildReversalLines(existing.journal_lines ?? []);
    if (reversalLines.length) {
      const { data: revEntry } = await supabase
        .from('journal_entries')
        .insert({
          org_id: orgId, transaction_id: txn.id,
          date: txn.date, description: `REVERSAL: ${txn.desc ?? txn.description ?? ''}`,
          is_reversal: true,
        })
        .select()
        .single();
      if (revEntry) {
        await supabase.from('journal_lines').insert(
          reversalLines.map(l => ({ ...l, journal_entry_id: revEntry.id }))
        );
      }
    }
    // Void the original
    await supabase.from('journal_entries').update({ is_reversal: true }).eq('id', existing.id);
  }

  if (!category) return null;

  // Build and post new journal
  const lines = buildJournalLines(txn, category, bankAccount);
  if (!lines.length) return null;

  const { data: entry, error } = await supabase
    .from('journal_entries')
    .insert({
      org_id: orgId, transaction_id: txn.id,
      date: txn.date,
      description: txn.desc ?? txn.description ?? '',
      is_reversal: false,
    })
    .select()
    .single();
  if (error) throw error;

  await supabase.from('journal_lines').insert(
    lines.map(l => ({ ...l, journal_entry_id: entry.id }))
  );

  return entry;
}

/** Batch post journals for multiple transactions */
export async function batchPostJournals(orgId, transactions, catMap, accountMap) {
  const results = { posted: 0, failed: 0, errors: [] };
  for (const txn of transactions) {
    const cat  = catMap[txn.cat ?? txn.category_id];
    const acct = txn.account_id ? accountMap[txn.account_id] : null;
    if (!cat) continue;
    try {
      await postCategoryJournal(orgId, txn, cat, acct);
      results.posted++;
    } catch (e) {
      results.failed++;
      results.errors.push({ txnId: txn.id, error: e.message });
    }
  }
  return results;
}

/** Create a manual journal entry with explicit lines */
export async function createJournalEntry(orgId, { date, description, ref, lines }) {
  const { data: entry, error } = await supabase
    .from('journal_entries')
    .insert({ org_id: orgId, date, description, ref: ref ?? null })
    .select()
    .single();
  if (error) throw error;

  if (lines?.length) {
    const { error: lineError } = await supabase
      .from('journal_lines')
      .insert(lines.map(l => ({ ...l, journal_entry_id: entry.id })));
    if (lineError) throw lineError;
  }
  return entry;
}
