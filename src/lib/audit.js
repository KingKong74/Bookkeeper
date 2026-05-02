/**
 * lib/audit.js
 * ------------
 * Helpers for writing to and reading from the transaction audit log.
 * All writes are append-only — the audit trail is never modified.
 *
 * Usage:
 *   import { logAudit, getAuditTrail } from '../lib/audit';
 *   await logAudit({ orgId, userId, transaction, action, changedFields });
 */

import { supabase } from './supabase';

/**
 * Write an audit log entry.
 *
 * @param {object} params
 * @param {string} params.orgId          – org uuid
 * @param {string} params.userId         – auth user uuid
 * @param {object} params.transaction    – the transaction object (normalised)
 * @param {string} params.action         – 'created' | 'updated' | 'deleted' | etc.
 * @param {object} [params.changedFields] – { field: { from, to } } for updates
 * @param {string} [params.note]          – optional human note
 */
export async function logAudit({ orgId, userId, transaction, action, changedFields = null, note = null }) {
  const entry = {
    transaction_id: transaction.id,
    org_id:         orgId,
    user_id:        userId ?? null,
    action,
    changed_fields: changedFields,
    // Store a snapshot of the key fields at this point in time
    snapshot: {
      date:        transaction.date,
      description: transaction.desc || transaction.description,
      amount:      transaction.amt  || transaction.amount,
      category:    transaction.cat  || transaction.category_id,
      payee:       transaction.payee,
      note:        transaction.note,
    },
    note,
  };

  const { error } = await supabase.from('transaction_audit').insert(entry);
  if (error) {
    // Audit failures should never break the main flow — just log to console
    console.warn('Audit log failed:', error.message);
  }
}

/**
 * Fetch audit history for a specific transaction, newest first.
 *
 * @param {string} transactionId
 * @returns {object[]} audit log entries
 */
export async function getAuditTrail(transactionId) {
  const { data, error } = await supabase
    .from('transaction_audit')
    .select('*')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Fetch the full audit log for an org (for the Audit Trail report).
 *
 * @param {string} orgId
 * @param {object} [opts]
 * @param {string} [opts.from]   – ISO date
 * @param {string} [opts.to]     – ISO date
 * @param {number} [opts.limit]  – default 200
 */
export async function getOrgAuditLog(orgId, { from, to, limit = 200 } = {}) {
  let query = supabase
    .from('transaction_audit')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (from) query = query.gte('created_at', from);
  if (to)   query = query.lte('created_at', to + 'T23:59:59Z');

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Build a human-readable summary of what changed.
 * Used in the audit trail UI.
 */
export function describeChange(entry) {
  const labels = {
    created:          'Transaction created',
    imported:         'Imported from bank statement',
    updated:          'Transaction edited',
    deleted:          'Transaction deleted',
    category_changed: 'Category changed',
    payee_changed:    'Payee changed',
    unallocated:      'Category removed (unallocated)',
  };

  const base = labels[entry.action] || entry.action;
  const fields = entry.changed_fields;

  if (!fields || Object.keys(fields).length === 0) return base;

  const parts = Object.entries(fields).map(([field, change]) => {
    const from = change.from ?? 'none';
    const to   = change.to   ?? 'none';
    return `${field}: ${from} → ${to}`;
  });

  return `${base} (${parts.join(', ')})`;
}

/**
 * Format an audit timestamp nicely.
 */
export function formatAuditDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString('en-AU', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}
