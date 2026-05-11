/**
 * views/Banking/Transactions/TransactionFilters.jsx
 * Account tabs, reconciliation panel, allocation tabs, search/filter bar, and bulk actions.
 */
import React from 'react';
import { fmt, filterByDateRange } from '../../../utils/helpers';

const ACCT_ICON = { checking: '🏦', savings: '💰', credit_card: '💳', loan: '📋', investment: '📈' };
const CAT_TYPE_ORDER  = ['income', 'expense', 'asset', 'liability', 'equity'];
const CAT_TYPE_LABELS = { income: 'Income', expense: 'Expenses', asset: 'Assets', liability: 'Liabilities', equity: 'Equity' };

export function TransactionFilters({
  // account tabs
  accounts, txns, dateFrom, dateTo, accountTab, switchAccount, acctBalances, unlinkedCount,
  // recon
  recon,
  // alloc tabs
  allocTab, setAllocTab, ua,
  // search/filter
  search, setSearch, typeFilter, setTypeFilter, payeeFilter, setPayeeFilter, payees,
  // bulk
  selected, clearSel, selectAll, ft,
  bulkCatDD, setBulkCatDD, bulkBtnRef,
  bulkPayeeId, setBulkPayeeId, bulkCatQ, setBulkCatQ,
  bulkBankId, setBulkBankId,
  cats, catsByType,
  bulkAllocate, bulkAssignBank,
  setShowAdd,
}) {
  return (
    <>
      {/* ── Account tabs ── */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', padding: '0 4px', minWidth: 'max-content', borderBottom: '0.5px solid var(--bd)' }}>
          <button onClick={() => switchAccount(null)} style={{ padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', color: accountTab === null ? 'var(--ink)' : 'var(--stone)', fontWeight: accountTab === null ? 500 : 400, borderBottom: accountTab === null ? '2px solid #BA7517' : '2px solid transparent', marginBottom: -1 }}>
            All accounts
            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--stone)', background: 'var(--sand2)', padding: '1px 5px', borderRadius: 99 }}>
              {filterByDateRange(txns || [], dateFrom, dateTo).length}
            </span>
          </button>
          {unlinkedCount > 0 && (
            <button onClick={() => switchAccount('unlinked')} style={{ padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', color: accountTab === 'unlinked' ? 'var(--ink)' : 'var(--stone)', fontWeight: accountTab === 'unlinked' ? 500 : 400, borderBottom: accountTab === 'unlinked' ? '2px solid var(--rd)' : '2px solid transparent', marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--rd)', display: 'inline-block' }} />
              Unlinked
              <span style={{ fontSize: 10, background: 'var(--rdb)', color: 'var(--rd)', padding: '1px 5px', borderRadius: 99, fontWeight: 600 }}>{unlinkedCount}</span>
            </button>
          )}
          {(accounts || []).map(a => {
            const bal = acctBalances[a.id] ?? 0;
            const cnt = filterByDateRange(txns || [], dateFrom, dateTo).filter(t => t.account_id === a.id).length;
            const isCC = a.type === 'credit_card';
            const active = accountTab === a.id;
            return (
              <button key={a.id} onClick={() => switchAccount(a.id)} style={{ padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', color: active ? 'var(--ink)' : 'var(--stone)', fontWeight: active ? 500 : 400, borderBottom: active ? `2px solid ${a.colour || '#BA7517'}` : '2px solid transparent', marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.colour || '#888', display: 'inline-block', flexShrink: 0 }} />
                {ACCT_ICON[a.type]} {a.name}
                <span style={{ fontSize: 10, color: 'var(--stone)', background: 'var(--sand2)', padding: '1px 5px', borderRadius: 99 }}>{cnt}</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, fontWeight: 500, background: isCC ? (bal > 0 ? 'var(--rdb)' : 'var(--gnb)') : 'var(--sand)', color: isCC ? (bal > 0 ? 'var(--rd)' : 'var(--gn)') : 'var(--stone)' }}>
                  {isCC ? `${fmt(Math.abs(bal))} owed` : fmt(bal)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Recon panel ── */}
      <div style={{ padding: '8px 14px', background: 'var(--sand)', borderBottom: '0.5px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        {[
          { label: 'Total',       value: recon.total },
          { label: 'Categorised', value: recon.matched,   colour: 'var(--gn)' },
          { label: 'Unmatched',   value: recon.unmatched, colour: recon.unmatched > 0 ? 'var(--rd)' : 'var(--stone)' },
        ].map(m => (
          <div key={m.label}>
            <div style={{ fontSize: 10, color: 'var(--stone)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: m.colour || 'var(--ink)' }}>{m.value}</div>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 80, height: 6, background: 'var(--sand3)', borderRadius: 3 }}>
            <div style={{ height: 6, borderRadius: 3, background: recon.pct === 100 ? 'var(--gn)' : '#BA7517', width: `${recon.pct}%`, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 500, color: recon.pct === 100 ? 'var(--gn)' : 'var(--a2)' }}>{recon.pct}%</span>
        </div>
        <div style={{ height: 20, width: 0.5, background: 'var(--bd2)' }} />
        <div><div style={{ fontSize: 10, color: 'var(--stone)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Credits</div><div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gn)' }}>+{fmt(recon.totalIn)}</div></div>
        <div><div style={{ fontSize: 10, color: 'var(--stone)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Debits</div><div style={{ fontSize: 13, fontWeight: 500, color: 'var(--rd)' }}>-{fmt(Math.abs(recon.totalOut))}</div></div>
      </div>

      {/* ── Alloc tabs ── */}
      <div style={{ borderBottom: '0.5px solid var(--bd)' }}>
        <div style={{ display: 'flex', padding: '0 12px' }}>
          {[['all', 'All'], ['categorised', 'Categorised'], ['uncategorised', 'Uncategorised']].map(([val, label]) => (
            <button key={val} onClick={() => { setAllocTab(val); clearSel(); }} style={{ padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-sans)', color: allocTab === val ? 'var(--ink)' : 'var(--stone)', fontWeight: allocTab === val ? 500 : 400, borderBottom: allocTab === val ? '2px solid var(--a)' : '2px solid transparent', marginBottom: -1 }}>
              {label}
              {val === 'uncategorised' && ua > 0 && <span style={{ marginLeft: 5, fontSize: 9, background: 'var(--al)', color: 'var(--a2)', padding: '1px 5px', borderRadius: 99, fontWeight: 600 }}>{ua}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Search / filter / bulk bar ── */}
      <div className="txn-filters">
        <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="in">Credits</option>
          <option value="out">Debits</option>
        </select>
        <select value={payeeFilter} onChange={e => setPayeeFilter(e.target.value)}>
          <option value="">All payees</option>
          {(payees || []).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>

        {selected.size > 0 ? (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--stone)' }}>{selected.size} selected</span>
            <div style={{ position: 'relative' }}>
              <button ref={bulkBtnRef} className="btn btn-a btn-sm" onClick={() => setBulkCatDD(v => !v)}>Categorise {selected.size} ▾</button>
              {accountTab === 'unlinked' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <select value={bulkBankId} onChange={e => setBulkBankId(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', border: '0.5px solid var(--bd2)', borderRadius: 'var(--rr)', background: '#FDFAF6', fontFamily: 'var(--font-sans)', maxWidth: 160 }}>
                    <option value="">Assign to account…</option>
                    {(accounts || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <button className="btn btn-a btn-sm" onClick={() => bulkAssignBank(bulkBankId)} disabled={!bulkBankId}>Move {selected.size}</button>
                </div>
              )}
              {bulkCatDD&&(()=>{
                const br = bulkBtnRef.current?.getBoundingClientRect();
                return (
                  <div style={{ position:'fixed', top: (br?.bottom ?? 0) + 4, right: window.innerWidth - (br?.right ?? 0), background: '#FDFAF6', border: '0.5px solid var(--bd2)', borderRadius: 'var(--rr)', padding: 0, minWidth: 280, maxHeight: 360, overflowY: 'auto', zIndex:9999, boxShadow: '0 8px 24px rgba(42,36,32,0.18)' }}>
                    <div style={{ padding: '8px 10px', borderBottom: '0.5px solid var(--bd)', background: '#FDFAF6', position: 'sticky', top: 0, zIndex: 1 }}>
                      <div style={{ fontSize: 10, color: 'var(--stone)', marginBottom: 4 }}>Assign payee (optional)</div>
                      <select value={bulkPayeeId} onChange={e => setBulkPayeeId(e.target.value)} style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: '0.5px solid var(--bd2)', borderRadius: 'var(--rr)', background: '#fff', marginBottom: 6 }}>
                        <option value="">— no payee —</option>
                        {(payees || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input placeholder="Search accounts…" value={bulkCatQ || ''} onChange={e => setBulkCatQ(e.target.value)} style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: '0.5px solid var(--bd2)', borderRadius: 'var(--rr)', background: '#fff', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ padding: '7px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--rd)', display: 'flex', alignItems: 'center', gap: 7, borderBottom: '0.5px solid var(--bd)' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(163,45,45,0.06)'} onMouseLeave={e => e.currentTarget.style.background = ''} onClick={() => bulkAllocate(null)}>
                      ✕ Unassign category
                    </div>
                    {CAT_TYPE_ORDER.filter(t => catsByType[t]?.some(cat => { if (!bulkCatQ) return true; const q = bulkCatQ.toLowerCase(); return (cat.l || '').toLowerCase().includes(q) || (cat.code || '').includes(q); })).map(type => (
                      <React.Fragment key={type}>
                        <div style={{ padding: '4px 10px 2px', fontSize: 10, fontWeight: 600, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f5f0eb', borderTop: '0.5px solid var(--bd)' }}>{CAT_TYPE_LABELS[type]}</div>
                        {catsByType[type].filter(cat => { if (!bulkCatQ) return true; const q = bulkCatQ.toLowerCase(); return (cat.l || '').toLowerCase().includes(q) || (cat.code || '').includes(q); }).map(cat => {
                          const hasSubs = (cats || []).some(ch => ch.parent_id === cat.id && ch.is_active !== false);
                          if (hasSubs) return <div key={cat.id} style={{ padding: '4px 10px', fontSize: 11.5, background: 'var(--sand)', color: 'var(--stone)', display: 'flex', alignItems: 'center', gap: 6, borderTop: '0.5px solid var(--bd)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: cat.col, flexShrink: 0 }} />{cat.code && <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{cat.code}</span>}<span style={{ fontWeight: 500 }}>{cat.l}</span></div>;
                          return <div key={cat.id} style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--al)'} onMouseLeave={e => e.currentTarget.style.background = '#FDFAF6'} onClick={() => bulkAllocate(cat.id)}><span style={{ width: 7, height: 7, borderRadius: '50%', background: cat.col, flexShrink: 0 }} />{cat.code && <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--stone2)', flexShrink: 0 }}>{cat.code.includes('/') ? '/' + cat.code.split('/')[1] : cat.code}</span>}<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.l}</span></div>;
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                );
              })()}
            </div>
            <button className="btn btn-sm" onClick={clearSel}>Clear</button>
          </div>
        ) : (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ fontSize: 11, color: 'var(--stone)' }} onClick={selectAll} title="Ctrl+A">Select all</button>
            <button className="btn btn-a btn-sm" onClick={() => setShowAdd(true)}>+ Add</button>
          </div>
        )}
      </div>
    </>
  );
}
