/**
 * utils/csvParser.js
 * ------------------
 * Parses a raw CSV string into structured transaction data.
 *
 * Supports:
 *   - ANZ (Narration / Amount columns)       ← auto-detected
 *   - CBA, NAB, Westpac (common formats)
 *   - Any generic CSV via manual column mapping
 *
 * Usage:
 *   const { headers, rows } = parseCSVText(rawString);
 *   const map = autoDetectColumns(headers, filename);
 *   const txns = buildTransactions(rows, map);
 */

import { parseCSVDate } from './helpers';

// ── Step 1: Parse raw CSV text into headers + rows ───────────────────────────

/**
 * Split a raw CSV string into a headers array and a 2D rows array.
 * Handles quoted fields that contain commas.
 */
export function parseCSVText(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseCSVRow(lines[0]);
  const rows    = lines.slice(1).map(parseCSVRow);

  return { headers, rows };
}

/**
 * Parse a single CSV row string into an array of field values.
 * Handles double-quoted fields (including those containing commas).
 */
function parseCSVRow(row) {
  const cols = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cols.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

// ── Step 2: Auto-detect which column is which ─────────────────────────────────

/**
 * Given an array of header strings and an optional filename, return a column
 * map object: { date, desc, amt, debit, credit } where each value is the
 * column index (or -1 if not found).
 *
 * ANZ exports use "Narration" for the description column, so we check the
 * filename for "anz" as an extra hint.
 */
export function autoDetectColumns(headers, filename = '') {
  const map = { date: -1, desc: -1, amt: -1, debit: -1, credit: -1 };
  const isANZ = filename.toLowerCase().includes('anz') ||
                headers.some(h => h.toLowerCase().includes('narration'));

  headers.forEach((h, i) => {
    const hl = h.toLowerCase().replace(/[^a-z]/g, '');

    if (hl.includes('date'))                                           map.date   = i;
    else if (isANZ && (hl.includes('narration') || hl.includes('details'))) map.desc = i;
    else if (!isANZ && (hl.includes('description') || hl.includes('desc') || hl.includes('reference'))) map.desc = i;
    else if (hl === 'amount' || hl === 'amt')                          map.amt    = i;
    else if (hl.includes('debit'))                                     map.debit  = i;
    else if (hl.includes('credit'))                                    map.credit = i;
  });

  // ANZ fallback: pick first column with "amount" if single-amount format
  if (map.desc === -1) {
    headers.forEach((h, i) => {
      if (h.toLowerCase().includes('narration') || h.toLowerCase().includes('details')) map.desc = i;
    });
  }

  return map;
}

// ── Step 3: Convert rows + map into transaction objects ──────────────────────

/**
 * Convert a 2D rows array + column map into an array of raw transaction objects.
 * Returns { transactions, duplicateCount } so the caller can report skipped rows.
 *
 * Each returned transaction is NOT yet assigned an id — the caller should add
 * one (e.g. Date.now() + Math.random()) before pushing into state.
 *
 * @param {string[][]}  rows         – 2D array from parseCSVText
 * @param {object}      colMap       – column index map from autoDetectColumns
 * @param {object[]}    existing     – existing transactions to detect duplicates against
 */
export function buildTransactions(rows, colMap, existing = []) {
  const { date: di, desc: dc, amt: ai, debit: dbi, credit: ci } = colMap;
  const transactions = [];
  let duplicateCount = 0;

  rows.forEach(row => {
    const date = parseCSVDate(row[di] || '');
    const desc = (row[dc] || '').trim();
    if (!date || !desc) return; // skip malformed rows

    // Calculate amount from either a single column or separate debit/credit cols
    let amt = 0;
    if (ai >= 0) {
      amt = parseFloat((row[ai] || '0').replace(/[$,]/g, '')) || 0;
    } else {
      const debit  = parseFloat((row[dbi] || '0').replace(/[$,]/g, '')) || 0;
      const credit = parseFloat((row[ci]  || '0').replace(/[$,]/g, '')) || 0;
      amt = credit - debit;
    }

    // Duplicate detection — same date + description + amount already exists
    const isDuplicate = existing.some(
      t => t.date === date && t.desc === desc && Math.abs(t.amt - amt) < 0.001
    );
    if (isDuplicate) { duplicateCount++; return; }

    transactions.push({ date, desc, amt, cat: null, payee: '', note: '' });
  });

  return { transactions, duplicateCount };
}
