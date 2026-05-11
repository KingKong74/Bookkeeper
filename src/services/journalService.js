/**
 * services/journalService.js
 * --------------------------
 * Journal entry database operations.
 *
 * postCategoryJournal — categorises a transaction; if one already exists it is
 * reversed first (reversal lines added to the master ledger, net-zero result).
 * batchPostJournals, createReversalForCategory, and
 * voidAutoJournal all live in lib/supabase.js (master-ledger model).
 * This file re-exports them so views can import from a single place,
 * and adds fetchJournals / createJournalEntry which need their own logic.
 */

import { supabase } from '../lib/supabase';
import { buildJournalLines, buildReversalLines } from '../utils/journalMath'; // used by the master-ledger implementation in lib/supabase.js
export {
  postCategoryJournal,
  batchPostJournals,
  createReversalForCategory,
  voidAutoJournal,
} from '../lib/supabase';

const PAGE = 1000;

/** Fetch all journal entries with their lines, paginating past the 1000-row limit */
export async function fetchJournals(orgId) {
  let entries = [];
  let offset  = 0;
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

  // Fetch lines separately to avoid the nested 1000-row limit
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

  const linesByEntry = {};
  for (const l of lines) {
    if (!linesByEntry[l.journal_entry_id]) linesByEntry[l.journal_entry_id] = [];
    linesByEntry[l.journal_entry_id].push(l);
  }
  return entries.map(e => ({ ...e, journal_lines: linesByEntry[e.id] ?? [] }));
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

/** Update an existing manual journal entry and replace its lines */
export async function updateJournalEntry(entryId, updates, newLines) {
  const { error } = await supabase
    .from('journal_entries')
    .update(updates)
    .eq('id', entryId);
  if (error) throw error;

  if (newLines) {
    await supabase.from('journal_lines').delete().eq('journal_entry_id', entryId);
    if (newLines.length) {
      const { error: lineError } = await supabase
        .from('journal_lines')
        .insert(newLines.map(l => ({ ...l, journal_entry_id: entryId })));
      if (lineError) throw lineError;
    }
  }
}
