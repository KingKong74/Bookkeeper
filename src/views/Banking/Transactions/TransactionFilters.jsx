/**
 * views/Banking/Transactions/TransactionFilters.jsx
 *
 * Alloc tabs:
 *   'uncategorised' = Reconcile        — unreconciled, needs a category
 *   'categorised'   = Bank Statements  — all imported bank transactions
 *   'all'           = Account Transactions — everything
 *
 * Date filtering is tucked into a Filter panel (button top-right).
 * Reconcile tab shows a Compact/Xero toggle.
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { fmt, filterByDateRange } from '../../../utils/helpers';

const CAT_TYPE_ORDER  = ['income', 'expense', 'asset', 'liability', 'equity'];
const CAT_TYPE_LABELS = { income: 'Income', expense: 'Expenses', asset: 'Assets', liability: 'Liabilities', equity: 'Equity' };
const BANK_LABELS     = { checking: 'Checking', savings: 'Savings', credit_card: 'Credit card', loan: 'Loan', investment: 'Investment' };

export function TransactionFilters({
  accounts, txns, dateFrom, dateTo, accountTab, switchAccount, acctBalances, unlinkedCount,
  recon,
  allocTab, setAllocTab, ua,
  search, setSearch, typeFilter, setTypeFilter, payeeFilter, setPayeeFilter, payees,
  selected, clearSel, selectAll, ft,
  bulkCatDD, setBulkCatDD, bulkBtnRef,
  bulkPayeeId, setBulkPayeeId, bulkCatQ, setBulkCatQ,
  bulkBankId, setBulkBankId,
  cats, catsByType,
  bulkAllocate, bulkAssignBank,
  setShowAdd,
  allTxns,
  totalCount,
  baseFtCount,
  compactView, setCompactView,
  showFilter, setShowFilter,
  localDateFrom, setLocalDateFrom,
  localDateTo,   setLocalDateTo,
}) {
  const scrollRef  = useRef(null);
  const filterRef  = useRef(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(false);

  // Arrow visibility — only show when overflow exists
  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener('scroll', updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect(); };
  }, [updateArrows, accounts]);

  // Close filter panel on outside click
  useEffect(() => {
    if (!showFilter) return;
    function onOut(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilter(false);
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, [showFilter, setShowFilter]);

  // totalCount is explicitly passed from Transactions/index.jsx = txns.length from context
  const totalTxnCount = totalCount ?? (allTxns || txns || []).length;
  const hasDateFilter = !!(localDateFrom && localDateTo);

  // Selected account info
  const selectedAcct = accountTab && accountTab !== 'unlinked'
    ? (accounts || []).find(a => a.id === accountTab)
    : null;

  // Balance sign convention:
  // CC/loan: opening_balance = amount owed (positive). Spending (negative txns) adds to debt.
  //   balance_owed = opening_owed - sum_of_txns
  // Asset: balance = opening + sum_of_txns
  const _isCC = selectedAcct?.type === 'credit_card' || selectedAcct?.type === 'loan';
  // Only include opening_balance when opening_date is set (a statement has been imported/set)
  const _hasOpening = !!(selectedAcct?.opening_date || parseFloat(selectedAcct?.opening_balance));
  const _ob = _hasOpening ? (parseFloat(selectedAcct?.opening_balance) || 0) : 0;

  // Statement balance = opening + ALL imported transactions (reconciled + unreconciled)
  const stmtBal = selectedAcct
    ? (() => {
        const allSum = (allTxns || txns || [])
          .filter(t => t.account_id === selectedAcct.id)
          .reduce((s, t) => s + (t.amt ?? 0), 0);
        return _isCC ? _ob - allSum : _ob + allSum;
      })()
    : null;

  // Moniqr (reconciled) balance = opening_balance + only CATEGORISED transactions.
  // Show "—" when NOTHING has been reconciled (zero categorised txns for this account).
  // This makes it clear that Moniqr balance only reflects what has actually been matched.
  const moniqrBal = selectedAcct
    ? (() => {
        const reconTxns = (allTxns || txns || []).filter(t => t.account_id === selectedAcct.id && !!t.cat);
        if (reconTxns.length === 0) return null; // nothing reconciled → show —
        const reconSum = reconTxns.reduce((s, t) => s + (t.amt ?? 0), 0);
        return _isCC ? _ob - reconSum : _ob + reconSum;
      })()
    : null;

  // FY quick-select: read the user's preferred FY cutoff month
  function getFYButtons() {
    const cutoff = localStorage.getItem('pref_fy_cutoff') || 'july';
    const fyMonthMap = { july: 6, january: 0, april: 3 };
    const fyMonth = fyMonthMap[cutoff] ?? 6; // 0-based month index
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth(); // 0-based
    // Current FY start year
    const curFYYear = thisMonth >= fyMonth ? thisYear : thisYear - 1;
    const fyStart = (yr) => {
      const m = String(fyMonth + 1).padStart(2, '0');
      const endYear = fyMonth === 0 ? yr : yr + 1;
      const endMonth = fyMonth === 0 ? '12' : String(fyMonth).padStart(2, '0');
      const endDay = fyMonth === 0 ? '31' : fyMonth === 3 ? '31' : '30';
      return { from: `${yr}-${m}-01`, to: `${endYear}-${endMonth}-${endDay}`, label: cutoff === 'january' ? `CY ${yr}` : `FY ${yr}–${String(yr+1).slice(2)}` };
    };
    return [fyStart(curFYYear), fyStart(curFYYear - 1)];
  }

  return (
    <>
      {/* ── Account tabs with conditional arrows ── */}
      <div className="acct-tab-strip">
        {canLeft && (
          <button className="acct-arrow acct-arrow--left" onClick={() => scrollRef.current?.scrollBy({ left: -220, behavior: 'smooth' })} aria-label="Scroll left">‹</button>
        )}
        <div className="acct-tab-inner" ref={scrollRef}>
          <button onClick={() => switchAccount(null)} className={`acct-tab-btn${accountTab === null ? ' acct-tab-btn--active' : ''}`}>
            All accounts
            <span className="acct-tab-badge">{totalTxnCount}</span>
          </button>

          {unlinkedCount > 0 && (
            <button onClick={() => switchAccount('unlinked')} className={`acct-tab-btn acct-tab-btn--warn${accountTab === 'unlinked' ? ' acct-tab-btn--active' : ''}`}>
              <span className="acct-tab-dot" style={{ background: 'var(--rd)' }} />
              Unlinked
              <span className="acct-tab-badge acct-tab-badge--red">{unlinkedCount}</span>
            </button>
          )}

          {(accounts || []).map(a => {
            const bal    = acctBalances[a.id] ?? 0;
            const isCC   = a.type === 'credit_card';
            const active = accountTab === a.id;
            return (
              <button key={a.id} onClick={() => switchAccount(a.id)}
                className={`acct-tab-btn${active ? ' acct-tab-btn--active' : ''}`}
                style={active ? { '--tab-active-color': a.colour || 'var(--a)' } : {}}>
                <span className="acct-tab-dot" style={{ background: a.colour || '#888' }} />
                {a.name}
                <span className="acct-tab-bal" style={{ color: isCC ? (bal > 0.005 ? 'var(--rd)' : 'var(--gn)') : (bal < -0.005 ? 'var(--rd)' : 'var(--stone2)') }}>
                  {isCC
                    ? (bal > 0.005 ? `${fmt(bal)} owed` : bal < -0.005 ? `${fmt(Math.abs(bal))} credit` : '$0.00')
                    : fmt(bal)
                  }
                </span>
              </button>
            );
          })}
        </div>
        {canRight && (
          <button className="acct-arrow acct-arrow--right" onClick={() => scrollRef.current?.scrollBy({ left: 220, behavior: 'smooth' })} aria-label="Scroll right">›</button>
        )}
      </div>

      {/* ── Selected account banner ── */}
      {selectedAcct && (
        <div className="acct-banner">
          <div className="acct-banner-left">
            <span className="acct-banner-dot" style={{ background: selectedAcct.colour || '#185FA5' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="acct-banner-name">
                {/* Dropdown to switch accounts — looks like a heading */}
                <select value={accountTab} onChange={e => switchAccount(e.target.value)} className="acct-banner-select">
                  {(accounts || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <span className="acct-banner-chevron">▾</span>
                {selectedAcct.account_number && (
                  <span className="acct-banner-acctno">BSB/Acc: {selectedAcct.account_number}</span>
                )}
              </div>
              <div className="acct-banner-meta">
                {selectedAcct.bank_name
                  ? <span className="acct-banner-bank">{selectedAcct.bank_name}</span>
                  : <span className="acct-banner-type">{BANK_LABELS[selectedAcct.type] || selectedAcct.type}</span>
                }
                <span className="acct-banner-sep">·</span>
                <span className="acct-banner-stat-label">Statement balance</span>
                <span className="acct-banner-stat-val" style={{ color: stmtBal != null && stmtBal < 0 ? 'var(--rd)' : 'var(--ink)' }}>
                  {stmtBal != null ? fmt(stmtBal) : '—'}
                </span>
                <span className="acct-banner-sep">·</span>
                <span className="acct-banner-stat-label">Moniqr (reconciled)</span>
                <span className="acct-banner-stat-val" style={{ color: moniqrBal != null && moniqrBal < 0 ? 'var(--rd)' : 'var(--gn)' }}>
                  {moniqrBal != null ? fmt(moniqrBal) : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Recon bar ── */}
      <div className="recon-bar">
        <div className="recon-stat">
          <div className="recon-label">Total</div>
          <div className="recon-val">{recon.total}</div>
        </div>
        <div className="recon-stat">
          <div className="recon-label">Categorised</div>
          <div className="recon-val" style={{ color: 'var(--gn)' }}>{recon.matched}</div>
        </div>
        <div className="recon-stat">
          <div className="recon-label">Unmatched</div>
          <div className="recon-val" style={{ color: recon.unmatched > 0 ? 'var(--rd)' : 'var(--stone)' }}>{recon.unmatched}</div>
        </div>
        <div className="recon-stat">
          <div className="recon-progress">
            <div style={{ height: 6, borderRadius: 3, background: recon.pct === 100 ? 'var(--gn)' : 'var(--a)', width: `${recon.pct}%`, transition: 'width 0.3s' }} />
          </div>
          <div className="recon-val">{recon.pct}%</div>
        </div>
        <div className="recon-sep" />
        <div className="recon-stat">
          <div className="recon-label">Credits</div>
          <div className="recon-val vp">+{fmt(recon.totalIn)}</div>
        </div>
        <div className="recon-stat">
          <div className="recon-label">Debits</div>
          <div className="recon-val vn">-{fmt(Math.abs(recon.totalOut))}</div>
        </div>
      </div>

      {/* ── Alloc tabs + compact toggle (Reconcile only) ── */}
      <div style={{ borderBottom: '0.5px solid var(--bd)', display: 'flex', alignItems: 'center' }}>
        <div className="alloc-tabs" style={{ borderBottom: 'none', flex: 1 }}>
          {[
            ['uncategorised', 'Reconcile',           ua,             true],
            ['categorised',   'Bank Statements',      null,           false],
            ['all',           'Account Transactions', totalTxnCount, false],
          ].map(([val, label, count, isRed]) => (
            <button key={val} onClick={() => { setAllocTab(val); clearSel(); }}
              className={`alloc-tab${allocTab === val ? ' alloc-tab--active' : ''}`}>
              {label}
              {count != null && count > 0 && (
                <span className={`alloc-tab-badge${isRed ? ' alloc-tab-badge--red' : ''}`}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Compact toggle — only visible on Reconcile tab */}
        {allocTab === 'uncategorised' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--stone)', whiteSpace: 'nowrap' }}>Compact</span>
            <button
              onClick={() => setCompactView(v => !v)}
              title={compactView ? 'Switch to Xero-style view' : 'Switch to compact view'}
              style={{
                width: 34, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer',
                background: compactView ? 'var(--a)' : 'var(--sand3)',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              }}
            >
              <span style={{
                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 2, transition: 'left 0.2s',
                left: compactView ? 18 : 2,
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              }} />
            </button>
          </div>
        )}
      </div>

      {/* ── Search / filter bar ── */}
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

        {/* Filter button — opens date filter panel */}
        <div style={{ position: 'relative' }} ref={filterRef}>
          <button
            className={`btn btn-sm${hasDateFilter ? ' btn-a' : ''}`}
            onClick={() => setShowFilter(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <svg viewBox="0 0 12 12" fill="none" style={{ width: 11, height: 11 }}>
              <path d="M1 2h10M3 6h6M5 10h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Filter
            {hasDateFilter && <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.3)', borderRadius: 99, padding: '1px 4px' }}>date</span>}
          </button>
          {showFilter && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 200,
              background: 'var(--bg-card)', border: '0.5px solid var(--bd2)',
              borderRadius: 'var(--rl)', padding: 12, minWidth: 260,
              boxShadow: '0 6px 20px rgba(0,0,0,0.14)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Date range</div>
              {/* FY quick-select buttons — dynamic based on fy_cutoff preference */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {getFYButtons().map(fy => {
                  const isActive = localDateFrom === fy.from && localDateTo === fy.to;
                  return (
                    <button key={fy.label}
                      className={isActive ? 'btn btn-a btn-sm' : 'btn btn-sm'}
                      onClick={() => { setLocalDateFrom(fy.from); setLocalDateTo(fy.to); }}
                      style={{ flex: 1, fontSize: 11 }}>
                      {fy.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--stone)', marginBottom: 3 }}>From</div>
                  <input type="date" value={localDateFrom} onChange={e => setLocalDateFrom(e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', fontSize: 12, border: '0.5px solid var(--bd2)', borderRadius: 'var(--rr)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--stone)', marginBottom: 3 }}>To</div>
                  <input type="date" value={localDateTo} onChange={e => setLocalDateTo(e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', fontSize: 12, border: '0.5px solid var(--bd2)', borderRadius: 'var(--rr)' }} />
                </div>
              </div>
              {hasDateFilter && (
                <button className="btn btn-sm" onClick={() => { setLocalDateFrom(''); setLocalDateTo(''); }}
                  style={{ marginTop: 8, width: '100%', textAlign: 'center', color: 'var(--rd)' }}>
                  Clear date filter
                </button>
              )}
              <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--stone)', fontStyle: 'italic' }}>
                Leave empty to show all transactions
              </div>
            </div>
          )}
        </div>

        {selected.size > 0 ? (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--stone)' }}>{selected.size} selected</span>
            <div style={{ position: 'relative' }}>
              <button ref={bulkBtnRef} className="btn btn-a btn-sm" onClick={() => setBulkCatDD(v => !v)}>Categorise {selected.size} ▾</button>
              {accountTab === 'unlinked' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                  <select value={bulkBankId} onChange={e => setBulkBankId(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', border: '0.5px solid var(--bd2)', borderRadius: 'var(--rr)', maxWidth: 160 }}>
                    <option value="">Assign to account…</option>
                    {(accounts || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <button className="btn btn-a btn-sm" onClick={() => bulkAssignBank(bulkBankId)} disabled={!bulkBankId}>Move {selected.size}</button>
                </div>
              )}
              {bulkCatDD&&(()=>{
                const br = bulkBtnRef.current?.getBoundingClientRect();
                return (
                  <div style={{ position:'fixed', top:(br?.bottom??0)+4, right:window.innerWidth-(br?.right??0), background:'var(--bg-card)', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', minWidth:280, maxHeight:360, overflowY:'auto', zIndex:9999, boxShadow:'0 8px 24px rgba(0,0,0,0.18)' }}>
                    <div style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--bd)', background:'var(--sand2)', position:'sticky', top:0, zIndex:1 }}>
                      <div style={{ fontSize:10, color:'var(--stone)', marginBottom:4 }}>Assign payee (optional)</div>
                      <select value={bulkPayeeId} onChange={e=>setBulkPayeeId(e.target.value)} style={{ width:'100%', fontSize:12, padding:'4px 6px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', marginBottom:6 }}>
                        <option value="">— no payee —</option>
                        {(payees||[]).sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input placeholder="Search accounts…" value={bulkCatQ||''} onChange={e=>setBulkCatQ(e.target.value)} style={{ width:'100%', fontSize:12, padding:'4px 6px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', boxSizing:'border-box' }} />
                    </div>
                    <div style={{ padding:'7px 10px', fontSize:12, cursor:'pointer', color:'var(--rd)', display:'flex', alignItems:'center', gap:7, borderBottom:'0.5px solid var(--bd)' }} onMouseEnter={e=>e.currentTarget.style.background='var(--rdb)'} onMouseLeave={e=>e.currentTarget.style.background=''} onClick={()=>bulkAllocate(null)}>
                      ✕ Unassign category
                    </div>
                    {CAT_TYPE_ORDER.filter(t=>catsByType[t]?.some(cat=>{ if(!bulkCatQ)return true; const q=bulkCatQ.toLowerCase(); return(cat.l||'').toLowerCase().includes(q)||(cat.code||'').includes(q); })).map(type=>(
                      <React.Fragment key={type}>
                        <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', background:'var(--sand3)', borderTop:'0.5px solid var(--bd)' }}>{CAT_TYPE_LABELS[type]}</div>
                        {catsByType[type].filter(cat=>{ if(!bulkCatQ)return true; const q=bulkCatQ.toLowerCase(); return(cat.l||'').toLowerCase().includes(q)||(cat.code||'').includes(q); }).map(cat=>{
                          const hasSubs=(cats||[]).some(ch=>ch.parent_id===cat.id&&ch.is_active!==false);
                          if(hasSubs) return <div key={cat.id} style={{ padding:'4px 10px', fontSize:11.5, background:'var(--sand2)', color:'var(--stone)', display:'flex', alignItems:'center', gap:6, borderTop:'0.5px solid var(--bd)' }}><span style={{ width:7,height:7,borderRadius:'50%',background:cat.col,flexShrink:0 }}/>{cat.code&&<span style={{fontFamily:'monospace',fontSize:10}}>{cat.code}</span>}<span style={{fontWeight:500}}>{cat.l}</span></div>;
                          return <div key={cat.id} style={{ padding:'6px 10px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:7 }} onMouseEnter={e=>e.currentTarget.style.background='var(--al)'} onMouseLeave={e=>e.currentTarget.style.background=''} onClick={()=>bulkAllocate(cat.id)}><span style={{ width:7,height:7,borderRadius:'50%',background:cat.col,flexShrink:0 }}/>{cat.code&&<span style={{fontFamily:'monospace',fontSize:10,color:'var(--stone2)',flexShrink:0}}>{cat.code.includes('/')?'/'+cat.code.split('/')[1]:cat.code}</span>}<span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cat.l}</span></div>;
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
