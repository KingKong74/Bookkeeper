/**
 * views/Reports/index.jsx
 * -----------------------
 * TrialBalance, ProfitAndLoss, BalanceSheet, PayeeReport
 * All with:
 *   - A4-style paper layout
 *   - Row drill-through (click → side panel with transactions)
 *   - P&L comparison (current vs prior period)
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { PeriodBar } from '../../components/ui/PeriodBar';
import { BalanceAlert, MetricCard, PayeeAvatar } from '../../components/ui/index';
import { upsertPayee, deletePayee, updateTransaction, postCategoryJournal } from '../../lib/supabase';
import { fmt, fmtSigned, fmtAcct, filterByDateRange, buildAccountTotals, buildTBFromJournals, buildPLFromJournals, buildBSFromJournals, isTBBalanced, payeeColor, dateRangeLabel } from '../../utils/helpers';

// ── A4 paper wrapper ──────────────────────────────────────────────────────────
function A4Paper({ title, subtitle, children, wide=false }) {
  const { org } = useApp();
  const today = new Date().toLocaleDateString('en-AU', { day:'2-digit', month:'long', year:'numeric' });
  return (
    <div style={{ maxWidth:wide?1060:760, margin:'0 auto', background:'#fff', border:'0.5px solid var(--bd2)', borderRadius:4, boxShadow:'0 2px 12px rgba(42,36,32,0.10)', fontFamily:'var(--font-sans)', overflow:'hidden' }}>
      <div style={{ padding:'24px 32px 18px', borderBottom:'2px solid var(--ink)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <div style={{ width:14, height:14, background:'#BA7517', transform:'rotate(45deg)', borderRadius:2, flexShrink:0 }} />
              <span style={{ fontSize:16, fontWeight:600, color:'var(--ink)' }}>Ledger</span>
            </div>
            <div style={{ fontSize:11, color:'var(--stone)' }}>{org?.name || 'Personal accounts'}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:20, fontWeight:600, color:'var(--ink)', letterSpacing:'-0.01em' }}>{title}</div>
            {subtitle && <div style={{ fontSize:12, color:'var(--stone)', marginTop:3 }}>{subtitle}</div>}
            <div style={{ fontSize:11, color:'var(--stone)', marginTop:3 }}>Prepared {today}</div>
          </div>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

// ── Statement row helpers ─────────────────────────────────────────────────────
function StHead({ children }) {
  return <div style={{ padding:'7px 32px 3px', fontSize:10, fontWeight:600, color:'var(--stone)', letterSpacing:'0.07em', textTransform:'uppercase', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)' }}>{children}</div>;
}
// Format a code for sub-account display: "831/001" → "/001", "831" → "831"
function subCodeLabel(code, isSub) {
  if (!code) return '';
  if (isSub && code.includes('/')) return '/' + code.split('/')[1];
  return code;
}

function StRow({ label, value, valueB, indent=false, sub=false, valueClass='', onClick, clickable=false, isParentHeader=false }) {
  // indent = normal indented row; sub = child sub-account row; isParentHeader = parent name row (no value)
  const leftPad  = sub ? '72px' : indent ? '44px' : '32px';
  const rightPad = '32px';
  return (
    <div onClick={onClick}
      style={{ display:'flex', justifyContent:'space-between', padding:`${sub?'3px':'5px'} ${rightPad} ${sub?'3px':'5px'} ${leftPad}`, borderBottom: isParentHeader?'none':'0.5px solid var(--bd)', fontSize:sub?11.5:12.5, cursor:clickable&&!isParentHeader?'pointer':'default', alignItems:'center', background:undefined }}
      onMouseEnter={e => { if (clickable&&!isParentHeader) e.currentTarget.style.background='var(--al)'; }}
      onMouseLeave={e => { e.currentTarget.style.background=''; }}
    >
      <span style={{ color:'var(--ink)', display:'flex', alignItems:'center', gap:5, fontWeight:isParentHeader?600:sub?400:400 }}>
        {label}
        {clickable && !isParentHeader && <span style={{ fontSize:10, color:'var(--stone)', opacity:0.6 }}>↗</span>}
      </span>
      <div style={{ display:'flex', gap:32, flexShrink:0, paddingRight: sub ? '24px' : '0' }}>
        <span className={valueClass} style={{ fontVariantNumeric:'tabular-nums', minWidth:90, textAlign:'right' }}>{value}</span>
        {valueB !== undefined && <span style={{ fontVariantNumeric:'tabular-nums', color:'var(--stone2)', minWidth:90, textAlign:'right', fontSize:12 }}>{valueB}</span>}
      </div>
    </div>
  );
}
function StGroupTotal({ label, value, valueB, valueClass='' }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 32px 6px 40px', fontSize:12, alignItems:'center', marginBottom:6, borderTop:'0.5px solid var(--bd)' }}>
      <span style={{ color:'var(--stone)', fontSize:12, fontWeight:500 }}>{label} total</span>
      <div style={{ display:'flex', gap:32, flexShrink:0 }}>
        <span className={valueClass} style={{ fontVariantNumeric:'tabular-nums', minWidth:90, textAlign:'right', fontWeight:500, borderBottom:'1.5px solid var(--ink)', paddingBottom:1 }}>{value}</span>
        {valueB !== undefined && <span style={{ fontVariantNumeric:'tabular-nums', color:'var(--stone2)', minWidth:90, textAlign:'right', fontSize:12, borderBottom:'1.5px solid var(--stone)', paddingBottom:1 }}>{valueB}</span>}
      </div>
    </div>
  );
}

function StTotal({ label, value, valueB, valueClass='' }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 32px', fontWeight:600, fontSize:12.5, borderTop:'1px solid var(--bd2)', background:'var(--sand)', alignItems:'center' }}>
      <span>{label}</span>
      <div style={{ display:'flex', gap:32, flexShrink:0 }}>
        <span className={valueClass} style={{ fontVariantNumeric:'tabular-nums', minWidth:90, textAlign:'right' }}>{value}</span>
        {valueB !== undefined && <span style={{ fontVariantNumeric:'tabular-nums', color:'var(--stone2)', minWidth:90, textAlign:'right', fontSize:12 }}>{valueB}</span>}
      </div>
    </div>
  );
}
function StGrand({ label, value, valueB, valueClass='' }) {
  return <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 32px', fontWeight:600, fontSize:13.5, background:'var(--al)', borderTop:'1.5px solid var(--a)' }}>
    <span>{label}</span>
    <span className={valueClass} style={{ fontVariantNumeric:'tabular-nums' }}>{value}</span>
  </div>;
}

// ── Comparison column headers ─────────────────────────────────────────────────
function CompareHeader({ labelA, labelB }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end', padding:'4px 32px', gap:32, borderBottom:'0.5px solid var(--bd)', background:'var(--sand)' }}>
      <span style={{ fontSize:10, fontWeight:600, color:'var(--ink)',   textTransform:'uppercase', letterSpacing:'0.05em', minWidth:90, textAlign:'right' }}>{labelA} (current)</span>
      <span style={{ fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', minWidth:90, textAlign:'right' }}>{labelB} (prior)</span>
    </div>
  );
}

// ── Drill-through side panel ──────────────────────────────────────────────────
function DrillPanel({ cat, txns, dateFrom, dateTo, onClose, subCatIds=[] }) {
  if (!cat) return null;
  const { catMap, org, accounts } = useApp();
  const [editTxnId, setEditTxnId] = useState(null);
  const [txnsLocal, setTxnsLocal] = useState(null);
  const [popout,    setPopout]    = useState(false);
  const allIds = new Set([cat.id, ...subCatIds].filter(Boolean));
  const baseTxns = txnsLocal ? txns.map(t => { const ov=txnsLocal.find(x=>x.id===t.id); return ov||t; }) : txns;
  const catTxns = filterByDateRange(baseTxns, dateFrom, dateTo)
    .filter(t => cat._isBankDrill ? t.account_id === cat.id : allIds.has(t.cat))
    .sort((a,b) => b.date.localeCompare(a.date));
  const total = catTxns.reduce((s,t) => s + t.amt, 0);

  const header = (
    <div style={{ padding:'14px 18px', borderBottom:'0.5px solid var(--bd)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
      <span style={{ width:10, height:10, borderRadius:'50%', background:cat.col, flexShrink:0, display:'inline-block' }} />
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:500, fontSize:14 }}>{cat.l}{subCatIds.length>0&&<span style={{ fontSize:11, fontWeight:400, color:'var(--stone)', marginLeft:8 }}>incl. {subCatIds.length} sub-account{subCatIds.length>1?'s':''}</span>}</div>
        <div style={{ fontSize:11, color:'var(--stone)', marginTop:1 }}>{cat.ac} · {cat.t} · {dateRangeLabel(dateFrom, dateTo)}</div>
      </div>
      <button onClick={()=>setPopout(v=>!v)} title={popout?'Dock to side':'Pop out to centre'}
        style={{ background:'none', border:'0.5px solid var(--bd2)', borderRadius:4, cursor:'pointer', fontSize:12, color:'var(--stone)', padding:'2px 8px', marginRight:4 }}>{popout?'⤡':'⤢'}</button>
      <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--stone)', lineHeight:1, padding:0 }}>×</button>
    </div>
  );

  const stats = (
    <div style={{ padding:'10px 18px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)', display:'flex', gap:20, flexShrink:0 }}>
      <div><div style={{ fontSize:10, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:500 }}>Transactions</div><div style={{ fontSize:16, fontWeight:500 }}>{catTxns.length}</div></div>
      <div><div style={{ fontSize:10, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:500 }}>Total</div><div style={{ fontSize:16, fontWeight:500 }} className={total>=0?'vp':'vn'}>{total>=0?'+':''}{fmt(total)}</div></div>
      <div><div style={{ fontSize:10, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:500 }}>Average</div><div style={{ fontSize:16, fontWeight:500 }}>{catTxns.length>0?fmt(Math.abs(total/catTxns.length)):'—'}</div></div>
    </div>
  );

  const body = (
    <div style={{ flex:1, overflowY:'auto' }}>
      {catTxns.length===0 ? (
        <div style={{ padding:24, textAlign:'center', color:'var(--stone)', fontSize:12 }}>No transactions in current date range.</div>
      ) : (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr style={{ background:'var(--sand)', position:'sticky', top:0 }}>
            <th style={{ padding:'7px 18px', fontSize:11, fontWeight:500, color:'var(--stone)', textAlign:'left', textTransform:'uppercase', letterSpacing:'0.04em' }}>Date</th>
            <th style={{ padding:'7px 10px', fontSize:11, fontWeight:500, color:'var(--stone)', textAlign:'left', textTransform:'uppercase', letterSpacing:'0.04em' }}>Description</th>
            <th style={{ padding:'7px 18px', fontSize:11, fontWeight:500, color:'var(--stone)', textAlign:'right', textTransform:'uppercase', letterSpacing:'0.04em' }}>Amount</th>
          </tr></thead>
          <tbody>
            {catTxns.map(t => {
              const isEditing = editTxnId === t.id;
              return (
                <tr key={t.id} style={{ borderBottom:'0.5px solid var(--bd)', background:isEditing?'var(--al)':undefined, cursor:'pointer' }}
                  onClick={()=>setEditTxnId(isEditing?null:t.id)}>
                  <td style={{ padding:'8px 18px', fontSize:12, color:'var(--stone)', whiteSpace:'nowrap' }}>{t.date}</td>
                  <td style={{ padding:'8px 10px', fontSize:12 }}>
                    <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:popout?400:200 }}>{t.desc}</div>
                    {t.payee && <div style={{ fontSize:11, color:'var(--stone)' }}>{t.payee}</div>}
                    {isEditing && (
                      <div style={{ marginTop:6, display:'flex', gap:6 }} onClick={e=>e.stopPropagation()}>
                        <select defaultValue={t.cat||''} onChange={async e=>{
                          const catId = e.target.value || null;
                          const oldCatId = t.cat || null;
                          // Optimistic local update
                          setTxnsLocal(prev=>(prev||txns).map(x=>x.id===t.id?{...x,cat:catId,category_id:catId}:x));
                          setEditTxnId(null);
                          // DB update
                          await updateTransaction(t.id, { category_id: catId });
                          // Journal: postCategoryJournal handles both reversal of old + post of new.
                          // Pass category=null to unassign (adds reversal lines), or pass the new cat.
                          const acct = t.account_id ? (accounts||[]).find(a=>a.id===t.account_id) : null;
                          const newCat = catId ? catMap[catId] : null;
                          postCategoryJournal(org?.id, t, newCat, acct)
                            .catch(e=>console.warn('Journal post failed:', e.message));
                        }} style={{ fontSize:11,padding:'3px 6px',border:'0.5px solid var(--bd2)',borderRadius:'var(--rr)',background:'#fff',maxWidth:200 }}>
                          <option value="">— unassign —</option>
                          {Object.values(catMap).filter(c=>c.is_active!==false).sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999)).map(c=>(
                            <option key={c.id} value={c.id}>{c.code?c.code+' ':''}{c.l}</option>
                          ))}
                        </select>
                        <button onClick={()=>setEditTxnId(null)} style={{ fontSize:11,padding:'3px 8px',border:'0.5px solid var(--bd2)',borderRadius:'var(--rr)',background:'var(--sand)',cursor:'pointer' }}>Cancel</button>
                      </div>
                    )}
                  </td>
                  <td style={{ padding:'8px 18px', fontSize:12, textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:500 }} className={t.amt>=0?'vp':'vn'}>
                    {t.amt>=0?'+':''}{fmt(t.amt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  if (popout) return (
    <div style={{ position:'fixed', inset:0, background:'rgba(42,36,32,0.45)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={()=>setPopout(false)}>
      <div style={{ background:'#FDFAF6', borderRadius:12, boxShadow:'0 12px 40px rgba(42,36,32,0.25)', width:'min(90vw,800px)', maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden' }}
        onClick={e=>e.stopPropagation()}>
        {header}{stats}{body}
      </div>
    </div>
  );

  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:480, background:'#FDFAF6', boxShadow:'-4px 0 24px rgba(42,36,32,0.15)', zIndex:800, display:'flex', flexDirection:'column', borderLeft:'0.5px solid var(--bd2)' }}>
      {header}{stats}{body}
    </div>
  );
}
// ── Period offset helper ──────────────────────────────────────────────────────
function priorPeriod(from, to) {
  const f = new Date(from), t = new Date(to);
  const days = Math.round((t - f) / 86400000) + 1;
  const pf = new Date(f); pf.setDate(pf.getDate() - days);
  const pt = new Date(f); pt.setDate(pt.getDate() - 1);
  return [pf.toISOString().slice(0,10), pt.toISOString().slice(0,10)];
}

// ── Comparison toolbar ────────────────────────────────────────────────────────
function CompareBar({ compare, setCompare }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, padding:'8px 12px', background:'var(--sand)', borderRadius:'var(--rr)', border:'0.5px solid var(--bd)' }}>
      <span style={{ fontSize:11.5, color:'var(--stone)', fontWeight:500, marginRight:4 }}>⇄ Compare:</span>
      {[['none','Off'],['prior','Prior period'],['year','Prior year'],['ytd','YTD']].map(([v,l]) => (
        <button key={v} onClick={() => setCompare(v)}
          style={{ padding:'4px 12px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', cursor:'pointer', fontFamily:'var(--font-sans)', background:compare===v?'var(--a)':'#FDFAF6', color:compare===v?'#fff':'var(--stone)', fontWeight:compare===v?500:400, transition:'all 0.12s' }}>
          {l}
        </button>
      ))}
      {compare !== 'none' && (
        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--a2)', fontStyle:'italic' }}>
          Click any row to drill into transactions
        </span>
      )}
    </div>
  );
}

function getPriorDates(compare, dateFrom, dateTo) {
  if (compare === 'none') return null;
  if (compare === 'prior') return priorPeriod(dateFrom, dateTo);
  if (compare === 'year') {
    const f = new Date(dateFrom), t = new Date(dateTo);
    f.setFullYear(f.getFullYear()-1); t.setFullYear(t.getFullYear()-1);
    return [f.toISOString().slice(0,10), t.toISOString().slice(0,10)];
  }
  if (compare === 'ytd') {
    // Year-to-date from July 1 of current FY
    const today = new Date();
    const fyYear = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear()-1;
    return [`${fyYear}-07-01`, today.toISOString().slice(0,10)];
  }
  return null;
}

// ── Trial Balance ─────────────────────────────────────────────────────────────
export function TrialBalance() {
  const { txns, catMap, dateFrom, dateTo, journals, accounts } = useApp();
  const [drill,   setDrill]   = useState(null);
  const [compare, setCompare] = useState('none');

  const priorDates  = getPriorDates(compare, dateFrom, dateTo);
  const accountMap  = Object.fromEntries((accounts||[]).map(a=>[a.id,a]));
  const hasJournals = (journals||[]).some(j => (j.journal_lines||j.lines||[]).length > 0);

  // Use journal-based when available, else fall back to transaction totals
  const journalAccts  = buildTBFromJournals(journals||[], dateFrom, dateTo, catMap, accountMap);
  const journalAcctsP = priorDates ? buildTBFromJournals(journals||[], priorDates[0], priorDates[1], catMap, accountMap) : [];

  // Transaction fallback: DR = positive amounts per cat, CR = negative
  const ft        = filterByDateRange(txns, dateFrom, dateTo);
  const ftP       = priorDates ? filterByDateRange(txns, priorDates[0], priorDates[1]) : [];
  function txnToTB(transactions) {
    const map = {};
    transactions.forEach(t => {
      const cat = catMap[t.cat]; if (!cat) return;
      const k = `cat:${cat.id}`;
      if (!map[k]) map[k] = { ac: cat.l, t: cat.t, col: cat.col, id: cat.id, dr: 0, cr: 0, label: cat.l };
      if ((t.amt||0) > 0) map[k].cr += t.amt; else map[k].dr += Math.abs(t.amt||0);
    });
    return Object.values(map).filter(a => a.dr > 0 || a.cr > 0);
  }

  // Synthesize parent summary rows for accounts that only appear as parents of children
  function addSyntheticParents(rows) {
    const rowIds = new Set(rows.map(r=>r.cat_id).filter(Boolean));
    const parentIds = [...new Set(rows.map(r=>r.parent_id).filter(Boolean))];
    const extra = parentIds
      .filter(pid => !rowIds.has(pid))
      .map(pid => {
        const parent = catMap[pid]; if (!parent) return null;
        const kids = rows.filter(r=>r.parent_id===pid);
        const dr = kids.reduce((s,r)=>s+(r.dr||0),0);
        const cr = kids.reduce((s,r)=>s+(r.cr||0),0);
        if (!dr && !cr) return null;
        return { key:`cat:${pid}`, label:parent.l, type:parent.t, col:parent.col,
          cat_id:pid, code:parent.code||null, parent_id:null, dr, cr, net:cr-dr, synthetic:true };
      }).filter(Boolean);
    if (!extra.length) return rows;
    const TYPE_ORD = ['asset','liability','equity','income','expense'];
    const allRows = [...rows, ...extra];
    allRows.sort((a,b)=>{
      const ta=TYPE_ORD.indexOf(a.type), tb=TYPE_ORD.indexOf(b.type);
      if(ta!==tb) return (ta===-1?99:ta)-(tb===-1?99:tb);
      // Group children under their parent: sort by "root code" (parent code for children)
      const aRoot = a.parent_id ? (allRows.find(r=>r.cat_id===a.parent_id)?.code||a.code||'9999') : (a.code||'9999');
      const bRoot = b.parent_id ? (allRows.find(r=>r.cat_id===b.parent_id)?.code||b.code||'9999') : (b.code||'9999');
      const aRootN = parseInt(aRoot)||9999, bRootN = parseInt(bRoot)||9999;
      if(aRootN!==bRootN) return aRootN-bRootN;
      // Same root: synthetic/parent first, then children by code
      if(a.synthetic && !b.synthetic) return -1;
      if(!a.synthetic && b.synthetic) return 1;
      return (parseInt(a.code)||9999)-(parseInt(b.code)||9999);
    });
    return allRows;
  }

  const accts  = addSyntheticParents(hasJournals ? journalAccts  : txnToTB(ft));
  const acctsp = addSyntheticParents(hasJournals ? journalAcctsP : (priorDates ? txnToTB(ftP) : []));
  // TB shows only parent/standalone rows — subs roll up to their parent
  const acctsTB = accts.filter(a => !a.parent_id);
  const balanced   = isTBBalanced(accts.filter(a=>!a.synthetic));
  const priorLabel = priorDates ? dateRangeLabel(priorDates[0], priorDates[1]) : '';
  const priorByKey = Object.fromEntries(acctsp.map(a => [a.cat_id||a.label||a.ac, a]));
  const totalDR = acctsTB.reduce((s,a)=>s+(Math.abs(a.net)>0.005&&a.net<0?Math.abs(a.net):0),0);
  const totalCR = acctsTB.reduce((s,a)=>s+(Math.abs(a.net)>0.005&&a.net>0?a.net:0),0);

  return (
    <div>
      <PeriodBar />

      {/* Balanced badge */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}>
        {hasJournals ? (
          <span style={{ fontSize:11, padding:'3px 10px', borderRadius:99, fontWeight:600,
            background: balanced ? 'var(--gnb)' : 'var(--rdb)',
            color:      balanced ? 'var(--gn)'  : 'var(--rd)' }}>
            {balanced ? '✓ Balanced — DR = CR' : `⚠ Imbalanced by ${fmt(Math.abs(totalDR - totalCR))}`}
          </span>
        ) : (
          <div style={{ fontSize:12, color:'var(--stone)', padding:'6px 10px', background:'var(--al)', borderRadius:'var(--rr)', border:'0.5px solid var(--bd)' }}>
            💡 Categorise transactions to generate journal entries and populate the trial balance.
          </div>
        )}
      </div>

      <CompareBar compare={compare} setCompare={setCompare} />
      <BalanceAlert balanced={balanced} okText="Trial balance is balanced." warnText="Trial balance out of balance." />
      <A4Paper title="Trial Balance" wide={compare!=='none'}  subtitle={dateRangeLabel(dateFrom, dateTo)}>
        <div style={{ padding:'20px 0 0' }}>
          {compare!=='none' && <CompareHeader labelA={dateRangeLabel(dateFrom,dateTo)} labelB={priorLabel} />}
          <div style={{ display:'grid', gridTemplateColumns: compare!=='none' ? '70px 1fr 90px 110px 110px 110px 110px' : '70px 1fr 90px 110px 110px', padding:'6px 16px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd2)' }}>
            {(compare!=='none'
              ? ['Code','Account','Type','Debit','Credit','DR (prior)','CR (prior)']
              : ['Code','Account','Type','Debit','Credit']
            ).map((h,i) => (
              <span key={h} style={{ fontSize:10, fontWeight:500, color:i>2?'var(--stone2)':'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:i>1?'right':'left' }}>{h}</span>
            ))}
          </div>
          {!hasJournals && accts.length > 0 && <div style={{ padding:'8px 32px', fontSize:11, color:'var(--stone)', background:'var(--al)', borderBottom:'0.5px solid var(--bd)' }}>Showing transaction totals. Assign bank accounts and post journals for a double-entry trial balance.</div>}
          {acctsTB.length === 0 && <div style={{ padding:'24px 32px', color:'var(--stone)', fontSize:12 }}>No transactions with categories in range.</div>}
          {acctsTB.map((a, i) => {
            const matchedCat = a.cat_id ? catMap[a.cat_id] : Object.values(catMap).find(c=>c.l===(a.label||a.ac));
            const isSub = !!a.parent_id;
            return (
              <div key={a.label || a.ac || i}
                style={{ display:'grid', gridTemplateColumns:compare!=='none'?'70px 1fr 90px 110px 110px 110px 110px':'70px 1fr 90px 110px 110px', padding:'6px 16px', borderBottom:'0.5px solid var(--bd)', fontSize:isSub?12:12.5, cursor:matchedCat?'pointer':'default', background:isSub?'var(--sand)':undefined }}
                onClick={() => { if (!matchedCat) return; const subIds=accts.filter(r=>r.parent_id===a.cat_id).map(r=>r.cat_id).filter(Boolean); setDrill({...matchedCat,_subIds:subIds}); }}
                onMouseEnter={e => { if(matchedCat) e.currentTarget.style.background='var(--al)'; }}
                onMouseLeave={e => { e.currentTarget.style.background=isSub?'var(--sand)':''; }}
              >
                {/* Code column */}
                <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--stone2)', display:'flex', alignItems:'center' }}>
                  {a.code ? (isSub && a.code.includes('/') ? '/'+a.code.split('/')[1] : a.code) : '—'}
                </span>
                {/* Account name */}
                <span style={{ display:'flex', alignItems:'center', gap:5, paddingLeft:isSub?12:0 }}>
                  {isSub && <span style={{ fontSize:7, color:'var(--stone2)', opacity:0.6 }}>◆</span>}
                  <span style={{ fontWeight:a.synthetic?600:400, color:isSub?'var(--stone)':'var(--ink)' }}>{a.label || a.ac}</span>
                  {matchedCat && <span style={{ fontSize:10, color:'var(--stone)', opacity:0.5 }}>↗</span>}
                </span>
                {/* Type */}
                <span style={{ textAlign:'right', fontSize:11, color:'var(--stone)', textTransform:'capitalize' }}>{a.type||'—'}</span>
                {/* DR / CR net */}
                <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{a.net<-0.005?fmt(Math.abs(a.net)):'—'}</span>
                <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{a.net>0.005?fmt(a.net):'—'}</span>
                {compare!=='none' && (() => {
                  const pNet = (priorByKey[a.cat_id||a.label||a.ac]?.net) ?? 0;
                  return <>
                    <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--stone2)' }}>{pNet<-0.005?fmt(Math.abs(pNet)):'—'}</span>
                    <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--stone2)' }}>{pNet>0.005?fmt(pNet):'—'}</span>
                  </>;
                })()}
              </div>
            );
          })}
          <div style={{ display:'grid', gridTemplateColumns:compare!=='none'?'70px 1fr 90px 110px 110px 110px 110px':'70px 1fr 90px 110px 110px', padding:'8px 16px', background:'var(--sand)', borderTop:'1.5px solid var(--ink)', fontWeight:600, fontSize:12.5 }}>
            <span></span>
            <span style={{ color:balanced?'var(--ink)':'var(--rd)' }}>Total</span>
            <span></span>
            <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:balanced?'var(--ink)':'var(--rd)' }}>{fmt(totalDR)}</span>
            <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:balanced?'var(--ink)':'var(--rd)' }}>{fmt(totalCR)}</span>
            {compare!=='none' && <>
              <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--stone2)' }}>{fmt(Math.abs(acctsp.filter(a=>a.net<0).reduce((s,a)=>s+a.net,0)))}</span>
              <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--stone2)' }}>{fmt(acctsp.filter(a=>a.net>0).reduce((s,a)=>s+a.net,0))}</span>
            </>}
          </div>
          <div style={{ height:24 }} />
        </div>
      </A4Paper>
      {drill && <DrillPanel cat={drill} txns={txns} dateFrom={dateFrom} dateTo={dateTo} subCatIds={drill?._subIds||[]} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ── Profit & Loss ─────────────────────────────────────────────────────────────
export function ProfitAndLoss() {
  const { txns, catMap, dateFrom, dateTo, journals, accounts } = useApp();
  const [drill,   setDrill]   = useState(null);
  const [compare, setCompare] = useState('none');

  const priorDates  = getPriorDates(compare, dateFrom, dateTo);
  const accountMap  = Object.fromEntries((accounts||[]).map(a=>[a.id,a]));
  const hasJournals = (journals||[]).some(j=>(j.journal_lines||j.lines||[]).some(l=>l.category_id));
  const useJournals = hasJournals;

  // Journal-based (always primary)
  const rawPL  = buildPLFromJournals(journals||[], dateFrom, dateTo, catMap, accountMap);
  const rawPLP = priorDates ? buildPLFromJournals(journals||[], priorDates[0], priorDates[1], catMap, accountMap) : null;

  // Add synthetic parent rows for accounts that only appear as parents of sub-account lines
  function addPLParents(lines) {
    if (!lines?.length) return lines||[];
    const lineIds = new Set(lines.map(x=>x.id));
    const extra = [];
    [...new Set(lines.map(x=>x.parent_id).filter(Boolean))].forEach(pid => {
      if (lineIds.has(pid)) return;
      const parent = catMap[pid]; if (!parent) return;
      const kids = lines.filter(x=>x.parent_id===pid);
      const dr = kids.reduce((s,x)=>s+(x.dr||0),0);
      const cr = kids.reduce((s,x)=>s+(x.cr||0),0);
      extra.push({ ...parent, id:pid, l:parent.l, t:parent.t, dr, cr, total:cr-dr, synthetic:true, parent_id:null });
    });
    if (!extra.length) return lines;
    return [...lines, ...extra].sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999));
  }
  const pl  = rawPL  ? { ...rawPL,  incomeLines: addPLParents(rawPL.incomeLines),  expenseLines: addPLParents(rawPL.expenseLines)  } : rawPL;
  const plP = rawPLP ? { ...rawPLP, incomeLines: addPLParents(rawPLP.incomeLines), expenseLines: addPLParents(rawPLP.expenseLines) } : rawPLP;

  // Legacy transaction fallback
  const ft  = filterByDateRange(txns, dateFrom, dateTo);
  const ftP = priorDates ? filterByDateRange(txns, priorDates[0], priorDates[1]) : [];
  function buildByCat(transactions) {
    const byCat = {};
    transactions.forEach(t => {
      const c = catMap[t.cat]; if (!c) return;
      if (c.t==='income'  && t.amt<=0) return;
      if (c.t==='expense' && t.amt>=0) return;
      if (!byCat[c.id]) byCat[c.id] = { ...c, total:0 };
      byCat[c.id].total += t.amt;
    });
    return byCat;
  }
  const byCat  = buildByCat(ft);
  const byCatP = compare!=='none' ? buildByCat(ftP) : {};
  const legacyIncome  = Object.values(byCat).filter(c=>c.t==='income');
  const legacyExpense = Object.values(byCat).filter(c=>c.t==='expense');
  const legacyTotalIn = legacyIncome.reduce((s,c)=>s+c.total,0);
  const legacyTotalEx = legacyExpense.reduce((s,c)=>s+c.total,0);

  // Pick source
  const incomeLines  = useJournals ? pl.incomeLines  : legacyIncome;
  const expenseLines = useJournals ? pl.expenseLines : legacyExpense;
  const totalIncome  = useJournals ? pl.totalIncome  : legacyTotalIn;
  const totalExpense = useJournals ? pl.totalExpense : Math.abs(legacyTotalEx);
  const netProfit    = useJournals ? pl.netProfit    : (legacyTotalIn + legacyTotalEx);

  const totalIncomeP  = useJournals ? (plP?.totalIncome  ?? 0) : Object.values(byCatP).filter(c=>c.t==='income').reduce((s,c)=>s+c.total,0);
  const totalExpenseP = useJournals ? (plP?.totalExpense ?? 0) : Math.abs(Object.values(byCatP).filter(c=>c.t==='expense').reduce((s,c)=>s+c.total,0));
  const netProfitP    = useJournals ? (plP?.netProfit    ?? 0) : (totalIncomeP - totalExpenseP);

  const priorLabel = priorDates ? dateRangeLabel(priorDates[0], priorDates[1]) : '';

  return (
    <div>
      <PeriodBar />
      <div className="metrics">
        <MetricCard label="Total income"        value={fmt(totalIncome)}            valueClass="vp" />
        <MetricCard label="Total expenses"      value={fmt(Math.abs(totalExpense))} valueClass="vn" />
        <MetricCard label="Net profit / (loss)" value={fmt(netProfit)}              valueClass={netProfit>=0?'vp':'vn'} />
        <MetricCard label="Expense ratio"       value={`${totalIncome>0?Math.round(Math.abs(totalExpense)/totalIncome*100):0}%`} valueClass="va" />
      </div>
      {/* Source toggle */}
      {hasJournals && (
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>

        </div>
      )}
      <CompareBar compare={compare} setCompare={setCompare} />
      <A4Paper title="Profit & Loss" wide={compare!=='none'}  subtitle={dateRangeLabel(dateFrom, dateTo)}>
        <div style={{ padding:'20px 0 0' }}>
          {compare!=='none' && <CompareHeader labelA={dateRangeLabel(dateFrom,dateTo)} labelB={priorLabel} />}

          <StHead>Income</StHead>
          {incomeLines.length===0 && <StRow label="No income in period" value="" indent />}
          {(() => {
            const lineIds = new Set(incomeLines.map(x=>x.id));
            const parents = incomeLines.filter(x=>!x.parent_id || !lineIds.has(x.parent_id));
            const childrenOf = id => incomeLines.filter(x=>x.parent_id===id);
            return parents.map(c => {
              const kids = childrenOf(c.id);
              const hasKids = kids.length > 0;
              const val = useJournals ? fmt(c.cr - c.dr) : fmt(c.total);
              const priorC = useJournals ? plP?.incomeLines?.find(x=>x.id===c.id) : byCatP[c.id];
              const valB = compare!=='none' ? (priorC ? (useJournals?fmt(priorC.cr-priorC.dr):fmt(priorC.total)) : '—') : undefined;
              // Compute total across parent+kids for the group total row
              const kidsTotal = kids.reduce((s,ch)=>s+(useJournals?ch.cr-ch.dr:ch.total),0);
              const ownVal = c.synthetic ? 0 : (useJournals ? c.cr - c.dr : c.total);
              const groupTotal = hasKids ? ownVal + kidsTotal : null;
              const groupTotalB = hasKids && compare!=='none' ? (() => {
                const priorKidsTotal = kids.reduce((s,ch)=>{ const p=plP?.incomeLines?.find(x=>x.id===ch.id)||byCatP[ch.id]; return s+(p?(useJournals?p.cr-p.dr:p.total):0); },0);
                const priorOwn = c.synthetic ? 0 : (priorC?(useJournals?priorC.cr-priorC.dr:priorC.total):0);
                return fmt(priorOwn + priorKidsTotal);
              })() : undefined;
              return [
                // Parent name row — bold, no value when has kids (value is on the total row)
                hasKids
                  ? <StRow key={c.id} label={c.code ? `${c.code}  ${c.l}` : c.l} value="" valueB={undefined} indent isParentHeader clickable={false} />
                  : <StRow key={c.id} label={subCodeLabel(c.code,!!c.parent_id) ? `${subCodeLabel(c.code,!!c.parent_id)}  ${c.l}` : c.l} value={val} valueB={valB} indent clickable onClick={()=>setDrill(c)} valueClass="vp" />,
                // Sub-account rows: show /001 suffix, not full code
                ...kids.map(ch => {
                  const cv = useJournals?fmt(ch.cr-ch.dr):fmt(ch.total);
                  const pch = useJournals?plP?.incomeLines?.find(x=>x.id===ch.id):byCatP[ch.id];
                  const cvB = compare!=='none'?(pch?(useJournals?fmt(pch.cr-pch.dr):fmt(pch.total)):'—'):undefined;
                  const subLabel = ch.code && ch.code.includes('/') ? `/${ch.code.split('/')[1]}  ${ch.l}` : ch.l;
                  return <StRow key={ch.id} label={subLabel} value={cv} valueB={cvB} sub clickable onClick={()=>setDrill(ch)} valueClass="vp" />;
                }),
                // Group total row with underline — only when has kids
                hasKids && <StGroupTotal key={c.id+'-total'} label={c.l} value={fmt(groupTotal)} valueB={groupTotalB} valueClass="vp" />,
              ].filter(Boolean);
            });
          })()}
          <StTotal label="Total Income" value={fmt(totalIncome)} valueB={compare!=='none'?fmt(totalIncomeP):undefined} valueClass="vp" />

          <div style={{ height:8 }} />
          <StHead>Expenses</StHead>
          {expenseLines.length===0 && <StRow label="No expenses in period" value="" indent />}
          {(() => {
            const lineIds = new Set(expenseLines.map(x=>x.id));
            const parents = expenseLines.filter(x=>!x.parent_id || !lineIds.has(x.parent_id));
            const childrenOf = id => expenseLines.filter(x=>x.parent_id===id);
            return parents.map(c => {
              const kids = childrenOf(c.id);
              const hasKids = kids.length > 0;
              const val = useJournals ? fmt(c.dr - c.cr) : fmt(Math.abs(c.total));
              const priorC = useJournals ? plP?.expenseLines?.find(x=>x.id===c.id) : byCatP[c.id];
              const valB = compare!=='none' ? (priorC ? (useJournals?fmt(priorC.dr-priorC.cr):fmt(Math.abs(priorC.total))) : '—') : undefined;
              const kidsTotal = kids.reduce((s,ch)=>s+(useJournals?ch.dr-ch.cr:Math.abs(ch.total)),0);
              const ownVal = c.synthetic ? 0 : (useJournals ? c.dr - c.cr : Math.abs(c.total));
              const groupTotal = hasKids ? ownVal + kidsTotal : null;
              const groupTotalB = hasKids && compare!=='none' ? (() => {
                const priorKidsTotal = kids.reduce((s,ch)=>{ const p=plP?.expenseLines?.find(x=>x.id===ch.id)||byCatP[ch.id]; return s+(p?(useJournals?p.dr-p.cr:Math.abs(p.total)):0); },0);
                const priorOwn = c.synthetic ? 0 : (priorC?(useJournals?priorC.dr-priorC.cr:Math.abs(priorC.total)):0);
                return fmt(priorOwn + priorKidsTotal);
              })() : undefined;
              return [
                hasKids
                  ? <StRow key={c.id} label={c.code ? `${c.code}  ${c.l}` : c.l} value="" valueB={undefined} indent isParentHeader clickable={false} />
                  : <StRow key={c.id} label={subCodeLabel(c.code,!!c.parent_id) ? `${subCodeLabel(c.code,!!c.parent_id)}  ${c.l}` : c.l} value={val} valueB={valB} indent clickable onClick={()=>setDrill(c)} valueClass="vn" />,
                ...kids.map(ch => {
                  const cv = useJournals?fmt(ch.dr-ch.cr):fmt(Math.abs(ch.total));
                  const pch = useJournals?plP?.expenseLines?.find(x=>x.id===ch.id):byCatP[ch.id];
                  const cvB = compare!=='none'?(pch?(useJournals?fmt(pch.dr-pch.cr):fmt(Math.abs(pch.total))):'—'):undefined;
                  const subLabel = ch.code && ch.code.includes('/') ? `/${ch.code.split('/')[1]}  ${ch.l}` : ch.l;
                  return <StRow key={ch.id} label={subLabel} value={cv} valueB={cvB} sub clickable onClick={()=>setDrill(ch)} valueClass="vn" />;
                }),
                hasKids && <StGroupTotal key={c.id+'-total'} label={c.l} value={fmt(groupTotal)} valueB={groupTotalB} valueClass="vn" />,
              ].filter(Boolean);
            });
          })()}
          <StTotal label="Total Expenses" value={fmt(totalExpense)} valueB={compare!=='none'?fmt(totalExpenseP):undefined} valueClass="vn" />

          <StGrand label="Net Profit / (Loss)" value={fmt(netProfit)} valueClass={netProfit>=0?'vp':'vn'} />
          {compare!=='none' && (
            <div style={{ padding:'6px 32px', fontSize:12, color:'var(--stone)', borderTop:'0.5px solid var(--bd)', background:'var(--sand)' }}>
              Prior period net: <span className={netProfitP>=0?'vp':'vn'} style={{ fontWeight:500 }}>{fmt(netProfitP)}</span>
              {' · '}Variance: <span className={(netProfit-netProfitP)>=0?'vp':'vn'} style={{ fontWeight:500 }}>{fmtSigned(netProfit-netProfitP)}</span>
            </div>
          )}
          <div style={{ height:24 }} />
        </div>
      </A4Paper>
      {drill && <DrillPanel cat={drill} txns={txns} dateFrom={dateFrom} dateTo={dateTo} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ── Balance Sheet helpers ─────────────────────────────────────────────────────
function BSRow({ label, value, valueB, isNeg=false, onClick, clickable=false }) {
  return (
    <div onClick={onClick} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'3px 32px', fontSize:12.5, cursor:clickable?'pointer':'default' }}
      onMouseEnter={e=>{ if(clickable) e.currentTarget.style.background='var(--al)'; }}
      onMouseLeave={e=>{ e.currentTarget.style.background=''; }}>
      <span style={{ color:'var(--ink)', display:'flex', alignItems:'center', gap:5 }}>
        {label}{clickable&&<span style={{ fontSize:10, color:'var(--stone)', opacity:0.5 }}>↗</span>}
      </span>
      <div style={{ display:'flex', gap:32 }}>
        <span style={{ fontVariantNumeric:'tabular-nums', minWidth:110, textAlign:'right', color: isNeg ? 'var(--rd)' : 'var(--a2)', fontSize:12.5 }}>{value}</span>
        {valueB !== undefined && <span style={{ fontVariantNumeric:'tabular-nums', minWidth:110, textAlign:'right', color:'var(--stone2)', fontSize:12 }}>{valueB}</span>}
      </div>
    </div>
  );
}
function BSTotalRow({ label, value, valueB, isNeg=false, bold=false, underline=false }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 32px', borderTop:'0.5px solid var(--bd)', marginTop:2, fontSize:12.5 }}>
      <span style={{ fontWeight:bold?600:500, color:'var(--ink)' }}>{label}</span>
      <div style={{ display:'flex', gap:32 }}>
        <span style={{ fontVariantNumeric:'tabular-nums', minWidth:110, textAlign:'right', fontWeight:bold?600:500,
          color: isNeg ? 'var(--rd)' : 'var(--ink)',
          borderBottom: underline ? '2px solid var(--ink)' : bold ? '1px solid var(--bd2)' : undefined, paddingBottom:2 }}>{value}</span>
        {valueB !== undefined && <span style={{ fontVariantNumeric:'tabular-nums', minWidth:110, textAlign:'right', color:'var(--stone2)', fontSize:12 }}>{valueB}</span>}
      </div>
    </div>
  );
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────
export function BalanceSheet() {
  const { txns, catMap, dateFrom, dateTo, journals, accounts } = useApp();
  const [showZero, setShowZero] = useState(false);
  const [drill,    setDrill]    = useState(null);
  const [compare,  setCompare]  = useState('none');
  const [mode,     setMode]     = useState('journals');
  const [bsView,   setBsView]   = useState('standard'); // 'standard' | 'detailed'
  const [drillBS,  setDrillBS]  = useState(null);

  const priorDates  = getPriorDates(compare, dateFrom, dateTo);
  const accountMap  = Object.fromEntries((accounts||[]).map(a=>[a.id,a]));
  const hasJournals = (journals||[]).some(j=>(j.journal_lines||j.lines||[]).some(l=>l.category_id||l.bank_account_id));
  const useJournals = hasJournals;

  // Journal-based BS (cumulative to dateTo)
  const bs  = buildBSFromJournals(journals||[], '2000-01-01', dateTo,    catMap, accountMap);
  const bsP = priorDates ? buildBSFromJournals(journals||[], '2000-01-01', priorDates[1], catMap, accountMap) : null;
  const priorLabel = priorDates ? dateRangeLabel(priorDates[0], priorDates[1]) : '';

  // Legacy transaction-based
  const ft = filterByDateRange(txns, dateFrom, dateTo);
  const ftP = priorDates ? filterByDateRange(txns, priorDates[0], priorDates[1]) : [];
  function buildVals(transactions) {
    const byCat = {};
    transactions.forEach(t => {
      const c = catMap[t.cat]; if (!c) return;
      if (!byCat[c.id]) byCat[c.id] = { ...c, total:0 };
      byCat[c.id].total += t.amt;
    });
    return Object.values(byCat);
  }
  const vals  = buildVals(ft);
  const valsP = compare!=='none' ? buildVals(ftP) : [];
  const bankAccounts = (accounts||[]).map(a => {
    const acctTxns = txns.filter(t => t.account_id===a.id);
    const bal = (a.opening_balance||0) + acctTxns.reduce((s,t)=>s+(t.amt??0),0);
    return { ...a, balance:bal };
  });
  const liquidAccounts = bankAccounts.filter(a => (a.type==='checking'||a.type==='savings') && (showZero||Math.abs(a.balance)>0.005));
  const liquidTotal    = bankAccounts.filter(a=>a.type==='checking'||a.type==='savings').reduce((s,a)=>s+a.balance,0);
  const investAccounts = bankAccounts.filter(a => a.type==='investment' && (showZero||Math.abs(a.balance)>0.005));
  const investTotal    = bankAccounts.filter(a=>a.type==='investment').reduce((s,a)=>s+a.balance,0);
  const fixedAssets    = vals.filter(c=>c.t==='asset');
  const legacyTotalAssets = liquidTotal + investTotal + fixedAssets.reduce((s,c)=>s+Math.abs(c.total),0);
  const ccAccounts = bankAccounts.filter(a => (a.type==='credit_card'||a.type==='loan') && (showZero||Math.abs(a.balance)>0.005));
  const ccTotal    = bankAccounts.filter(a=>a.type==='credit_card'||a.type==='loan').reduce((s,a)=>s+Math.abs(a.balance),0);
  const catLiabilities = vals.filter(c=>c.t==='liability');
  const legacyTotalLiab = ccTotal + catLiabilities.reduce((s,c)=>s+Math.abs(c.total),0);
  const legacyTotalEquity = legacyTotalAssets - legacyTotalLiab;
  const legacyTotalLE    = legacyTotalLiab + legacyTotalEquity;
  const valsMapP   = {};
  valsP.forEach(c => { valsMapP[c.id] = c; });

  // Use journal or legacy
  const totalAssets = useJournals ? bs.totalAssets      : legacyTotalAssets;
  const totalLiab   = useJournals ? bs.totalLiabilities : legacyTotalLiab;
  const totalEquity = useJournals ? bs.totalEquity      : legacyTotalEquity;
  const totalLE     = useJournals ? bs.totalLE          : legacyTotalLE;

  return (
    <div>
      <PeriodBar />
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, flexWrap:'wrap', gap:8 }}>

        <CompareBar compare={compare} setCompare={setCompare} />
        <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--stone)', cursor:'pointer', userSelect:'none' }}>
          <input type="checkbox" checked={showZero} onChange={e=>setShowZero(e.target.checked)} style={{ cursor:'pointer' }} />
          Show zero-balance accounts
        </label>
      </div>
      {/* View toggle */}
      <div style={{ display:'flex', gap:6, marginBottom:8 }}>
        {[['standard','Standard'],['detailed','Detailed (Xero-style)']].map(([v,l])=>(
          <button key={v} className={`btn btn-sm${bsView===v?' btn-a':''}`} onClick={()=>setBsView(v)}>{l}</button>
        ))}
      </div>

      <A4Paper title="Balance Sheet" wide={compare!=='none' || bsView==='detailed'}  subtitle={dateRangeLabel(dateFrom, dateTo)}>
        {bsView === 'detailed' ? (
          /* ── Detailed / Xero-style: full-width, sections with totals ── */
          <div style={{ padding:'20px 0 0' }}>
            {compare!=='none' && (
              <div style={{ display:'grid', gridTemplateColumns:`1fr 130px${compare!=='none'?' 130px':''}`, padding:'4px 32px', borderBottom:'0.5px solid var(--bd)' }}>
                <span/><span style={{ textAlign:'right', fontSize:11, color:'var(--stone)', fontWeight:500 }}>{dateRangeLabel(dateFrom,dateTo)}</span>
                {compare!=='none'&&<span style={{ textAlign:'right', fontSize:11, color:'var(--stone2)', fontWeight:500 }}>{priorLabel}</span>}
              </div>
            )}
            {/* Assets section */}
            <div style={{ padding:'8px 32px 2px', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink)', marginTop:8 }}>Assets</div>
            {useJournals ? (
              bs.assetLines.map(l => {
                const pNet = bsP?.assetLines?.find(x=>(x.id||x.l)===(l.id||l.l))?.net??0;
                const bsCat=catMap[l.id]||(l.id?{id:l.id,l:l.l||l.name,col:l.col||'#185FA5',t:l.t||'asset',ac:l.type||'asset',_isBankDrill:true}:null);
                return <BSRow key={l.id||l.l} label={l.l||l.name} value={fmtAcct(l.net)} valueB={compare!=='none'?fmtAcct(pNet):undefined} isNeg={l.net<-0.005} clickable={!!bsCat} onClick={bsCat?()=>setDrillBS(bsCat):undefined} />;
              })
            ) : (
              <>
                {liquidAccounts.map(a=>{ const n=a.balance; return <BSRow key={a.id} label={a.name} value={fmtAcct(n)} isNeg={n<-0.005} />; })}
                {fixedAssets.map(a=><BSRow key={a.id} label={a.l} value={fmtAcct(a.total)} isNeg={a.total<-0.005} />)}
              </>
            )}
            <BSTotalRow label="Total Assets" value={fmtAcct(totalAssets)} isNeg={totalAssets<-0.005} valueB={compare!=='none'?fmtAcct(bsP?.totalAssets??0):undefined} bold />

            {/* Liabilities */}
            <div style={{ padding:'8px 32px 2px', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink)', marginTop:12 }}>Liabilities</div>
            {useJournals ? (
              bs.liabilityLines.map(l => {
                const pNet = bsP?.liabilityLines?.find(x=>(x.id||x.l)===(l.id||l.l))?.net??0;
                const bsCat=catMap[l.id]||(l.id?{id:l.id,l:l.l||l.name,col:l.col||'#185FA5',t:l.t||'asset',ac:l.type||'asset',_isBankDrill:true}:null);
                return <BSRow key={l.id||l.l} label={l.l||l.name} value={fmtAcct(l.net)} valueB={compare!=='none'?fmtAcct(pNet):undefined} isNeg={l.net<-0.005} clickable={!!bsCat} onClick={bsCat?()=>setDrillBS(bsCat):undefined} />;
              })
            ) : (
              <>
                {ccAccounts.map(a=>{ const n=-Math.abs(a.balance); return <BSRow key={a.id} label={a.name} value={fmtAcct(n)} isNeg={n<-0.005} />; })}
                {catLiabilities.map(a=><BSRow key={a.id} label={a.l} value={fmtAcct(-Math.abs(a.total))} isNeg />)}
              </>
            )}
            <BSTotalRow label="Total Liabilities" value={fmtAcct(-totalLiab)} isNeg={totalLiab>0.005} valueB={compare!=='none'?fmtAcct(bsP?-(bsP.totalLiabilities??0):0):undefined} bold />

            {/* Equity */}
            <div style={{ padding:'8px 32px 2px', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--ink)', marginTop:12 }}>Equity</div>
            {vals.filter(x=>x.t==='equity').map(x=><BSRow key={x.id} label={x.l} value={fmtAcct(x.total)} isNeg={x.total<-0.005} />)}
            <BSRow label="Retained Earnings" value={fmtAcct(totalEquity - vals.filter(x=>x.t==='equity').reduce((s,x)=>s+x.total,0))} isNeg={(totalEquity - vals.filter(x=>x.t==='equity').reduce((s,x)=>s+x.total,0))<-0.005} />
            <BSTotalRow label="Total Equity" value={fmtAcct(totalEquity)} isNeg={totalEquity<-0.005} bold />
            <BSTotalRow label="Total Liabilities and Equity" value={fmtAcct(totalLE)} isNeg={totalLE<-0.005} underline bold />
            <div style={{ height:24 }} />
          </div>
        ) : (
          /* ── Standard two-column layout ── */
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0, padding:'20px 0 0' }}>
            {/* Assets */}
            <div style={{ borderRight:'0.5px solid var(--bd)' }}>
              <StHead>Assets</StHead>
              {useJournals ? (
                <>
                  {bs.assetLines.filter(l=>l.type==='checking'||l.type==='savings'||l.type==='investment'||!l.type).length > 0 && (
                    <>
                      <StHead>Cash & Bank</StHead>
                      {bs.assetLines.filter(l=>l.type==='checking'||l.type==='savings'||l.type==='investment'||!l.type).map(l=>(
                        <StRow key={l.id||l.l} label={l.l||l.name} value={fmt(l.net)} indent valueClass={l.net>=0?'vp':''} />
                      ))}
                    </>
                  )}
                </>
              ) : (
                <>
                  {(liquidAccounts.length>0||liquidTotal!==0)&&(
                    <>
                      <StHead>Cash & Bank</StHead>
                      {liquidAccounts.map(a => <StRow key={a.id} label={a.name} value={fmt(a.balance)} indent valueClass={a.balance>=0?'vp':''} />)}
                      <StTotal label="Total Cash & Bank" value={fmt(liquidTotal)} valueClass={liquidTotal>=0?'vp':''} />
                    </>
                  )}
                </>
              )}
              {investAccounts.length>0&&(
                <>
                  <StHead>Investments</StHead>
                  {investAccounts.map(a=><StRow key={a.id} label={a.name} value={fmt(a.balance)} indent valueClass="vp"/>)}
                  <StTotal label="Total Investments" value={fmt(investTotal)} valueClass="vp"/>
                </>
              )}
              {fixedAssets.length>0&&(
                <>
                  <StHead>Fixed Assets</StHead>
                  {fixedAssets.map(c=><StRow key={c.id} label={c.l} value={fmt(Math.abs(c.total))} indent clickable onClick={()=>setDrill(c)}/>)}
                </>
              )}
              <StGrand label="Total Assets" value={fmt(totalAssets)} />
            </div>
            {/* Liabilities & Equity */}
            <div>
              <StHead>Liabilities & Equity</StHead>
              {bs.liabilityLines.length>0&&(
                <>
                  <StHead>Liabilities</StHead>
                  {bs.liabilityLines.map(l => {
                    const pLine = bsP?.liabilityLines?.find(x=>(x.id||x.l)===(l.id||l.l));
                    return <StRow key={l.id||l.l} label={l.l||l.name}
                      value={fmt(l.net)} valueB={compare!=='none'?fmt(pLine?.net??0):undefined}
                      indent valueClass="vn" />;
                  })}
                  <StTotal label="Total Liabilities" value={fmt(totalLiab)} valueB={compare!=='none'?fmt(bsP?.totalLiabilities??0):undefined} valueClass="vn" />
                </>
              )}
              <StHead>Equity</StHead>
              {bs.equityLines?.map(l => {
                const pLine = bsP?.equityLines?.find(x=>(x.id||x.l)===(l.id||l.l));
                return <StRow key={l.id||l.l} label={l.l||l.name}
                  value={fmtAcct(l.net)} valueB={compare!=='none'?fmtAcct(pLine?.net??0):undefined}
                  indent valueClass={l.net>=0?'vp':'vn'} />;
              })}
              <StRow label="Retained Earnings" value={fmtAcct(totalEquity-(bs.equityLines?.reduce((s,l)=>s+l.net,0)||0))} valueB={compare!=='none'?fmtAcct((bsP?.totalEquity??0)-(bsP?.equityLines?.reduce((s,l)=>s+l.net,0)||0)):undefined} indent valueClass={totalEquity>=0?'vp':'vn'}/>
              <StTotal label="Total Equity" value={fmtAcct(totalEquity)} valueB={compare!=='none'?fmtAcct(bsP?.totalEquity??0):undefined} valueClass={totalEquity>=0?'vp':'vn'}/>
              <StGrand label="Total Liabilities & Equity" value={fmtAcct(totalLE)} valueB={compare!=='none'?fmtAcct(bsP?.totalLE??0):undefined} />
            </div>
          </div>
        )}
        <div style={{ height:24 }} />
      </A4Paper>
      {drill && <DrillPanel cat={drill} txns={txns} dateFrom={dateFrom} dateTo={dateTo} onClose={()=>setDrill(null)} />}
      {drillBS && <DrillPanel cat={drillBS} txns={txns} dateFrom={dateFrom} dateTo={dateTo} onClose={()=>setDrillBS(null)} />}
    </div>
  );
}

// ── Payee Report ──────────────────────────────────────────────────────────────
export function PayeeReport() {
  const { txns, setTxns, catMap, payees, setPayees, org, PALETTE, dateFrom, dateTo, toast } = useApp();
  const [compare,   setCompare]   = useState('none');
  const [editPayee, setEditPayee] = useState(null);    // { id, name, colour } | 'new'
  const [editForm,  setEditForm]  = useState({ name:'', colour:'' });
  const [saving,      setSaving]      = useState(false);
  const [showZeroPay, setShowZeroPay] = useState(false);
  const [payeeSearch, setPayeeSearch] = useState('');
  const [sortCol,     setSortCol]     = useState('total');   // 'name'|'count'|'income'|'expense'|'total'
  const [sortDir,     setSortDir]     = useState('desc');    // 'asc'|'desc'
  function togglePayeeSort(col) {
    if (sortCol === col) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortCol(col); setSortDir(col==='name'?'asc':'desc'); }
  }

  async function deletePayeeById(payeeId, payeeName) {
    if (!window.confirm('Delete "' + payeeName + '"? All transactions will lose this payee.')) return;
    try {
      await deletePayee(payeeId);
      if (setTxns) setTxns(prev => (prev||[]).map(t =>
        t.payee_id === payeeId ? { ...t, payee:'', payee_id:null } : t
      ));
      setPayees(prev => (prev||[]).filter(p => p.id !== payeeId));
      toast('Payee deleted.');
    } catch(e) { toast('Delete failed: ' + e.message); }
  }

  async function savePayee() {
    if (!editForm.name.trim()) return;
    setSaving(true);
    try {
      // upsertPayee is statically imported at top of file
      const col = editForm.colour || (PALETTE||[])[payees.length % (PALETTE||['#888']).length] || '#888';
      const p   = await upsertPayee(org.id, editForm.name.trim(), col);
      setPayees(prev => {
        const exists = prev.find(x=>x.id===p.id);
        return exists ? prev.map(x=>x.id===p.id?p:x) : [...prev, p];
      });
      toast(`Payee "${p.name}" saved.`);
      setEditPayee(null);
    } catch(e) { toast('Error: '+e.message); }
    finally { setSaving(false); }
  }
  // Only count allocated (categorised) transactions - unassigning removes from all reports
  const ft = filterByDateRange(txns, dateFrom, dateTo).filter(t=>!!t.cat);
  const priorDates = getPriorDates(compare, dateFrom, dateTo);
  const ftP = priorDates ? filterByDateRange(txns, priorDates[0], priorDates[1]).filter(t=>!!t.cat) : [];

  // Build a payee→id lookup to normalise payee names from IDs
  const payeeById = Object.fromEntries((payees||[]).map(p=>[p.id, p.name]));
  function buildByPayee(transactions) {
    const m = {};
    transactions.forEach(t => {
      // Resolve payee name: prefer payee_id lookup > t.payee string > '(No payee)'
      const k = (t.payee_id && payeeById[t.payee_id]) || (t.payee||'').trim() || '(No payee)';
      if (!m[k]) m[k] = { total:0, count:0, income:0, expense:0, cats:new Set() };
      m[k].total+=t.amt; m[k].count++;
      if (t.amt>0) m[k].income+=t.amt; else m[k].expense+=Math.abs(t.amt);
      const ctg = catMap[t.cat]; if (ctg) m[k].cats.add(ctg.l);
    });
    return m;
  }

  const byPayee  = buildByPayee(ft);
  const byPayeeP = buildByPayee(ftP);
  const allPayeeNames = new Set([...Object.keys(byPayee), ...(showZeroPay?(payees||[]).map(p=>p.name):[])]);
  const rows = [...allPayeeNames]
    .map(n=>[n,byPayee[n]||{total:0,count:0,income:0,expense:0,cats:new Set()}])
    .filter(([n,v])=>{
      if (!showZeroPay && Math.abs(v.total)<0.005 && v.count===0) return false;
      if (payeeSearch.trim()) return n.toLowerCase().includes(payeeSearch.toLowerCase());
      return true;
    })
    .sort((a,b)=>{
      const [na,va]=[a[0],a[1]], [nb,vb]=[b[0],b[1]];
      let diff = 0;
      if (sortCol==='name')    diff = na.localeCompare(nb);
      else if (sortCol==='count')   diff = va.count - vb.count;
      else if (sortCol==='income')  diff = va.income - vb.income;
      else if (sortCol==='expense') diff = va.expense - vb.expense;
      else                          diff = Math.abs(va.total) - Math.abs(vb.total);
      return sortDir==='asc' ? diff : -diff;
    });
  const totalExp = rows.reduce((s,[,v])=>s+v.expense,0);

  return (
    <div>
      <PeriodBar />
      <div className="metrics">
        <MetricCard label="Unique payees"      value={rows.filter(([k])=>k!=='(No payee)').length} />
        <MetricCard label="Total transactions" value={ft.length} />
        <MetricCard label="Total spent"        value={fmt(totalExp)} valueClass="vn" />
      </div>
      <CompareBar compare={compare} setCompare={setCompare} />
      <div className="card">
        <div className="ch"><h3>Payee summary</h3>
          <div className="ch-r" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input placeholder="Search payees…" value={payeeSearch} onChange={e=>setPayeeSearch(e.target.value)}
              style={{ fontSize:12, padding:'4px 8px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', width:140 }} />
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--stone)', cursor:'pointer', whiteSpace:'nowrap' }}><input type="checkbox" checked={showZeroPay} onChange={e=>setShowZeroPay(e.target.checked)} />Zero bal</label>
            <button className="btn btn-a btn-sm" onClick={()=>{ setEditForm({ name:'', colour:(PALETTE||[])[payees.length%(PALETTE||['#888']).length]||'#888' }); setEditPayee('new'); }}>+ Add payee</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              {[['name','Payee',false],['count','Txns',true],['income','Income',true],['expense','Spent',true],['total','Net',true]].map(([col,label,right])=>(
                <th key={col} className={right?'tr':undefined}
                  onClick={()=>togglePayeeSort(col)}
                  style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
                  {label}
                  <span style={{ marginLeft:3, fontSize:9, opacity:sortCol===col?0.9:0.25 }}>
                    {sortCol===col?(sortDir==='asc'?'▲':'▼'):'⇅'}
                  </span>
                </th>
              ))}
              {compare!=='none'&&<th className="tr">Prior net</th>}
              {compare!=='none'&&<th className="tr">Variance</th>}
              <th>Categories</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length===0&&<tr><td colSpan={8} style={{ textAlign:'center', padding:24, color:'var(--stone)' }}>No transactions in range.</td></tr>}
            {rows.map(([name,v], ri)=>{
              const prior = byPayeeP[name];
              const variance = prior ? v.total - prior.total : null;
              const p = name!=='(No payee)' ? payees.find(px=>px.name===name) : null;
              return (
                <tr key={name} style={{ borderBottom:'0.5px solid var(--bd)' }}>
                  <td><div style={{ display:'flex', alignItems:'center', gap:7 }}>
                    {name!=='(No payee)'&&<PayeeAvatar name={name} payeesList={payees} size="sm"/>}
                    <span style={{ fontWeight:500 }}>{name}</span>
                  </div></td>
                  <td className="tr">{v.count}</td>
                  <td className="tr vp">{v.income>0?fmt(v.income):'—'}</td>
                  <td className="tr vn">{v.expense>0?fmt(v.expense):'—'}</td>
                  <td className={`tr ${v.total>=0?'vp':'vn'}`}>{fmtSigned(v.total)}</td>
                  {compare!=='none'&&<td className="tr" style={{ color:'var(--stone)' }}>{prior?fmtSigned(prior.total):'—'}</td>}
                  {compare!=='none'&&<td className={`tr ${variance===null?'':(variance>=0?'vp':'vn')}`}>{variance!==null?fmtSigned(variance):'—'}</td>}
                  <td style={{ fontSize:11, color:'var(--stone)' }}>{[...v.cats].join(', ')||'—'}</td>
                  <td>
                    {p && (
                      <button className="btn btn-sm" style={{ fontSize:10 }} onClick={()=>{ setEditForm({ name:p.name, colour:p.colour||p.col||'#888' }); setEditPayee(p); }}>Edit</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Edit / New Payee Modal ── */}
      {editPayee && (
        <div className="modal-bg" onClick={() => setEditPayee(null)}>
          <div className="modal" style={{ width:380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editPayee === 'new' ? 'New payee' : `Edit "${editPayee.name}"`}</h3>
              <button className="btn-ghost" style={{ padding:0, fontSize:16 }} onClick={() => setEditPayee(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Name</label>
                <input autoFocus type="text" value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Coles" />
              </div>
              <div className="field">
                <label>Colour</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, paddingTop:4 }}>
                  {(PALETTE||[]).map(col => (
                    <span key={col} onClick={() => setEditForm(f => ({ ...f, colour: col }))}
                      style={{ width:22, height:22, borderRadius:'50%', background:col, cursor:'pointer',
                        border: editForm.colour === col ? '2.5px solid var(--ink)' : '2px solid transparent' }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-foot" style={{ justifyContent:'space-between' }}>
              <div>
                {editPayee !== 'new' && (
                  <button className="btn btn-sm" style={{ color:'var(--rd)' }}
                    onClick={()=>{ if(editPayee?.id) deletePayeeById(editPayee.id, editPayee.name); }}>
                    Delete payee
                  </button>
                )}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn" onClick={() => setEditPayee(null)}>Cancel</button>
                <button className="btn btn-a" disabled={saving || !editForm.name.trim()} onClick={savePayee}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
