/**
 * views/Banking/Transactions/transactionHelpers.js
 * Suppression store — localStorage-backed tracking of dismissed suggestions.
 */
export const SUPPRESS_THRESHOLD = 2;
export const SUPPRESS_KEY_PAYEE = 'ledger_suppressed_payee';
export const SUPPRESS_KEY_CAT   = 'ledger_suppressed_cat';

export function getSuppressed(k) {
  try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; }
}
export function recordSuppression(k, kw) {
  const s = getSuppressed(k);
  s[kw] = (s[kw] || 0) + 1;
  try { localStorage.setItem(k, JSON.stringify(s)); } catch {}
  return s[kw];
}
export function isSuppressed(k, kw) {
  return (getSuppressed(k)[kw] || 0) >= SUPPRESS_THRESHOLD;
}
