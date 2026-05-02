/**
 * views/Banking/Reconciliation.jsx
 * ----------------------------------
 * Shows matched vs unmatched transactions for the active period.
 * A transaction is "matched" when it has a category assigned.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { PeriodBar } from '../../components/ui/PeriodBar';
import { fmt, filterByDateRange } from '../../utils/helpers';

export function Reconciliation() {
  const { txns, catMap, dateFrom, dateTo } = useApp();
  const ft      = filterByDateRange(txns, dateFrom, dateTo);
  const matched = ft.filter(t => t.cat).length;
  const total   = ft.length;
  const pct     = total ? Math.round(matched / total * 100) : 0;

  return (
    <div>
      <PeriodBar />
      <div className="metrics" style={{ marginBottom: 14 }}>
        {[
          { label: 'Total',     value: total,           cls: '' },
          { label: 'Matched',   value: matched,         cls: 'vp' },
          { label: 'Unmatched', value: total - matched, cls: 'va' },
          { label: 'Complete',  value: `${pct}%`,       cls: pct === 100 ? 'vp' : 'va' },
        ].map(m => (
          <div key={m.label} className="mc">
            <div className="mc-lbl">{m.label}</div>
            <div className={`mc-val ${m.cls}`}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="ch"><h3>Reconciliation status</h3></div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ height: 6, background: 'var(--sand3)', borderRadius: 3, marginBottom: 10 }}>
            <div style={{ height: 6, borderRadius: 3, background: pct === 100 ? '#3B6D11' : '#BA7517', width: `${pct}%`, transition: 'width 0.4s' }} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--stone2)' }}>
            {pct === 100 ? 'All transactions reconciled.' : `${total - matched} transaction(s) need allocation.`}
          </p>
        </div>
        <table>
          <thead>
            <tr><th>Date</th><th>Description</th><th>Payee</th><th className="tr">Amount</th><th>Status</th></tr>
          </thead>
          <tbody>
            {ft.map(t => {
              const c = catMap[t.cat];
              return (
                <tr key={t.id}>
                  <td style={{ color: 'var(--stone)' }}>{t.date}</td>
                  <td>{t.desc}</td>
                  <td style={{ color: 'var(--stone)' }}>{t.payee || '—'}</td>
                  <td className={`tr ${t.amt >= 0 ? 'vp' : 'vn'}`}>{t.amt >= 0 ? '+' : ''}{fmt(t.amt)}</td>
                  <td>
                    <span style={{
                      fontSize: 11, padding: '2px 9px', borderRadius: 99, fontWeight: 500,
                      background: c ? '#EAF3DE' : '#FAEEDA',
                      color:      c ? '#27500A' : '#633806',
                    }}>
                      {c ? 'Matched' : 'Unmatched'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
