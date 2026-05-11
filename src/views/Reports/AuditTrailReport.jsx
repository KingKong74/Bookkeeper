/**
 * views/Reports/AuditTrailReport.jsx
 * ------------------------------------
 * Full org-level audit trail report.
 * Shows every create, edit, delete, and allocation change across all transactions.
 */

import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { getOrgAuditLog, describeChange, formatAuditDate } from '../../lib/audit';

const ACTION_COLOURS = {
  created:          { bg:'var(--gnb)', color:'var(--gn)', icon:'✚' },
  imported:         { bg:'rgba(99,102,241,0.12)', color:'var(--a2)', icon:'↓' },
  updated:          { bg:'var(--al)', color:'var(--a2)', icon:'✎' },
  deleted:          { bg:'var(--rdb)', color:'var(--rd)', icon:'🗑' },
  category_changed: { bg:'var(--al)', color:'var(--a2)', icon:'⬡' },
  payee_changed:    { bg:'var(--sand3)', color:'var(--stone2)', icon:'👤' },
  unallocated:      { bg:'var(--sand2)', color:'var(--stone)', icon:'✕' },
};

export function AuditTrailReport() {
  const { org } = useApp();
  const [log,     setLog]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('');   // action filter
  const [limit,   setLimit]   = useState(100);

  useEffect(() => {
    if (!org) return;
    setLoading(true);
    getOrgAuditLog(org.id, { limit })
      .then(setLog)
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [org?.id, limit]);

  const filtered = filter ? log.filter(e => e.action === filter) : log;

  // Count by action for the summary row
  const counts = log.reduce((acc, e) => {
    acc[e.action] = (acc[e.action] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Summary strip */}
      <div style={{
        display:'flex', gap:8, marginBottom:14, flexWrap:'wrap',
      }}>
        {Object.entries(counts).map(([action, count]) => {
          const style = ACTION_COLOURS[action] || { bg:'var(--sand2)', color:'var(--stone)', icon:'•' };
          return (
            <div
              key={action}
              onClick={() => setFilter(f => f === action ? '' : action)}
              style={{
                padding:'6px 12px', borderRadius:'var(--rr)', cursor:'pointer',
                background: filter === action ? style.color : style.bg,
                color:      filter === action ? '#fff'       : style.color,
                fontSize:12, fontWeight:500,
                border:`0.5px solid ${style.color}44`,
                transition:'all 0.1s',
              }}
            >
              {style.icon} {action.replace('_',' ')} ({count})
            </div>
          );
        })}
        {filter && (
          <button
            onClick={() => setFilter('')}
            style={{ fontSize:11, color:'var(--stone)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}
          >
            Clear filter
          </button>
        )}
      </div>

      <div className="card">
        <div className="ch">
          <h3>Audit trail</h3>
          <p>{filtered.length} entries{filter ? ` — filtered by "${filter.replace('_',' ')}"` : ''}</p>
          <div className="ch-r">
            <select
              value={limit}
              onChange={e => setLimit(parseInt(e.target.value))}
              style={{ padding:'4px 8px', fontSize:11.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--bg-card)', color:'var(--ink)', fontFamily:'var(--font-sans)' }}
            >
              <option value={50}>Last 50</option>
              <option value={100}>Last 100</option>
              <option value={250}>Last 250</option>
              <option value={500}>Last 500</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding:24, textAlign:'center', color:'var(--stone)', fontSize:12 }}>
            Loading audit trail…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:24, textAlign:'center', color:'var(--stone)', fontSize:12 }}>
            <div style={{ fontSize:28, marginBottom:8 }}>📋</div>
            No audit entries yet. Changes to transactions will appear here.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width:140 }}>When</th>
                <th style={{ width:120 }}>Action</th>
                <th>Description</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                const style = ACTION_COLOURS[entry.action] || { bg:'var(--sand2)', color:'var(--stone)', icon:'•' };
                const snap  = entry.snapshot || {};
                const fields = entry.changed_fields || {};
                return (
                  <tr key={entry.id}>
                    <td style={{ color:'var(--stone)', fontSize:11.5, whiteSpace:'nowrap' }}>
                      {formatAuditDate(entry.created_at)}
                    </td>
                    <td>
                      <span style={{
                        display:'inline-flex', alignItems:'center', gap:5,
                        padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:500,
                        background:style.bg, color:style.color,
                      }}>
                        {style.icon} {entry.action.replace('_',' ')}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight:500, fontSize:12 }}>
                        {snap.description || '—'}
                      </div>
                      {snap.amount != null && (
                        <div style={{ fontSize:11, color:'var(--stone)' }}>
                          {snap.date} · {snap.amount >= 0 ? '+' : ''}{Math.abs(snap.amount).toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize:11.5, color:'var(--stone2)' }}>
                      {Object.keys(fields).length > 0 ? (
                        Object.entries(fields).map(([field, change]) => (
                          <div key={field} style={{ marginBottom:2 }}>
                            <span style={{ color:'var(--stone)', fontWeight:500 }}>{field}:</span>{' '}
                            <span style={{ color:'var(--rd)' }}>{String(change.from)}</span>
                            {' → '}
                            <span style={{ color:'var(--gn)' }}>{String(change.to)}</span>
                          </div>
                        ))
                      ) : (
                        <span style={{ color:'var(--stone)' }}>{entry.note || '—'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!loading && log.length >= limit && (
          <div style={{ padding:'10px 14px', textAlign:'center' }}>
            <button
              className="btn btn-sm"
              onClick={() => setLimit(l => l + 100)}
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
