/**
 * utils/helpers.js
 * ----------------
 * Pure utility functions shared across the whole app.
 * No React, no state — just plain logic you can test in isolation.
 */

import { PALETTE } from '../data/seeds';
import { extractMerchantName, groupDescriptionsByMerchant } from './merchant.js';
export { extractMerchantName, groupDescriptionsByMerchant };

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

/**
 * Accounting format: negative values shown as ($x,xxx.xx), positive as $x,xxx.xx
 */
export function fmtAcct(n) {
  const abs = '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < -0.005 ? `(${abs})` : abs;
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
  if (!transactions) return [];
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
  if (!transactions || !rules) return [];
  const suggestions = [];

  transactions.forEach(t => {
    if (t.cat && t.payee) return;

    const descLower = t.desc.toLowerCase();
    const amt       = Math.abs(t.amt ?? 0);

    for (const rule of rules) {
      // 1. Keyword match
      if (!rule.keyword || !descLower.includes(rule.keyword.toLowerCase())) continue;

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

      const catObj = (line.category_id && catMap[line.category_id]) ? catMap[line.category_id] : null;
      if (!map[key]) map[key] = { key, label, type, col, dr: 0, cr: 0,
        cat_id:    catObj?.id    || null,
        code:      catObj?.code  || null,
        parent_id: catObj?.parent_id || null,
      };
      map[key].dr += dr;
      map[key].cr += cr;
    });
  });

  const TYPE_ORD = ['asset','liability','equity','income','expense'];
  return Object.values(map)
    .map(a => ({ ...a, net: a.cr - a.dr }))
    .filter(a => Math.abs(a.net) > 0.005)   // hide accounts that net to zero (fully reversed)
    .sort((a,b) => {
      const ta = TYPE_ORD.indexOf(a.type), tb = TYPE_ORD.indexOf(b.type);
      if (ta !== tb) return (ta===-1?99:ta)-(tb===-1?99:tb);
      if (a.parent_id && !b.parent_id && b.cat_id === a.parent_id) return 1;
      if (b.parent_id && !a.parent_id && a.cat_id === b.parent_id) return -1;
      const ca = parseInt(a.code)||9999, cb = parseInt(b.code)||9999;
      return ca-cb;
    });
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
  const incomeLines  = lines.filter(c => c.t === 'income'  && Math.abs(c.cr - c.dr) > 0.005);
  const expenseLines = lines.filter(c => c.t === 'expense' && Math.abs(c.dr - c.cr) > 0.005);

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

  // ── Seed bank account opening balances ──
  // Opening balance represents the account value BEFORE any transactions.
  // For assets (checking/savings): positive = you have money → seeds as DR
  // For liabilities (CC/loan): opening_balance stored as the amount OWED (positive = owed)
  //   so seeds as CR on the liability side.
  Object.values(accountMap).forEach(acct => {
    const ob = parseFloat(acct.opening_balance) || 0;
    if (ob === 0) return;
    const isLiab = acct.type === 'credit_card' || acct.type === 'loan';
    if (!bankBalances[acct.id]) bankBalances[acct.id] = { ...acct, dr: 0, cr: 0, type: acct.type };
    if (isLiab) {
      // CC/loan: opening balance is money owed → credit side (liability increases on CR)
      bankBalances[acct.id].cr += Math.abs(ob);
    } else {
      // Asset: opening balance is money held → debit side (asset increases on DR)
      bankBalances[acct.id].dr += ob;
    }
  });

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
    const net = isLiab ? b.cr - b.dr : b.dr - b.cr;
    return { ...b, l: b.name, t: isLiab ? 'liability' : 'asset', col: b.colour || '#185FA5', net };
  });

  const allLines        = [...catLines, ...bankLines].filter(l => l.net !== 0);
  const assetLines      = allLines.filter(l => l.t === 'asset'     && Math.abs((l.cr||0)-(l.dr||0)) > 0.005);
  const liabilityLines  = allLines.filter(l => l.t === 'liability' && Math.abs((l.cr||0)-(l.dr||0)) > 0.005);
  const equityLines     = allLines.filter(l => l.t === 'equity'    && Math.abs((l.cr||0)-(l.dr||0)) > 0.005);

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

/**
 * analyseImportedTransactions(transactions, existingRules, catMap, payees)
 * -------------------------------------------------------------------------
 * Analyses a batch of imported transactions to discover:
 *   1. Payees that appear repeatedly → suggest adding as a payee
 *   2. Descriptions that match existing payee names → auto-suggest payee
 *   3. Keywords from existing rules that match → flag as auto-cat candidates
 *   4. New recurring patterns → suggest creating rules
 *
 * Returns:
 *   {
 *     suggestions:    [ { txnId, sugCat, sugPayee, confidence, reason } ]
 *     newPayees:      [ { name, count, txnIds } ]  — payee names not yet in list
 *     ruleOpportunities: [ { keyword, count, exampleDesc } ]  — suggest new rules
 *   }
 */
export function analyseImportedTransactions(transactions, existingRules, catMap, payees, cats = [], dbHints = []) {
  if (!transactions) return { suggestions:[], newPayees:[], ruleOpportunities:[] };
  const suggestions       = [];
  const descFrequency     = {};   // normalised description → [txnIds]
  const matchedPayees     = {};   // payee name candidate → count
  const ruleMatches       = {};   // rule keyword → count

  const payeeNames = (payees || []).map(p => p.name.toLowerCase());

  // Run existing rules first
  const ruleResults = runAutoCatRules(transactions, existingRules || []);
  const ruleMap     = Object.fromEntries(ruleResults.map(r => [r.txnId, r]));

  for (const t of transactions) {
    const desc = (t.desc || t.description || '').trim();
    const id   = t.id || t._key;

    // 1. Carry through rule suggestions
    if (ruleMap[id]) {
      suggestions.push({
        txnId:      id,
        sugCat:     ruleMap[id].sugCat,
        sugPayee:   ruleMap[id].sugPayee,
        confidence: ruleMap[id].confidence,
        reason:     `Rule: "${ruleMap[id].rule}"`,
      });
    }

    // 2. Extract merchant name intelligently
    const merchant = extractMerchantName(desc);
    if (merchant) {
      const key = merchant.toLowerCase();
      if (!descFrequency[key]) descFrequency[key] = { name: merchant, instances: [] };
      descFrequency[key].instances.push({ id, desc });
    }

    // 3. Check if any existing payee name appears in the description
    // Match either full name or any significant word from the payee name
    for (const pName of payeeNames) {
      const pWords = pName.split(/\s+/).filter(w => w.length > 3);
      const descLow = desc.toLowerCase();
      const matches = pName.length > 3 && (descLow.includes(pName) || pWords.some(w => descLow.includes(w)));
      if (matches) {
        if (!ruleMap[id]?.sugPayee) {
          const existing = suggestions.find(s => s.txnId === id);
          if (existing) {
            existing.sugPayee = payees.find(p => p.name.toLowerCase() === pName)?.name;
          } else {
            suggestions.push({
              txnId:      id,
              sugCat:     null,
              sugPayee:   payees.find(p => p.name.toLowerCase() === pName)?.name,
              confidence: 'Medium',
              reason:     `Payee name "${pName}" found in description`,
            });
          }
        }
        break;
      }
    }
  }

  // 4. Find repeating merchant names — these become rule opportunities
  const ruleOpportunities = [];
  const newPayees = [];

  for (const [key, group] of Object.entries(descFrequency)) {
    if (group.instances.length < 2) continue;
    const { name, instances } = group;

    const alreadyHasRule = (existingRules || []).some(r => {
      const kw = r.keyword?.toLowerCase() || '';
      return key.includes(kw) || kw.includes(key);
    });

    if (!alreadyHasRule) {
      // Compute the most common amount (if consistent → suggest exact match)
      const amts     = instances.map(i => {
        const t = transactions.find(tx => (tx.id || tx._key) === i.id);
        return t ? Math.abs(parseFloat(t.amt || t.amount) || 0) : 0;
      }).filter(a => a > 0);
      const uniqueAmts = [...new Set(amts.map(a => a.toFixed(2)))];
      const amtExact   = uniqueAmts.length === 1 ? parseFloat(uniqueAmts[0]) : null;

      // Estimate category from merchant name + description
      const catEst = estimateCategoryForMerchant(name, instances[0].desc?.toLowerCase(), cats, dbHints);

      ruleOpportunities.push({
        keyword:       key,
        suggestName:   name,
        count:         instances.length,
        exampleDesc:   instances[0].desc,
        txnIds:        instances.map(i => i.id),
        amtExact:      amtExact,
        sugCatId:      catEst.catId,          // pre-suggested category
        sugCatLabel:   catEst.catLabel,
        catConfidence: catEst.confidence,     // 'high'|'medium'|'low'
        payee:         name,                  // merchant name as payee candidate
      });
    }

    // Also suggest as a new payee if not already known
    const alreadyPayee = payeeNames.some(p => p.includes(key) || key.includes(p));
    if (!alreadyPayee) {
      newPayees.push({ name, count: instances.length, txnIds: instances.map(i => i.id) });
    }
  }

  return {
    suggestions:       suggestions.filter(s => s.sugCat || s.sugPayee),
    newPayees:         newPayees,          // all detected new payees
    ruleOpportunities: ruleOpportunities,  // all detected patterns — no cap
  };
}

/**
 * extractPayeeCandidate(description, existingPayees)
 * --------------------------------------------------
 * Returns the best payee name candidate for a description,
 * first checking existing payees for a match, then falling
 * back to extractMerchantName.
 */
export function extractPayeeCandidate(description, existingPayees = []) {
  const descLow = (description || '').toLowerCase();
  // 1. Check existing payees first (exact match wins)
  for (const p of existingPayees) {
    const pWords = (p.name || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (pWords.some(w => descLow.includes(w))) return p.name;
  }
  // 2. Fall back to merchant extraction
  return extractMerchantName(description) || '';
}

// ── Merchant → Category intelligence map ────────────────────────────────────
// Maps merchant keywords (lowercase) to { catKeyword, type } for auto-suggestion.
// catKeyword is matched against category labels.
const MERCHANT_CAT_HINTS = {
  // Food & dining
  'woolworths':     { hint:'groceries',      type:'expense' },
  'coles':          { hint:'groceries',      type:'expense' },
  'aldi':           { hint:'groceries',      type:'expense' },
  'iga':            { hint:'groceries',      type:'expense' },
  'foodworks':      { hint:'groceries',      type:'expense' },
  'costco':         { hint:'groceries',      type:'expense' },
  'dominos':        { hint:'dining',         type:'expense' },
  "domino's":       { hint:'dining',         type:'expense' },
  'mcdonalds':      { hint:'dining',         type:'expense' },
  "mcdonald's":     { hint:'dining',         type:'expense' },
  'kfc':            { hint:'dining',         type:'expense' },
  'subway':         { hint:'dining',         type:'expense' },
  'uber eats':      { hint:'dining',         type:'expense' },
  'ubereats':       { hint:'dining',         type:'expense' },
  'doordash':       { hint:'dining',         type:'expense' },
  'menulog':        { hint:'dining',         type:'expense' },
  'hungry jacks':   { hint:'dining',         type:'expense' },
  'grill':          { hint:'dining',         type:'expense' },
  'pizza':          { hint:'dining',         type:'expense' },
  'cafe':           { hint:'dining',         type:'expense' },
  'coffee':         { hint:'dining',         type:'expense' },
  'restaurant':     { hint:'dining',         type:'expense' },
  'sushi':          { hint:'dining',         type:'expense' },
  'thai':           { hint:'dining',         type:'expense' },
  'chinese':        { hint:'dining',         type:'expense' },
  // Subscriptions
  'netflix':        { hint:'subscriptions',  type:'expense' },
  'spotify':        { hint:'subscriptions',  type:'expense' },
  'apple':          { hint:'subscriptions',  type:'expense' },
  'google':         { hint:'subscriptions',  type:'expense' },
  'adobe':          { hint:'subscriptions',  type:'expense' },
  'microsoft':      { hint:'subscriptions',  type:'expense' },
  'amazon':         { hint:'subscriptions',  type:'expense' },
  'stan':           { hint:'subscriptions',  type:'expense' },
  'disney':         { hint:'subscriptions',  type:'expense' },
  'binge':          { hint:'subscriptions',  type:'expense' },
  'foxtel':         { hint:'subscriptions',  type:'expense' },
  'youtube':        { hint:'subscriptions',  type:'expense' },
  'canva':          { hint:'subscriptions',  type:'expense' },
  'dropbox':        { hint:'subscriptions',  type:'expense' },
  'chatgpt':        { hint:'subscriptions',  type:'expense' },
  'openai':         { hint:'subscriptions',  type:'expense' },
  'github':         { hint:'subscriptions',  type:'expense' },
  'claude':         { hint:'subscriptions',  type:'expense' },
  // Transport & fuel
  'uber':           { hint:'transport',      type:'expense' },
  'lyft':           { hint:'transport',      type:'expense' },
  'ola':            { hint:'transport',      type:'expense' },
  'didi':           { hint:'transport',      type:'expense' },
  'opal':           { hint:'transport',      type:'expense' },
  'myki':           { hint:'transport',      type:'expense' },
  'go card':        { hint:'transport',      type:'expense' },
  'parking':        { hint:'transport',      type:'expense' },
  'bp':             { hint:'fuel',           type:'expense' },
  'shell':          { hint:'fuel',           type:'expense' },
  'caltex':         { hint:'fuel',           type:'expense' },
  'ampol':          { hint:'fuel',           type:'expense' },
  '7-eleven':       { hint:'fuel',           type:'expense' },
  '7eleven':        { hint:'fuel',           type:'expense' },
  'puma':           { hint:'fuel',           type:'expense' },
  // Utilities & phone
  'telstra':        { hint:'utilities',      type:'expense' },
  'optus':          { hint:'utilities',      type:'expense' },
  'vodafone':       { hint:'utilities',      type:'expense' },
  'tpg':            { hint:'utilities',      type:'expense' },
  'aussie':         { hint:'utilities',      type:'expense' },
  'iinet':          { hint:'utilities',      type:'expense' },
  'internode':      { hint:'utilities',      type:'expense' },
  'origin':         { hint:'utilities',      type:'expense' },
  'agl':            { hint:'utilities',      type:'expense' },
  'energy':         { hint:'utilities',      type:'expense' },
  'powershop':      { hint:'utilities',      type:'expense' },
  'alinta':         { hint:'utilities',      type:'expense' },
  'sydney water':   { hint:'utilities',      type:'expense' },
  'yarra water':    { hint:'utilities',      type:'expense' },
  // Health & fitness
  'goodlife':       { hint:'gym',            type:'expense' },
  'anytime fitness':{ hint:'gym',            type:'expense' },
  'gym':            { hint:'gym',            type:'expense' },
  'fitness':        { hint:'gym',            type:'expense' },
  'crossfit':       { hint:'gym',            type:'expense' },
  'f45':            { hint:'gym',            type:'expense' },
  'chemist':        { hint:'health',         type:'expense' },
  'pharmacy':       { hint:'health',         type:'expense' },
  'priceline':      { hint:'health',         type:'expense' },
  'nib':            { hint:'health',         type:'expense' },
  'medibank':       { hint:'health',         type:'expense' },
  'bupa':           { hint:'health',         type:'expense' },
  'ahm':            { hint:'health',         type:'expense' },
  // Insurance
  'suncorp':        { hint:'insurance',      type:'expense' },
  'gio':            { hint:'insurance',      type:'expense' },
  'racq':           { hint:'insurance',      type:'expense' },
  'racv':           { hint:'insurance',      type:'expense' },
  'youi':           { hint:'insurance',      type:'expense' },
  'budget direct':  { hint:'insurance',      type:'expense' },
  'allianz':        { hint:'insurance',      type:'expense' },
  'nrma':           { hint:'insurance',      type:'expense' },
  // Shopping & retail
  'kmart':          { hint:'shopping',       type:'expense' },
  'target':         { hint:'shopping',       type:'expense' },
  'big w':          { hint:'shopping',       type:'expense' },
  'myer':           { hint:'shopping',       type:'expense' },
  'david jones':    { hint:'shopping',       type:'expense' },
  'ikea':           { hint:'shopping',       type:'expense' },
  'jb hi-fi':       { hint:'shopping',       type:'expense' },
  'jb hifi':        { hint:'shopping',       type:'expense' },
  'harvey':         { hint:'shopping',       type:'expense' },
  'bunnings':       { hint:'shopping',       type:'expense' },
  'officeworks':    { hint:'shopping',       type:'expense' },
  'cotton on':      { hint:'clothing',       type:'expense' },
  'uniqlo':         { hint:'clothing',       type:'expense' },
  'zara':           { hint:'clothing',       type:'expense' },
  // Investments & savings
  'betashares':     { hint:'investments',    type:'asset'   },
  'vanguard':       { hint:'investments',    type:'asset'   },
  'comsec':         { hint:'investments',    type:'asset'   },
  'selfwealth':     { hint:'investments',    type:'asset'   },
  'stake':          { hint:'investments',    type:'asset'   },
  'coinspot':       { hint:'investments',    type:'asset'   },
  'binance':        { hint:'investments',    type:'asset'   },
  'raiz':           { hint:'investments',    type:'asset'   },
  'spaceship':      { hint:'investments',    type:'asset'   },
  // Income
  'payroll':        { hint:'salary',         type:'income'  },
  'salary':         { hint:'salary',         type:'income'  },
  'wages':          { hint:'salary',         type:'income'  },
  'centrelink':     { hint:'government',     type:'income'  },
  'services australia':{ hint:'government',  type:'income'  },
  'ato':            { hint:'tax',            type:'income'  },
  'tax refund':     { hint:'tax',            type:'income'  },
  // Banking & financial
  'afterpay':       { hint:'shopping',       type:'expense' },
  'zip':            { hint:'shopping',       type:'expense' },
  'humm':           { hint:'shopping',       type:'expense' },
};

/**
 * estimateCategoryForMerchant(merchantName, descriptionLower, cats)
 * ------------------------------------------------------------------
 * Given a merchant name and the available categories, suggest the best
 * matching category ID using the MERCHANT_CAT_HINTS map.
 *
 * Matching strategy (in order):
 *   1. Exact merchant keyword match in hint map
 *   2. Partial merchant name match in hint map
 *   3. hint keyword fuzzy-match against category labels
 *   4. fallback: match category type
 *
 * Returns: { catId: string|null, confidence: 'high'|'medium'|'low' }
 */
export function estimateCategoryForMerchant(merchantName, descriptionLower, cats, dbHints = []) {
  if (!cats || cats.length === 0) return { catId: null, confidence: 'low' };

  const mLow  = (merchantName || '').toLowerCase();
  const dLow  = (descriptionLower || '').toLowerCase();

  let hint = null;
  let confidence = 'low';

  // 1. DB hints take priority over hardcoded map (org-customisable)
  if (dbHints && dbHints.length > 0) {
    for (const h of dbHints) {
      const key = h.keyword.toLowerCase();
      if (mLow === key || mLow.startsWith(key) || key.startsWith(mLow)) {
        hint = { hint: h.hint, type: h.cat_type }; confidence = 'high'; break;
      }
    }
    if (!hint) {
      for (const h of dbHints) {
        if (dLow.includes(h.keyword.toLowerCase())) {
          hint = { hint: h.hint, type: h.cat_type }; confidence = 'medium'; break;
        }
      }
    }
  }

  // 2. Fallback to hardcoded map if no DB hint matched
  if (!hint) {
    for (const [key, val] of Object.entries(MERCHANT_CAT_HINTS)) {
      if (mLow === key || mLow.startsWith(key) || key.startsWith(mLow)) {
        hint = val; confidence = 'high'; break;
      }
    }
  }
  if (!hint) {
    for (const [key, val] of Object.entries(MERCHANT_CAT_HINTS)) {
      if (dLow.includes(key)) {
        hint = val; confidence = 'medium'; break;
      }
    }
  }

  if (!hint) return { catId: null, confidence: 'low' };

  // 3. Find the best matching category
  const hintWords = hint.hint.toLowerCase().split(/\s+/);

  // Score each category
  const scored = cats.map(cat => {
    const label = (cat.l || cat.label || '').toLowerCase();
    const group = (cat.ac || cat.account_group || '').toLowerCase();
    let score = 0;
    // Type match
    if (cat.t === hint.type || cat.type === hint.type) score += 10;
    // Label contains hint words
    for (const w of hintWords) {
      if (label.includes(w)) score += 5;
      if (group.includes(w)) score += 2;
    }
    return { cat, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (!best || best.score < 5) return { catId: null, confidence: 'low' };

  return {
    catId:      best.cat.id,
    catLabel:   best.cat.l || best.cat.label,
    confidence,
  };
}
