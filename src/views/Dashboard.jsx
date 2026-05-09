/**
 * views/Dashboard.jsx — Overhauled professional dashboard
 * Aesthetic: editorial financial terminal — warm, data-dense, breathing
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { MetricCard, PayeeAvatar } from '../components/ui/index';
import { fmt, fmtAcct, filterByDateRange, payeeColor, runAutoCatRules, currentFYStart } from '../utils/helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function pct(a, b) { return b === 0 ? 0 : Math.round((a / b) * 100); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function getMonths(txns, n = 6) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d    = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    const from = d.toISOString().slice(0, 10);
    const to   = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    const mo   = filterByDateRange(txns, from, to);
    const inc  = mo.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0);
    const exp  = Math.abs(mo.filter(t => t.amt < 0).reduce((s, t) => s + t.amt, 0));
    return { label: d.toLocaleString('default', { month: 'short' }), income: inc, expenses: exp, net: inc - exp, txns: mo };
  });
}

function buildInsights(txns, catMap, accounts, prevTxns) {
  // Largest single expense
  const expenses = txns.filter(t => t.amt < 0).sort((a, b) => a.amt - b.amt);
  const biggest  = expenses[0] || null;

  // Fastest growing category vs last period
  const byCat = (ts) => {
    const m = {};
    ts.forEach(t => {
      const c = catMap[t.cat];
      if (!c || c.t !== 'expense') return;
      m[c.l] = (m[c.l] || 0) + Math.abs(t.amt);
    });
    return m;
  };
  const cur = byCat(txns), prev = byCat(prevTxns);
  const catDelta = Object.entries(cur)
    .map(([l, v]) => ({ l, v, prev: prev[l] || 0, delta: v - (prev[l] || 0) }))
    .filter(x => x.delta > 0 && x.prev > 0)
    .sort((a, b) => b.delta - a.delta);
  const runaway = catDelta[0] || null;

  // Unusual transaction: more than 2× the average for that category
  const avgByCat = {};
  txns.filter(t => t.amt < 0).forEach(t => {
    const c = catMap[t.cat]; if (!c) return;
    if (!avgByCat[c.id]) avgByCat[c.id] = { sum: 0, count: 0, name: c.l };
    avgByCat[c.id].sum += Math.abs(t.amt);
    avgByCat[c.id].count++;
  });
  const unusual = txns.filter(t => t.amt < 0).find(t => {
    const c = catMap[t.cat]; if (!c || !avgByCat[c.id]) return false;
    const avg = avgByCat[c.id].sum / avgByCat[c.id].count;
    return Math.abs(t.amt) > avg * 2.5 && Math.abs(t.amt) > 100;
  });

  // Recurring spend detection
  const monthGroups = {};
  txns.forEach(t => {
    const key = (t.payee || t.desc || '').toLowerCase().slice(0, 35);
    if (!monthGroups[key]) monthGroups[key] = { months: new Set(), total: 0, amt: t.amt, desc: t.desc, payee: t.payee };
    monthGroups[key].months.add(t.date.slice(0, 7));
    monthGroups[key].total += t.amt;
  });
  const recurring = Object.values(monthGroups).filter(g => g.months.size >= 2 && g.amt < 0);
  const recurringCost = recurring.reduce((s, g) => s + Math.abs(g.total / g.months.size), 0);

  // Liquid assets & runway
  const liquid = (accounts || [])
    .filter(a => a.type === 'checking' || a.type === 'savings')
    .reduce((s, a) => {
      const bal = (a.opening_balance || 0) + txns.filter(t => t.account_id === a.id).reduce((ss, t) => ss + t.amt, 0);
      return s + bal;
    }, 0);

  const last30 = txns.filter(t => {
    const d = new Date(t.date);
    return d > new Date(Date.now() - 30 * 864e5);
  });
  const monthlyExp = Math.abs(last30.filter(t => t.amt < 0).reduce((s, t) => s + t.amt, 0));
  const runway     = monthlyExp > 0 ? liquid / monthlyExp : Infinity;

  return { biggest, runaway, unusual, recurring, recurringCost, liquid, runway, monthlyExp };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// Micro sparkline bar chart
function SparkBars({ bars, height = 40 }) {
  const max = Math.max(...bars.map(b => Math.max(b.income, b.expenses)), 1);
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: height + 16 }}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <div style={{ width: '100%', display: 'flex', gap: 1.5, alignItems: 'flex-end', height }}>
            <div style={{ flex: 1, borderRadius: '2px 2px 0 0', background: 'var(--gn)', opacity: 0.75, height: `${clamp(b.income / max, 0, 1) * height}px`, minHeight: b.income > 0 ? 2 : 0 }} />
            <div style={{ flex: 1, borderRadius: '2px 2px 0 0', background: b.expenses > b.income ? 'var(--rd)' : 'var(--a)', opacity: 0.8, height: `${clamp(b.expenses / max, 0, 1) * height}px`, minHeight: b.expenses > 0 ? 2 : 0 }} />
          </div>
          <span style={{ fontSize: 9, color: 'var(--stone2)', letterSpacing: '0.01em' }}>{b.label}</span>
        </div>
      ))}
    </div>
  );
}

// Runway arc gauge
function RunwayGauge({ months, liquid, monthly }) {
  const isInfinite = !isFinite(months) || months > 36;
  const safeMo     = isInfinite ? 36 : months;
  const angle      = clamp(safeMo / 24, 0, 1) * 180; // 0-180 degrees half-arc
  const r = 54, cx = 64, cy = 64;
  const toXY = (deg) => {
    const rad = (180 - deg) * (Math.PI / 180);
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };
  const end = toXY(angle);
  const color = months < 3 ? 'var(--rd)' : months < 6 ? 'var(--a)' : 'var(--gn)';
  const label = isInfinite ? '∞' : months < 1 ? `${Math.round(months * 30)}d` : months < 12 ? `${months.toFixed(1)}mo` : `${(months / 12).toFixed(1)}yr`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={128} height={72} viewBox="0 0 128 72">
        {/* Track */}
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--bd)" strokeWidth={8} strokeLinecap="round" />
        {/* Fill */}
        {angle > 2 && (
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${angle > 90 ? 1 : 0} 1 ${end.x} ${end.y}`} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" />
        )}
      </svg>
      <div style={{ marginTop: -28, textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--stone)', marginTop: 2, letterSpacing: '0.05em', textTransform: 'uppercase' }}>runway</div>
      </div>
    </div>
  );
}

// Insight pill
function InsightPill({ icon, label, value, color = 'var(--stone)', bg = 'var(--sand)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: bg, borderRadius: 8, border: '0.5px solid var(--bd)' }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--stone)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      </div>
    </div>
  );
}

// Category bar row
function CatRow({ label, value, max, col, pct: pctVal, delta }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {delta != null && (
            <span style={{ fontSize: 10, color: delta > 0 ? 'var(--rd)' : 'var(--gn)', fontWeight: 500 }}>
              {delta > 0 ? '↑' : '↓'}{fmt(Math.abs(delta))}
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
        </div>
      </div>
      <div style={{ height: 4, background: 'var(--bd)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: 4, borderRadius: 2, background: col || 'var(--a)', width: `${pctVal}%`, transition: 'width 0.6s cubic-bezier(.4,0,.2,1)' }} />
      </div>
    </div>
  );
}

// Account balance row
function AcctRow({ account, balance }) {
  const isCC  = account.type === 'credit_card';
  const isPos = isCC ? balance <= 0 : balance >= 0;
  const typeLabel = { checking: 'Cheque', savings: 'Savings', credit_card: 'Credit', investment: 'Invest', loan: 'Loan' }[account.type] || account.type;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid var(--bd)' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: account.colour || '#888', opacity: 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>{(account.name || '?')[0].toUpperCase()}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</div>
        <div style={{ fontSize: 10, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{typeLabel}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: isPos ? 'var(--gn)' : 'var(--rd)' }}>
          {isCC && balance > 0 ? '−' : ''}{fmt(Math.abs(balance))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export function Dashboard({ onNavigate }) {
  const { txns: _t, catMap, rules: _r, payees: _p, accounts: _a, dateFrom, dateTo, budgets } = useApp();
  const txns    = _t || [];
  const rules   = _r || [];
  const payees  = _p || [];
  const accounts = _a || [];

  const ft = filterByDateRange(txns, dateFrom, dateTo);

  // Previous period (same length, immediately before)
  const from    = new Date(dateFrom);
  const to      = new Date(dateTo);
  const daysDiff = Math.round((to - from) / 864e5);
  const prevTo   = new Date(from - 864e5).toISOString().slice(0, 10);
  const prevFrom = new Date(from - (daysDiff + 1) * 864e5).toISOString().slice(0, 10);
  const prevFt   = filterByDateRange(txns, prevFrom, prevTo);

  // KPIs
  const income   = ft.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0);
  const expenses = Math.abs(ft.filter(t => t.amt < 0).reduce((s, t) => s + t.amt, 0));
  const net      = income - expenses;
  const prevInc  = prevFt.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0);
  const prevExp  = Math.abs(prevFt.filter(t => t.amt < 0).reduce((s, t) => s + t.amt, 0));
  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;

  const unallocated = ft.filter(t => !t.cat).length;
  const suggestions = runAutoCatRules(txns, rules).length;

  // Monthly data
  const months = useMemo(() => getMonths(txns, 6), [txns]);

  // Category analysis
  const byCat = useMemo(() => {
    const m = {};
    ft.forEach(t => {
      const c = catMap[t.cat];
      if (!c || c.t !== 'expense') return;
      if (!m[c.id]) m[c.id] = { id: c.id, l: c.l, col: c.col, v: 0 };
      m[c.id].v += Math.abs(t.amt);
    });
    const prevM = {};
    prevFt.forEach(t => {
      const c = catMap[t.cat];
      if (!c || c.t !== 'expense') return;
      prevM[c.id] = (prevM[c.id] || 0) + Math.abs(t.amt);
    });
    return Object.values(m)
      .sort((a, b) => b.v - a.v)
      .slice(0, 6)
      .map(x => ({ ...x, prev: prevM[x.id] || 0, delta: x.v - (prevM[x.id] || 0) }));
  }, [ft, prevFt, catMap]);
  const maxCat = byCat[0]?.v || 1;

  // Payee analysis
  const byPayee = useMemo(() => {
    const m = {};
    ft.forEach(t => {
      const key = t.payee_id || t.payee;
      if (!key) return;
      const name = t.payee || '?';
      if (!m[key]) m[key] = { name, v: 0 };
      m[key].v += t.amt;
    });
    return Object.values(m).sort((a, b) => b.v - a.v).slice(0, 5);
  }, [ft]);
  const maxPayeeAbs = Math.max(...byPayee.map(p => Math.abs(p.v)), 1);

  // Spending velocity (daily rate this period vs last period)
  const dailyRate     = expenses / Math.max(daysDiff, 1);
  const prevDailyRate = prevExp  / Math.max(daysDiff, 1);
  const velocityDelta = prevDailyRate > 0 ? ((dailyRate - prevDailyRate) / prevDailyRate) * 100 : 0;

  // Insights
  const insights = useMemo(() => buildInsights(ft, catMap, accounts, prevFt), [ft, prevFt, catMap, accounts]);

  // Account balances
  const acctRows = useMemo(() => accounts.map(a => ({
    account: a,
    balance: (a.opening_balance || 0) + txns.filter(t => t.account_id === a.id).reduce((s, t) => s + t.amt, 0),
  })), [accounts, txns]);

  const totalLiquid   = acctRows.filter(r => r.account.type === 'checking' || r.account.type === 'savings').reduce((s, r) => s + r.balance, 0);
  const totalCC       = acctRows.filter(r => r.account.type === 'credit_card').reduce((s, r) => s + r.balance, 0);
  const netWorth      = acctRows.reduce((s, r) => {
    if (r.account.type === 'credit_card' || r.account.type === 'loan') return s - Math.abs(r.balance);
    return s + r.balance;
  }, 0);

  // Recent transactions
  const recent = [...ft].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  // Budget usage
  const budgetRows = useMemo(() => {
    if (!budgets?.length) return [];
    return budgets.slice(0, 4).map(b => {
      const spent = ft.filter(t => catMap[t.cat]?.ac === b.category).reduce((s, t) => Math.abs(t.amt) + s, 0);
      return { ...b, spent, pct: b.amount > 0 ? clamp(spent / b.amount * 100, 0, 100) : 0 };
    }).filter(b => b.amount > 0);
  }, [budgets, ft, catMap]);

  const todayStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 4 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--stone)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>{todayStr}</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1 }}>Financial Overview</h2>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(unallocated + suggestions) > 0 && (
            <button className="btn btn-a btn-sm" onClick={() => onNavigate('approve')} style={{ fontWeight: 500 }}>
              ⚡ {unallocated + suggestions} to review
            </button>
          )}
          <button className="btn btn-sm" onClick={() => onNavigate('transactions')}>+ Transaction</button>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          {
            label: 'Income', value: fmt(income),
            sub: prevInc > 0 ? `${income >= prevInc ? '↑' : '↓'} ${Math.abs(Math.round((income - prevInc) / prevInc * 100))}% vs prior` : `${ft.filter(t => t.amt > 0).length} entries`,
            color: 'var(--gn)', border: '0.5px solid rgba(59,109,17,0.3)',
          },
          {
            label: 'Expenses', value: fmt(expenses),
            sub: prevExp > 0 ? `${expenses >= prevExp ? '↑' : '↓'} ${Math.abs(Math.round((expenses - prevExp) / prevExp * 100))}% vs prior` : `${ft.filter(t => t.amt < 0).length} entries`,
            color: expenses > income ? 'var(--rd)' : 'var(--ink)', border: expenses > income ? '0.5px solid rgba(163,45,45,0.3)' : '0.5px solid var(--bd)',
          },
          {
            label: net >= 0 ? 'Surplus' : 'Deficit', value: fmt(Math.abs(net)),
            sub: savingsRate >= 0 ? `${savingsRate}% savings rate` : `${Math.abs(savingsRate)}% over income`,
            color: net >= 0 ? 'var(--gn)' : 'var(--rd)', border: net >= 0 ? '0.5px solid rgba(59,109,17,0.3)' : '0.5px solid rgba(163,45,45,0.3)',
          },
          {
            label: 'Net worth', value: fmtAcct(netWorth),
            sub: `${acctRows.length} account${acctRows.length !== 1 ? 's' : ''}`,
            color: netWorth >= 0 ? 'var(--ink)' : 'var(--rd)', border: '0.5px solid var(--bd)',
          },
        ].map(({ label, value, sub, color, border }) => (
          <div key={label} style={{ background: 'var(--sand2)', borderRadius: 10, padding: '14px 16px', border, position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontSize: 10, color: 'var(--stone)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--stone)', marginTop: 5 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Row 2: Cashflow chart + Insights ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 12 }}>

        {/* Cashflow chart */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="ch" style={{ borderBottom: '0.5px solid var(--bd)' }}>
            <h3>Cash flow — 6 months</h3>
            <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--stone)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--gn)', display: 'inline-block' }} /> Income
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--a)', display: 'inline-block' }} /> Expenses
              </span>
            </div>
          </div>
          <div style={{ padding: '16px 16px 8px' }}>
            {/* Full chart */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 180 }}>
              {months.map((b, i) => {
                const max = Math.max(...months.flatMap(m => [m.income, m.expenses]), 1);
                const isCurrent = i === months.length - 1;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 160 }}>
                      <div style={{ flex: 1, borderRadius: '3px 3px 0 0', background: 'var(--gn)', opacity: isCurrent ? 0.95 : 0.55, height: `${clamp(b.income / max, 0, 1) * 160}px`, minHeight: b.income > 0 ? 2 : 0, transition: 'height 0.5s ease' }} />
                      <div style={{ flex: 1, borderRadius: '3px 3px 0 0', background: b.expenses > b.income ? 'var(--rd)' : 'var(--a)', opacity: isCurrent ? 0.9 : 0.5, height: `${clamp(b.expenses / max, 0, 1) * 160}px`, minHeight: b.expenses > 0 ? 2 : 0, transition: 'height 0.5s ease' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <span style={{ fontSize: 9.5, color: isCurrent ? 'var(--a2)' : 'var(--stone2)', fontWeight: isCurrent ? 600 : 400 }}>{b.label}</span>
                      {isCurrent && <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--a)' }} />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Net line summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 4, marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--bd)' }}>
              {months.map((b, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 500, color: b.net >= 0 ? 'var(--gn)' : 'var(--rd)', fontVariantNumeric: 'tabular-nums' }}>
                    {b.net >= 0 ? '+' : '−'}{fmt(Math.abs(b.net)).replace('$', '')}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--stone2)' }}>net</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Insights panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Runway */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--stone)' }}>Runway</span>
              <span style={{ fontSize: 11, color: 'var(--stone)' }}>{fmt(totalLiquid)} liquid</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <RunwayGauge months={insights.runway} liquid={totalLiquid} monthly={insights.monthlyExp} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--stone)', marginBottom: 4 }}>Daily spend rate</div>
                <div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(dailyRate)}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--stone)' }}>/day</span></div>
                {Math.abs(velocityDelta) > 1 && (
                  <div style={{ fontSize: 11, marginTop: 3, color: velocityDelta > 0 ? 'var(--rd)' : 'var(--gn)', fontWeight: 500 }}>
                    {velocityDelta > 0 ? '↑' : '↓'} {Math.abs(Math.round(velocityDelta))}% vs prior period
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--stone)', marginTop: 6 }}>Monthly recurring: <strong>{fmt(insights.recurringCost)}</strong></div>
              </div>
            </div>
          </div>

          {/* Smart insights */}
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 10 }}>Insights</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {insights.runaway && (
                <InsightPill icon="📈" label="Fastest growing"
                  value={`${insights.runaway.l}: +${fmt(insights.runaway.delta)} vs prior`}
                  color="var(--rd)" bg="var(--rdb)" />
              )}
              {insights.biggest && (
                <InsightPill icon="💸" label="Largest expense"
                  value={`${insights.biggest.payee || insights.biggest.desc} — ${fmt(Math.abs(insights.biggest.amt))}`}
                  color="var(--a2)" />
              )}
              {insights.unusual && (
                <InsightPill icon="⚠️" label="Unusual spend"
                  value={`${insights.unusual.payee || insights.unusual.desc} (${fmt(Math.abs(insights.unusual.amt))})`}
                  color="var(--a2)" bg="var(--al)" />
              )}
              {savingsRate >= 20 && (
                <InsightPill icon="✅" label="Savings rate"
                  value={`${savingsRate}% — on track`}
                  color="var(--gn)" bg="var(--gnb)" />
              )}
              {savingsRate < 0 && (
                <InsightPill icon="⚠️" label="Overspending"
                  value={`Expenses exceed income by ${fmt(expenses - income)}`}
                  color="var(--rd)" bg="var(--rdb)" />
              )}
              {!insights.runaway && !insights.biggest && savingsRate >= 0 && savingsRate < 20 && (
                <InsightPill icon="💡" label="Tip"
                  value="Assign more transactions to see spending insights" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: Categories + Accounts + Recurring ────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px 260px', gap: 12 }}>

        {/* Spending by category */}
        <div className="card">
          <div className="ch" style={{ borderBottom: '0.5px solid var(--bd)' }}>
            <h3>Spending breakdown</h3>
            <button className="btn btn-sm" onClick={() => onNavigate('pl')}>P&L →</button>
          </div>
          <div style={{ padding: '14px 16px' }}>
            {byCat.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--stone)' }}>No categorised expenses in this period.</p>
            )}
            {byCat.map(c => (
              <CatRow key={c.id} label={c.l} value={c.v} max={maxCat} col={c.col}
                pct={Math.round(c.v / maxCat * 100)} delta={c.delta} />
            ))}
            {byCat.length > 0 && (
              <div style={{ paddingTop: 8, borderTop: '0.5px solid var(--bd)', display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 2 }}>
                <span style={{ color: 'var(--stone)' }}>Total expenses</span>
                <span style={{ fontWeight: 600, color: 'var(--rd)' }}>{fmt(expenses)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Accounts */}
        <div className="card">
          <div className="ch" style={{ borderBottom: '0.5px solid var(--bd)' }}>
            <h3>Accounts</h3>
            <button className="btn btn-sm" onClick={() => onNavigate('accounts')}>Manage</button>
          </div>
          <div style={{ padding: '6px 16px 12px' }}>
            {acctRows.length === 0 && <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 8 }}>No accounts linked.</p>}
            {acctRows.map(r => <AcctRow key={r.account.id} {...r} />)}
            {acctRows.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '0.5px solid var(--bd)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--stone)' }}>Net worth</span>
                  <span style={{ fontWeight: 600, color: netWorth >= 0 ? 'var(--gn)' : 'var(--rd)' }}>{fmtAcct(netWorth)}</span>
                </div>
                {totalCC < 0 && (
                  <div style={{ fontSize: 11, color: 'var(--stone)' }}>Credit owed: <span style={{ color: 'var(--rd)', fontWeight: 500 }}>{fmt(Math.abs(totalCC))}</span></div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Recurring + top payees */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="card" style={{ flex: 1 }}>
            <div className="ch" style={{ borderBottom: '0.5px solid var(--bd)' }}>
              <h3>Recurring</h3>
              <span style={{ fontSize: 11, color: 'var(--stone)' }}>{insights.recurring.length} detected</span>
            </div>
            <div style={{ padding: '8px 16px 12px' }}>
              {insights.recurring.length === 0 && <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 6 }}>No recurring patterns found.</p>}
              {insights.recurring.slice(0, 5).map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '0.5px solid var(--bd)' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                    {r.payee || r.desc}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--rd)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    −{fmt(Math.abs(r.total / r.months.size))}/mo
                  </span>
                </div>
              ))}
              {insights.recurringCost > 0 && (
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
                  <span>Total/month</span>
                  <span className="vn">−{fmt(insights.recurringCost)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Top payees mini */}
          {byPayee.length > 0 && (
            <div className="card">
              <div className="ch" style={{ borderBottom: '0.5px solid var(--bd)' }}>
                <h3>Top payees</h3>
                <button className="btn btn-sm" onClick={() => onNavigate('payees')}>Report</button>
              </div>
              <div style={{ padding: '8px 14px 10px' }}>
                {byPayee.slice(0, 4).map(p => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                    <PayeeAvatar name={p.name} payeesList={payees} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{p.name}</span>
                        <span className={p.v >= 0 ? 'vp' : 'vn'} style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 12 }}>{p.v >= 0 ? '+' : ''}{fmt(p.v)}</span>
                      </div>
                      <div style={{ height: 2, background: 'var(--bd)', borderRadius: 1, marginTop: 3 }}>
                        <div style={{ height: 2, borderRadius: 1, background: p.v < 0 ? 'var(--a)' : 'var(--gn)', width: `${Math.round(Math.abs(p.v) / maxPayeeAbs * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: Recent transactions + Budgets ────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12 }}>

        {/* Recent transactions */}
        <div className="card">
          <div className="ch" style={{ borderBottom: '0.5px solid var(--bd)' }}>
            <h3>Recent transactions</h3>
            <button className="btn btn-sm" onClick={() => onNavigate('transactions')}>View all</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--sand)' }}>
                {['Date', 'Description', 'Payee', 'Category', 'Amount'].map((h, i) => (
                  <th key={h} style={{ padding: '6px 12px', fontSize: 10, fontWeight: 600, color: 'var(--stone)', textAlign: i > 2 ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '0.5px solid var(--bd)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map(t => {
                const c = catMap[t.cat];
                return (
                  <tr key={t.id} style={{ borderBottom: '0.5px solid var(--bd)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--al)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '7px 12px', fontSize: 11.5, color: 'var(--stone)', whiteSpace: 'nowrap' }}>{t.date}</td>
                    <td style={{ padding: '7px 12px', fontSize: 12, maxWidth: 180 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.desc}</div>
                    </td>
                    <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--stone)', maxWidth: 100 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.payee || '—'}</div>
                    </td>
                    <td style={{ padding: '7px 12px', fontSize: 11 }}>
                      {c ? (
                        <span style={{ background: `${c.col}22`, color: c.col, padding: '2px 7px', borderRadius: 4, fontWeight: 500, whiteSpace: 'nowrap' }}>{c.l}</span>
                      ) : (
                        <span style={{ background: 'var(--al)', color: 'var(--a2)', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 500 }}>Unassigned</span>
                      )}
                    </td>
                    <td style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }} className={t.amt >= 0 ? 'vp' : 'vn'}>
                      {t.amt >= 0 ? '+' : ''}{fmt(t.amt)}
                    </td>
                  </tr>
                );
              })}
              {recent.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: 'var(--stone)' }}>No transactions in selected period.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Budget tracker + Quick actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {budgetRows.length > 0 && (
            <div className="card">
              <div className="ch" style={{ borderBottom: '0.5px solid var(--bd)' }}>
                <h3>Budget tracker</h3>
                <button className="btn btn-sm" onClick={() => onNavigate('budgets')}>Manage</button>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {budgetRows.map(b => (
                  <div key={b.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span>{b.category}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', color: b.pct > 90 ? 'var(--rd)' : 'var(--stone)' }}>{fmt(b.spent)} / {fmt(b.amount)}</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--bd)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: 5, borderRadius: 3, background: b.pct > 90 ? 'var(--rd)' : b.pct > 70 ? 'var(--a)' : 'var(--gn)', width: `${b.pct}%`, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="ch" style={{ borderBottom: '0.5px solid var(--bd)' }}><h3>Quick actions</h3></div>
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="btn" style={{ textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => onNavigate('import')}>
                <span style={{ marginRight: 8 }}>📥</span> Import bank statement
              </button>
              <button className="btn" style={{ textAlign: 'left' }} onClick={() => onNavigate('transactions')}>
                <span style={{ marginRight: 8 }}>+</span> Add transaction
              </button>
              <button className="btn" style={{ textAlign: 'left' }} onClick={() => onNavigate('accounts')}>
                <span style={{ marginRight: 8 }}>🏦</span> Manage accounts
              </button>
              <button className="btn" style={{ textAlign: 'left' }} onClick={() => onNavigate('pl')}>
                <span style={{ marginRight: 8 }}>📊</span> Profit & Loss report
              </button>
              <button className="btn" style={{ textAlign: 'left' }} onClick={() => onNavigate('tax')}>
                <span style={{ marginRight: 8 }}>🧾</span> Tax tracker
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
