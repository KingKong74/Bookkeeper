/**
 * services/reportService.js
 * --------------------------
 * Builds financial report data from journal entries and transactions.
 * All report assembly logic lives here — components receive clean data objects.
 *
 * These functions wrap the pure math in utils/journalMath.js with
 * the Supabase data-fetching needed to hydrate them.
 */

import { supabase } from '../lib/supabase';

const PAGE = 1000;

/** Fetch journal lines for a given date range (used by TB, P&L, BS) */
export async function fetchJournalLinesForPeriod(orgId, dateFrom, dateTo) {
  let all = [], offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('journal_lines')
      .select('*, journal_entries!inner(org_id, date, is_reversal)')
      .eq('journal_entries.org_id', orgId)
      .gte('journal_entries.date', dateFrom)
      .lte('journal_entries.date', dateTo)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/** Fetch all journal lines for an org (for full TB without date filter) */
export async function fetchAllJournalLines(orgId) {
  let all = [], offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('journal_lines')
      .select('*, journal_entries!inner(org_id, date, is_reversal)')
      .eq('journal_entries.org_id', orgId)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}
