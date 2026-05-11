/**
 * utils/journalMath.js
 * --------------------
 * Pure accounting math — no database calls, no side effects.
 * Every function takes data in, returns data out.
 *
 * Double-entry accounting rules applied here:
 *   - Every transaction has equal debits and credits
 *   - Money OUT (negative amount): DR expense/asset, CR bank
 *   - Money IN  (positive amount): DR bank, CR income/equity
 */

/**
 * Build the debit/credit lines for a transaction categorisation.
 * Returns an array of journal line objects ready to insert.
 *
 * @param {object} txn        - transaction (id, date, amt, account_id)
 * @param {object} category   - category (id, t: 'income'|'expense'|'asset'|'liability'|'equity')
 * @param {object} bankAccount - bank account (id)
 * @returns {{ debit_category_id, credit_category_id, bank_account_id, amount, description }[]}
 */
export function buildJournalLines(txn, category, bankAccount) {
  if (!txn || !category) return [];
  const amount = Math.abs(txn.amt ?? txn.amount ?? 0);
  if (amount < 0.005) return [];

  const isExpenseOrAsset = ['expense', 'asset'].includes(category.t);
  const isIncome         = ['income', 'equity', 'liability'].includes(category.t);
  const moneyOut         = (txn.amt ?? txn.amount ?? 0) < 0;

  // Money out + expense = DR expense, CR bank
  // Money in  + income  = DR bank, CR income
  let drCatId = null, crCatId = null;
  let drBankId = null, crBankId = null;

  if (moneyOut && isExpenseOrAsset) {
    drCatId  = category.id;
    crBankId = bankAccount?.id ?? null;
  } else if (!moneyOut && isIncome) {
    drBankId = bankAccount?.id ?? null;
    crCatId  = category.id;
  } else if (moneyOut && isIncome) {
    // Refund / reversal of income
    crCatId  = category.id;
    drBankId = bankAccount?.id ?? null;
  } else {
    // Asset purchase / liability payment etc.
    drCatId  = category.id;
    crBankId = bankAccount?.id ?? null;
  }

  return [{
    transaction_id:      txn.id,
    debit_category_id:   drCatId,
    credit_category_id:  crCatId,
    debit_bank_account:  drBankId,
    credit_bank_account: crBankId,
    amount,
    description: txn.desc ?? txn.description ?? '',
    date:        txn.date ?? '',
    is_reversal: false,
  }];
}

/**
 * Build reversal lines for an existing set of journal lines.
 * Flips debit ↔ credit and marks as is_reversal: true.
 */
export function buildReversalLines(originalLines) {
  return originalLines.map(l => ({
    ...l,
    id:                  undefined, // new row
    debit_category_id:   l.credit_category_id,
    credit_category_id:  l.debit_category_id,
    debit_bank_account:  l.credit_bank_account,
    credit_bank_account: l.debit_bank_account,
    is_reversal:         true,
  }));
}

/**
 * Verify a set of journal lines balances (total debits === total credits).
 * Returns { balanced: bool, debits: number, credits: number, diff: number }
 */
export function checkBalance(lines) {
  const debits  = lines.reduce((s, l) => s + (l.debit_category_id  || l.debit_bank_account  ? l.amount : 0), 0);
  const credits = lines.reduce((s, l) => s + (l.credit_category_id || l.credit_bank_account ? l.amount : 0), 0);
  const diff    = Math.abs(debits - credits);
  return { balanced: diff < 0.01, debits, credits, diff };
}

/**
 * Build a Trial Balance from journal lines.
 * Returns array of { id, label, code, type, debit, credit, net }
 */
export function buildTrialBalance(lines, catMap, accountMap = {}) {
  const rows = {};

  const add = (id, label, code, type, side, amount) => {
    if (!id) return;
    if (!rows[id]) rows[id] = { id, label, code, type, debit: 0, credit: 0 };
    rows[id][side] += amount;
  };

  for (const l of lines) {
    if (l.debit_category_id) {
      const c = catMap[l.debit_category_id];
      if (c) add(c.id, c.l, c.code, c.t, 'debit', l.amount);
    }
    if (l.credit_category_id) {
      const c = catMap[l.credit_category_id];
      if (c) add(c.id, c.l, c.code, c.t, 'credit', l.amount);
    }
    if (l.debit_bank_account) {
      const a = accountMap[l.debit_bank_account];
      if (a) add(a.id, a.name ?? a.label, null, 'asset', 'debit', l.amount);
    }
    if (l.credit_bank_account) {
      const a = accountMap[l.credit_bank_account];
      if (a) add(a.id, a.name ?? a.label, null, 'asset', 'credit', l.amount);
    }
  }

  return Object.values(rows).map(r => ({ ...r, net: r.debit - r.credit }));
}

/** True if the trial balance has equal total debits and credits */
export function isTBBalanced(tbRows) {
  const dr = tbRows.reduce((s, r) => s + r.debit, 0);
  const cr = tbRows.reduce((s, r) => s + r.credit, 0);
  return Math.abs(dr - cr) < 0.01;
}
