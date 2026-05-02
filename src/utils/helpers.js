/**
 * utils/helpers.js
 * ----------------
 * Pure utility functions shared across the whole app.
 * No React, no state — just plain logic you can test in isolation.
 */

import { PALETTE } from '../data/seeds';

// ── Number formatting ─────────────────────────────────────────────────────────

/**
 * Format a number as a dollar amount (always positive).
 * e.g.  -187.45  →  "$187.45"
 *       5000     →  "$5,000.00"
 */
export function fmt(n) {
  return '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format a number with a +/− sign prefix.
 * e.g.  1200  →  "+ $1,200.00"
 *      -45.9  →  "− $45.90"
 */
export function fmtSigned(n) {
  return (n >= 0 ? '+ ' : '− ') + '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Return a human-readable label for a date range.
 * If the range is within one month: "Apr 2025"
 * Otherwise: "Apr '25 – Jun '25"
 */
export function dateRangeLabel(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return mo[a.getMonth()] + ' ' + a.getFullYear();
  }
  return (
    mo[a.getMonth()] + " '" + a.getFullYear().toString().slice(2) +
    ' – ' +
    mo[b.getMonth()] + " '" + b.getFullYear().toString().slice(2)
  );
}

/**
 * Return the start year of the current Australian financial year.
 * The AUS financial year runs July 1 → June 30.
 * So if today is before July, the FY started last calendar year.
 */
export function currentFYStart() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Build the ISO date strings for a given financial year start year.
 * e.g. fyStart=2024 → { from: '2024-07-01', to: '2025-06-30' }
 */
export function fyDateRange(fyStart) {
  return {
    from: `${fyStart}-07-01`,
    to:   `${fyStart + 1}-06-30`,
  };
}

/**
 * Format a financial year start year as a label.
 * e.g. 2024 → "FY 2024–25"
 */
export function fyLabel(fyStart) {
  return `FY ${fyStart}–${(fyStart + 1).toString().slice(2)}`;
}

/**
 * Parse a date string from common CSV formats into YYYY-MM-DD.
 * Handles: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY
 */
export function parseCSVDate(raw) {
  if (!raw) return '';
  const s = raw.trim();
  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // DD/MM/YYYY
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);   // YYYY-MM-DD (already correct)
  if (m2) return s;
  const m3 = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);   // DD-MM-YYYY
  if (m3) return `${m3[3]}-${m3[2]}-${m3[1]}`;
  return s; // return as-is if unrecognised
}

// ── Payee / avatar helpers ────────────────────────────────────────────────────

/**
 * Return up to 2 uppercase initials from a payee name.
 * e.g. "Woolworths"   → "WO"  (single word uses first 2 chars)
 *      "Uber Eats"    → "UE"
 *      "JB Hi-Fi"     → "JH"
 */
export function initials(name) {
  if (!name) return '?';
  const words = name.split(/\s+/);
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return words.map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * Deterministically pick a colour from PALETTE based on a payee name.
 * The same name will always get the same colour.
 * If the payee exists in the payees list, use their stored colour instead.
 */
export function payeeColor(name, payeesList = []) {
  const found = payeesList.find(p => p.name.toLowerCase() === name?.toLowerCase());
  if (found) return found.col;
  // Fall back to a hash of the name
  const hash = (name || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return PALETTE[hash % PALETTE.length];
}

// ── Transaction filtering ─────────────────────────────────────────────────────

/**
 * Filter a list of transactions to only those within a date range.
 * Both from and to are inclusive.
 */
export function filterByDateRange(transactions, from, to) {
  return transactions.filter(t => t.date >= from && t.date <= to);
}

// ── Accounting calculations ───────────────────────────────────────────────────

/**
 * Given a list of transactions and a category map, group totals by account.
 * Returns an array of { ac, t, dr, cr } objects used by the Trial Balance
 * and Chart of Accounts.
 */
export function buildAccountTotals(transactions, categoryMap) {
  const map = {};

  transactions.forEach(t => {
    const cat = categoryMap[t.cat];
    if (!cat) return; // skip unallocated

    const key = `${cat.ac}|${cat.t}`;
    if (!map[key]) map[key] = { ac: cat.ac, t: cat.t, dr: 0, cr: 0 };

    if (t.amt < 0) {
      map[key].dr += Math.abs(t.amt);
    } else {
      map[key].cr += t.amt;
    }
  });

  return Object.values(map);
}

/**
 * Run all auto-cat rules against a list of transactions.
 * Returns an array of suggestion objects for the approval queue:
 *   { txnId, sugCat, sugPayee, rule, confidence }
 *
 * A transaction is only suggested if it is missing a category OR a payee.
 * Confidence is "High" if the keyword appears at the start of the description,
 * "Medium" if it appears anywhere else.
 */
export function runAutoCatRules(transactions, rules) {
  const suggestions = [];

  transactions.forEach(t => {
    if (t.cat && t.payee) return;

    const descLower = t.desc.toLowerCase();
    const amt       = Math.abs(t.amt ?? 0);

    for (const rule of rules) {
      // 1. Keyword match
      if (!descLower.includes(rule.keyword.toLowerCase())) continue;

      // 2. Amount conditions (all optional — if set they must pass)
      if (rule.amtExact !== undefined && rule.amtExact !== null && rule.amtExact !== '') {
        if (Math.abs(amt - parseFloat(rule.amtExact)) > 0.005) continue;
      }
      if (rule.amtMin !== undefined && rule.amtMin !== null && rule.amtMin !== '') {
        if (amt < parseFloat(rule.amtMin)) continue;
      }
      if (rule.amtMax !== undefined && rule.amtMax !== null && rule.amtMax !== '') {
        if (amt > parseFloat(rule.amtMax)) continue;
      }
      // 3. Direction condition (optional: 'in' | 'out' | '')
      if (rule.direction === 'in'  && t.amt <= 0) continue;
      if (rule.direction === 'out' && t.amt >= 0) continue;

      const sugCat   = !t.cat   && rule.catId ? rule.catId : null;
      const sugPayee = !t.payee && rule.payee ? rule.payee : null;

      if (sugCat || sugPayee) {
        suggestions.push({
          txnId:      t.id,
          sugCat,
          sugPayee,
          rule:       rule.keyword,
          confidence: descLower.startsWith(rule.keyword.toLowerCase()) ? 'High' : 'Medium',
        });
      }
      break; // first matching rule wins
    }
  });

  return suggestions;
}
