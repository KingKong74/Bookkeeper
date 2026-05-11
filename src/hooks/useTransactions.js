/**
 * hooks/useTransactions.js
 * ------------------------
 * Encapsulates all transaction state management and mutation logic.
 * Components call these handlers — they don't orchestrate DB + journal + audit directly.
 *
 * This hook reads from AppContext (shared global state) and
 * coordinates the three-step pattern for category assignment:
 *   1. Optimistic UI update
 *   2. DB write (fire-and-forget after UI update)
 *   3. Journal post (async, non-blocking)
 */

import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { updateTransaction, deleteTransaction } from '../lib/supabase';
import { postCategoryJournal } from '../services/journalService';
import { upsertPayee } from '../services/categoryService';
import { logAudit } from '../lib/audit';
import { extractMerchantName } from '../utils/merchant';

// How many times a user must remove a payee/category before suppressing auto-assign
const SUPPRESS_THRESHOLD = 2;

function getSuppressed(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function recordSuppression(key, keyword) {
  const s = getSuppressed(key);
  s[keyword] = (s[keyword] || 0) + 1;
  try { localStorage.setItem(key, JSON.stringify(s)); } catch {}
}
export function isSuppressed(key, keyword) {
  return (getSuppressed(key)[keyword] || 0) >= SUPPRESS_THRESHOLD;
}

export const SUPPRESS_PAYEE = 'ledger_suppressed_payee';
export const SUPPRESS_CAT   = 'ledger_suppressed_cat';

export function useTransactions() {
  const {
    txns, setTxns,
    catMap, payees, setPayees,
    accounts, org, user,
    PALETTE,
  } = useApp();

  /**
   * Assign a category to a transaction.
   * Updates UI immediately, then posts DB write and journal in background.
   */
  const assignCategory = useCallback(async (txnId, catId) => {
    const txn = txns.find(t => t.id === txnId);
    if (!txn) return;

    const prev = txn.cat ? catMap[txn.cat]?.l : null;
    const next = catId   ? catMap[catId]?.l   : null;

    // Suppress tracking: removing a category records the merchant
    if (!catId) {
      const kw = (extractMerchantName(txn.desc || '') || '').toLowerCase();
      if (kw) recordSuppression(SUPPRESS_CAT, kw);
    }

    // 1. Optimistic UI update — instant feedback
    setTxns(prev => prev.map(t =>
      t.id === txnId ? { ...t, cat: catId ?? null, category_id: catId ?? null } : t
    ));

    // 2. DB write — fire and forget
    updateTransaction(txnId, { category_id: catId ?? null })
      .catch(e => console.warn('updateTransaction failed:', e.message));

    // 3. Audit log — non-blocking
    logAudit({
      orgId: org.id, userId: user?.id, transaction: txn,
      action: catId ? 'category_changed' : 'unallocated',
      changedFields: { category: { from: prev ?? 'Unallocated', to: next ?? 'Unallocated' } },
    }).catch(() => {});

    // 4. Journal — non-blocking, only when assigning (not removing)
    if (catId) {
      const cat  = catMap[catId];
      const acct = txn.account_id ? accounts.find(a => a.id === txn.account_id) : null;
      postCategoryJournal(org.id, txn, cat, acct)
        .catch(e => console.warn('Journal post failed:', e.message));
    }
  }, [txns, catMap, accounts, org, user, setTxns]);

  /**
   * Assign a payee to a transaction.
   * Creates the payee if it doesn't exist yet.
   */
  const assignPayee = useCallback(async (txnId, payeeObj) => {
    const txn = txns.find(t => t.id === txnId);
    if (!txn) return;

    // Suppress tracking: removing a payee records the merchant
    if (!payeeObj) {
      const kw = (extractMerchantName(txn.desc || '') || '').toLowerCase();
      if (kw) recordSuppression(SUPPRESS_PAYEE, kw);
    }

    // Optimistic update
    setTxns(prev => prev.map(t =>
      t.id === txnId
        ? { ...t, payee: payeeObj?.name ?? '', payee_id: payeeObj?.id ?? null }
        : t
    ));

    // DB write — fire and forget
    updateTransaction(txnId, { payee_id: payeeObj?.id ?? null }).catch(() => {});

    // Audit — non-blocking
    logAudit({
      orgId: org.id, userId: user?.id, transaction: txn,
      action: 'payee_changed',
      changedFields: { payee: { from: txn.payee || 'None', to: payeeObj?.name || 'None' } },
    }).catch(() => {});
  }, [txns, org, user, setTxns]);

  /**
   * Ensure a payee exists by name — creates it if not found.
   * Used during auto-assignment to create payees from merchant names.
   */
  const ensurePayeeByName = useCallback(async (name) => {
    if (!name?.trim() || !org) return null;
    const existing = payees.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const colour = PALETTE[payees.length % PALETTE.length];
    const created = await upsertPayee(org.id, name.trim(), colour);
    setPayees(prev => [...prev, created]);
    return created;
  }, [payees, setPayees, org, PALETTE]);

  /**
   * Delete a transaction and remove it from local state.
   */
  const removeTransaction = useCallback(async (txnId) => {
    const txn = txns.find(t => t.id === txnId);
    setTxns(prev => prev.filter(t => t.id !== txnId));
    await deleteTransaction(txnId);
    if (txn) {
      logAudit({ orgId: org.id, userId: user?.id, transaction: txn, action: 'deleted' }).catch(() => {});
    }
  }, [txns, setTxns, org, user]);

  return { assignCategory, assignPayee, ensurePayeeByName, removeTransaction };
}
