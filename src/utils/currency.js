/**
 * utils/currency.js
 * -----------------
 * Pure formatting functions for monetary values.
 * No side effects. No state. Input in, string out.
 */

/** Format a number as AUD currency — no cents on whole dollars */
export function fmt(n) {
  if (n == null || isNaN(n)) return '$0.00';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${formatted}`;
}

/** Format with explicit +/− sign */
export function fmtSigned(n) {
  if (n == null || isNaN(n)) return '$0.00';
  return `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
}

/** Format for accounting display — negative values shown in brackets */
export function fmtAcct(n) {
  if (n == null || isNaN(n)) return '$0.00';
  return n < 0 ? `(${fmt(Math.abs(n))})` : fmt(n);
}

/** Parse a currency string to a float, handling $, commas, brackets */
export function parseCurrency(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const cleaned = String(str).replace(/[$,\s]/g, '');
  // Bracketed negatives: (1,234.56) → -1234.56
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    return -parseFloat(cleaned.slice(1, -1)) || 0;
  }
  return parseFloat(cleaned) || 0;
}

/** Round to 2 decimal places — avoids floating point drift in accounting */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
