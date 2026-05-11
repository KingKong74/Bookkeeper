/**
 * views/Banking/ImportStatement/importHelpers.js
 * Pure helpers — no React, no side effects.
 */
import { parseCSVText, autoDetectColumns, buildTransactions } from '../../../utils/csvParser';
import { parsePDF } from '../../../utils/pdfParser';

export const fmtAmt = n =>
  '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const CAT_TYPE_ORDER  = ['income', 'expense', 'asset', 'liability', 'equity'];
export const CAT_TYPE_LABELS = {
  income: 'Income', expense: 'Expenses', asset: 'Assets',
  liability: 'Liabilities', equity: 'Equity',
};

export function categorySections(cats) {
  const sorted = [...(cats || [])].sort((a, b) => {
    const typeDiff = CAT_TYPE_ORDER.indexOf(a.t) - CAT_TYPE_ORDER.indexOf(b.t);
    return typeDiff || (a.l || '').localeCompare(b.l || '');
  });
  return CAT_TYPE_ORDER
    .map(type => ({ type, label: CAT_TYPE_LABELS[type], items: sorted.filter(c => c.t === type) }))
    .filter(s => s.items.length > 0);
}

/** Parse a single file → { filename, transactions, summary, error, fileType } */
export async function parseFile(file, existingTxns) {
  const isPDF = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  try {
    if (isPDF) {
      const result = await parsePDF(file, existingTxns);
      return { filename: file.name, transactions: result.transactions, summary: result.summary, debugRows: result.debugRows, fileType: 'pdf' };
    }
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const { headers, rows } = parseCSVText(e.target.result);
          const colMap = autoDetectColumns(headers, file.name);
          const { transactions } = buildTransactions(rows, colMap, existingTxns);
          resolve({ filename: file.name, transactions, summary: null, headers, rows, colMap, fileType: 'csv' });
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  } catch (e) {
    return { filename: file.name, transactions: [], summary: null, error: e.message, fileType: isPDF ? 'pdf' : 'csv' };
  }
}

/** Compute reconciliation status for one parsed file */
export function calcRecon(pf, excludedKeys) {
  const { summary, transactions = [] } = pf;
  if (!summary) return null;
  const { openingBalance, closingBalance } = summary;
  if (openingBalance == null || closingBalance == null) return null;
  const included  = transactions.filter(t => !excludedKeys.has(t._key));
  const sumOfTxns = included.reduce((s, t) => s + t.amt, 0);
  const expected  = closingBalance - openingBalance;
  const diff      = Math.abs(Math.abs(sumOfTxns) - Math.abs(expected));
  return {
    openingBalance, closingBalance, expected, sumOfTxns, diff,
    balanced:    diff < 0.05,
    totalCredits: included.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0),
    totalDebits:  Math.abs(included.filter(t => t.amt < 0).reduce((s, t) => s + t.amt, 0)),
  };
}
