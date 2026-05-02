/**
 * components/ui/index.jsx
 * -----------------------
 * Small, reusable UI primitives used throughout the app.
 * Each component has one job and no business logic.
 *
 * Exports:
 *   Button        – standard button with variant support
 *   Badge         – small coloured count pill (sidebar badges)
 *   CategoryPill  – coloured category tag with dot
 *   PayeeAvatar   – initials avatar for a payee
 *   Toast         – floating notification bar
 *   BalanceAlert  – green/red "balanced / not balanced" banner
 *   MetricCard    – single KPI tile (used in header rows)
 */

import React from 'react';
import { initials, payeeColor } from '../../utils/helpers';

// ── Button ────────────────────────────────────────────────────────────────────
/**
 * variant: 'default' | 'primary' | 'ghost' | 'approve' | 'danger' | 'sm'
 * Additional className and onClick props are passed through.
 */
export function Button({ children, variant = 'default', className = '', ...props }) {
  const base = 'btn';
  const variants = {
    default:  '',
    primary:  'btn-a',
    ghost:    'btn-ghost',
    approve:  'btn-approve',
    danger:   'btn-reject',
    sm:       'btn-sm',
  };
  return (
    <button className={`${base} ${variants[variant] || ''} ${className}`} {...props}>
      {children}
    </button>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
/** Small pill shown in the sidebar next to nav items to show a count. */
export function Badge({ count, red = false }) {
  if (!count) return null;
  return <span className={`sbadge${red ? ' red' : ''}`}>{count}</span>;
}

// ── CategoryPill ──────────────────────────────────────────────────────────────
/**
 * Coloured pill showing a category name.
 * If no category is provided, renders an "Allocate…" placeholder.
 * onClick is called when the user clicks the pill (to open the dropdown).
 */
export function CategoryPill({ category, onClick }) {
  if (!category) {
    return (
      <span className="cpill cunalloc" onClick={onClick}>
        Allocate…
      </span>
    );
  }
  return (
    <span
      className="cpill"
      style={{
        background:   `${category.col}18`,
        color:         category.col,
        borderColor:  `${category.col}44`,
      }}
      onClick={onClick}
    >
      <span className="cdot" style={{ background: category.col }} />
      {category.l}
    </span>
  );
}

// ── PayeeAvatar ───────────────────────────────────────────────────────────────
/**
 * Round avatar showing 1–2 initials for a payee name.
 * size: 'sm' (20px) | 'md' (26px, default)
 */
export function PayeeAvatar({ name, payeesList = [], size = 'md' }) {
  if (!name) {
    return (
      <span
        className="payee-avatar"
        style={{ width: size === 'sm' ? 20 : 26, height: size === 'sm' ? 20 : 26, fontSize: size === 'sm' ? 9 : 11, background: 'var(--sand2)', color: 'var(--stone)' }}
      >
        ?
      </span>
    );
  }
  const col = payeeColor(name, payeesList);
  return (
    <span
      className="payee-avatar"
      style={{ width: size === 'sm' ? 20 : 26, height: size === 'sm' ? 20 : 26, fontSize: size === 'sm' ? 9 : 11, background: `${col}22`, color: col }}
    >
      {initials(name)}
    </span>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
/** Floating notification bar. Shown when toastMsg is non-empty. */
export function Toast({ message }) {
  return (
    <div className={`toast${message ? ' show' : ''}`}>
      {message}
    </div>
  );
}

// ── BalanceAlert ──────────────────────────────────────────────────────────────
/** Green success / red warning banner for Trial Balance and Balance Sheet. */
export function BalanceAlert({ balanced, okText, warnText }) {
  return (
    <div className={`bal-ok ${balanced ? 'ok' : 'warn'}`}>
      <svg viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
        {balanced
          ? <path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        }
      </svg>
      {balanced ? okText : warnText}
    </div>
  );
}

// ── MetricCard ────────────────────────────────────────────────────────────────
/**
 * A single KPI tile used in the metrics row at the top of each view.
 * valueClass: optional CSS class on the value (e.g. 'vp', 'vn', 'va')
 */
export function MetricCard({ label, value, sub, valueClass = '', onClick }) {
  return (
    <div className="mc" style={onClick ? { cursor: 'pointer' } : {}} onClick={onClick}>
      <div className="mc-lbl">{label}</div>
      <div className={`mc-val ${valueClass}`}>{value}</div>
      {sub && <div className="mc-sub">{sub}</div>}
    </div>
  );
}
