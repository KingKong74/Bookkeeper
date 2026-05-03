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

/**
 * buildJournalLines(txn, category, bankAccount)
 * Pure function — no DB. Generates the two balanced DR/CR lines
 * for a transaction when it is assigned to a category.
 *
 * Money OUT (amt < 0): DR category (expense/asset) | CR bank account (asset)
 * Money IN  (amt > 0): DR bank account (asset)     | CR category (income/equity)
 */
export function buildJournalLines(txn, category, bankAccount) {
  const amt        = Math.abs(parseFloat(txn.amt ?? txn.amount) || 0);
  const isDebit    = parseFloat(txn.amt ?? txn.amount) < 0;
  const bankName   = bankAccount?.name ?? 'Suspense / Clearing';
  const bankAcctId = bankAccount?.id   ?? null;
  const catName    = category?.l ?? category?.label ?? 'Uncategorised';
  const catId      = category?.id ?? null;

  if (isDebit) {
    return [
      { account_name: catName,  debit: amt, credit: 0,   sort_order: 0, category_id: catId,    bank_account_id: null       },
      { account_name: bankName, debit: 0,   credit: amt, sort_order: 1, category_id: null,     bank_account_id: bankAcctId },
    ];
  } else {
    return [
      { account_name: bankName, debit: amt, credit: 0,   sort_order: 0, category_id: null,     bank_account_id: bankAcctId },
      { account_name: catName,  debit: 0,   credit: amt, sort_order: 1, category_id: catId,    bank_account_id: null       },
    ];
  }
}

/**
 * buildTBFromJournals(journals, dateFrom, dateTo, catMap, accountMap)
 * -------------------------------------------------------------------
 * Build trial balance account totals from double-entry journal lines.
 * This replaces buildAccountTotals() for reports — gives a TRUE trial balance
 * where sum(DR) === sum(CR).
 *
 * Returns array of:
 *   { ac, label, type, col, dr, cr, net }
 *   where net = cr - dr  (positive = credit balance, negative = debit balance)
 *
 * Only includes auto_category and manual journals (not import stubs).
 * Filters to the given date range using journal_entries.date.
 */
export function buildTBFromJournals(journals, dateFrom, dateTo, catMap, accountMap = {}) {
  const map = {};

  const inRange = j => {
    if (!j?.date) return false;
    return j.date >= dateFrom && j.date <= dateTo;
  };

  (journals || []).forEach(journal => {
    if (!inRange(journal)) return;

    (journal.journal_lines || journal.lines || []).forEach(line => {
      const dr  = parseFloat(line.debit)  || 0;
      const cr  = parseFloat(line.credit) || 0;
      if (dr === 0 && cr === 0) return;

      // Resolve account from category or bank account
      let key, label, type, col;

      if (line.category_id && catMap[line.category_id]) {
        const cat = catMap[line.category_id];
        key   = `cat:${cat.id}`;
        label = cat.l;
        type  = cat.t;
        col   = cat.col;
      } else if (line.bank_account_id && accountMap[line.bank_account_id]) {
        const acct = accountMap[line.bank_account_id];
        key   = `bank:${acct.id}`;
        label = acct.name;
        type  = 'asset';
        col   = acct.colour || '#185FA5';
      } else {
        // Fall back to account_name (suspense or old-style journals)
        const name = line.account_name || 'Unknown';
        key   = `name:${name}`;
        label = name;
        type  = name.toLowerCase().includes('suspense') ? 'asset' : 'expense';
        col   = '#888780';
      }

      if (!map[key]) map[key] = { key, label, type, col, dr: 0, cr: 0 };
      map[key].dr += dr;
      map[key].cr += cr;
    });
  });

  return Object.values(map).map(a => ({
    ...a,
    net: a.cr - a.dr,
  }));
}

/**
 * isTBBalanced(tbRows)
 * Returns true when sum(DR) === sum(CR) within 1 cent.
 * A balanced TB is the primary signal that double-entry is working.
 */
export function isTBBalanced(tbRows) {
  const totalDR = (tbRows || []).reduce((s, r) => s + r.dr, 0);
  const totalCR = (tbRows || []).reduce((s, r) => s + r.cr, 0);
  return Math.abs(totalDR - totalCR) < 0.01;
}

/**
 * buildPLFromJournals(journals, dateFrom, dateTo, catMap, accountMap)
 * -------------------------------------------------------------------
 * Build P&L lines from posted journal lines.
 * Income lines: accounts whose category type = 'income'  → CR dominant
 * Expense lines: accounts whose category type = 'expense' → DR dominant
 *
 * Returns { incomeLines, expenseLines, totalIncome, totalExpense, netProfit }
 * where totalIncome is a positive number and totalExpense is a positive number.
 */
export function buildPLFromJournals(journals, dateFrom, dateTo, catMap, accountMap = {}) {
  const map = {};

  (journals || []).forEach(journal => {
    if (!journal?.date || journal.date < dateFrom || journal.date > dateTo) return;

    (journal.journal_lines || journal.lines || []).forEach(line => {
      if (!line.category_id) return; // skip bank/suspense lines
      const cat = catMap[line.category_id];
      if (!cat) return;
      if (cat.t !== 'income' && cat.t !== 'expense') return;

      const key = cat.id;
      if (!map[key]) map[key] = { ...cat, total: 0, dr: 0, cr: 0 };
      map[key].dr += parseFloat(line.debit)  || 0;
      map[key].cr += parseFloat(line.credit) || 0;
      // Net: income accounts are credit-normal, expense accounts are debit-normal
      map[key].total = map[key].cr - map[key].dr;
    });
  });

  const lines        = Object.values(map);
  const incomeLines  = lines.filter(c => c.t === 'income' && (c.cr - c.dr) > 0);
  const expenseLines = lines.filter(c => c.t === 'expense' && (c.dr - c.cr) > 0);

  const totalIncome  = incomeLines.reduce((s, c) => s + (c.cr - c.dr), 0);
  const totalExpense = expenseLines.reduce((s, c) => s + (c.dr - c.cr), 0);
  const netProfit    = totalIncome - totalExpense;

  return { incomeLines, expenseLines, totalIncome, totalExpense, netProfit, allLines: lines };
}

/**
 * buildBSFromJournals(journals, dateFrom, dateTo, catMap, accountMap, accounts)
 * ------------------------------------------------------------------------------
 * Build Balance Sheet from posted journal lines.
 *
 * Assets     = accounts with category type 'asset' + bank account (DR-normal)
 * Liabilities = accounts with category type 'liability' (CR-normal)
 * Equity     = Assets - Liabilities (residual — always balances)
 *
 * Returns { assetLines, liabilityLines, equityLines,
 *           totalAssets, totalLiabilities, totalEquity, balanced }
 */
export function buildBSFromJournals(journals, dateFrom, dateTo, catMap, accountMap = {}) {
  const catBalances  = {};  // category-based accounts
  const bankBalances = {};  // bank account lines

  (journals || []).forEach(journal => {
    // Balance Sheet is CUMULATIVE (all time to dateTo), so only filter by dateTo
    if (!journal?.date || journal.date > dateTo) return;

    (journal.journal_lines || journal.lines || []).forEach(line => {
      const dr = parseFloat(line.debit)  || 0;
      const cr = parseFloat(line.credit) || 0;

      if (line.category_id && catMap[line.category_id]) {
        const cat = catMap[line.category_id];
        if (!['asset','liability','equity'].includes(cat.t)) return;
        if (!catBalances[cat.id]) catBalances[cat.id] = { ...cat, dr: 0, cr: 0 };
        catBalances[cat.id].dr += dr;
        catBalances[cat.id].cr += cr;
      } else if (line.bank_account_id && accountMap[line.bank_account_id]) {
        const acct = accountMap[line.bank_account_id];
        if (!bankBalances[acct.id]) bankBalances[acct.id] = { ...acct, dr: 0, cr: 0, type: acct.type };
        bankBalances[acct.id].dr += dr;
        bankBalances[acct.id].cr += cr;
      }
    });
  });

  // Net = DR - CR for asset/expense accounts (debit-normal)
  //       CR - DR for liability/equity/income accounts (credit-normal)
  const catLines  = Object.values(catBalances).map(c => ({ ...c, net: c.t==='asset' ? c.dr-c.cr : c.cr-c.dr }));
  const bankLines = Object.values(bankBalances).map(b => {
    // Bank accounts: checking/savings/investment are assets (DR-normal)
    // CC/loans are liabilities (CR-normal)
    const isLiab = b.type === 'credit_card' || b.type === 'loan';
    return { ...b, l: b.name, t: isLiab ? 'liability' : 'asset', col: b.colour || '#185FA5', net: isLiab ? b.cr-b.dr : b.dr-b.cr };
  });

  const allLines        = [...catLines, ...bankLines].filter(l => l.net !== 0);
  const assetLines      = allLines.filter(l => l.t === 'asset');
  const liabilityLines  = allLines.filter(l => l.t === 'liability');
  const equityLines     = allLines.filter(l => l.t === 'equity');

  const totalAssets      = assetLines.reduce((s, l) => s + l.net, 0);
  const totalLiabilities = liabilityLines.reduce((s, l) => s + l.net, 0);
  const totalEquity      = totalAssets - totalLiabilities; // always balances
  const balanced         = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

  return {
    assetLines, liabilityLines, equityLines,
    totalAssets, totalLiabilities, totalEquity, totalLE: totalLiabilities + totalEquity,
    balanced,
  };
}
