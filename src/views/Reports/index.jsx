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
import { fmt, fmtSigned, filterByDateRange, buildAccountTotals, buildTBFromJournals, isTBBalanced, payeeColor, dateRangeLabel } from '../../utils/helpers';

// ── A4 paper wrapper ──────────────────────────────────────────────────────────
function A4Paper({ title, subtitle, children }) {
  const { org } = useApp();
  const today = new Date().toLocaleDateString('en-AU', { day:'2-digit', month:'long', year:'numeric' });
  return (
    <div style={{ maxWidth:760, margin:'0 auto', background:'#fff', border:'0.5px solid var(--bd2)', borderRadius:4, boxShadow:'0 2px 12px rgba(42,36,32,0.10)', fontFamily:'var(--font-sans)', overflow:'hidden' }}>
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
function StRow({ label, value, valueB, indent=false, valueClass='', onClick, clickable=false }) {
  return (
    <div onClick={onClick}
      style={{ display:'flex', justifyContent:'space-between', padding:`5px ${indent?'48px':'32px'} 5px ${indent?'48px':'32px'}`, borderBottom:'0.5px solid var(--bd)', fontSize:12.5, cursor:clickable?'pointer':'default', alignItems:'center' }}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.background='var(--sand)'; }}
      onMouseLeave={e => { if (clickable) e.currentTarget.style.background=''; }}
    >
      <span style={{ color:indent?'var(--stone2)':'var(--ink)', display:'flex', alignItems:'center', gap:6 }}>
        {label}
        {clickable && <span style={{ fontSize:10, color:'var(--stone)', opacity:0.6 }}>↗</span>}
      </span>
      <div style={{ display:'flex', gap:32, flexShrink:0 }}>
        {valueB !== undefined && <span style={{ fontVariantNumeric:'tabular-nums', color:'var(--stone)', minWidth:90, textAlign:'right', fontSize:12 }}>{valueB}</span>}
        <span className={valueClass} style={{ fontVariantNumeric:'tabular-nums', minWidth:90, textAlign:'right' }}>{value}</span>
      </div>
    </div>
  );
}
function StTotal({ label, value, valueB, valueClass='' }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 32px', fontWeight:500, fontSize:12.5, borderTop:'0.5px solid var(--bd2)', background:'var(--sand)', alignItems:'center' }}>
      <span>{label}</span>
      <div style={{ display:'flex', gap:32, flexShrink:0 }}>
        {valueB !== undefined && <span style={{ fontVariantNumeric:'tabular-nums', color:'var(--stone)', minWidth:90, textAlign:'right', fontSize:12 }}>{valueB}</span>}
        <span className={valueClass} style={{ fontVariantNumeric:'tabular-nums', minWidth:90, textAlign:'right' }}>{value}</span>
      </div>
    </div>
  );
}
function StGrand({ label, value, valueClass='' }) {
  return <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 32px', fontWeight:600, fontSize:13.5, background:'var(--al)', borderTop:'1.5px solid var(--a)' }}>
    <span>{label}</span>
    <span className={valueClass} style={{ fontVariantNumeric:'tabular-nums' }}>{value}</span>
  </div>;
}

// ── Comparison column headers ─────────────────────────────────────────────────
function CompareHeader({ labelA, labelB }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end', padding:'4px 32px', gap:32, borderBottom:'0.5px solid var(--bd)', background:'var(--sand)' }}>
      <span style={{ fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', minWidth:90, textAlign:'right' }}>{labelB} (prior)</span>
      <span style={{ fontSize:10, fontWeight:600, color:'var(--ink)',   textTransform:'uppercase', letterSpacing:'0.05em', minWidth:90, textAlign:'right' }}>{labelA} (current)</span>
    </div>
  );
}

// ── Drill-through side panel ──────────────────────────────────────────────────
function DrillPanel({ cat, txns, dateFrom, dateTo, onClose }) {
  if (!cat) return null;
  const catTxns = filterByDateRange(txns, dateFrom, dateTo)
    .filter(t => t.cat === cat.id)
    .sort((a,b) => b.date.localeCompare(a.date));
  const total = catTxns.reduce((s,t) => s + t.amt, 0);

  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:480, background:'#FDFAF6', boxShadow:'-4px 0 24px rgba(42,36,32,0.15)', zIndex:800, display:'flex', flexDirection:'column', borderLeft:'0.5px solid var(--bd2)' }}>
      {/* Header */}
      <div style={{ padding:'14px 18px', borderBottom:'0.5px solid var(--bd)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ width:10, height:10, borderRadius:'50%', background:cat.col, flexShrink:0, display:'inline-block' }} />
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:500, fontSize:14 }}>{cat.l}</div>
          <div style={{ fontSize:11, color:'var(--stone)', marginTop:1 }}>{cat.ac} · {cat.t} · {dateRangeLabel(dateFrom, dateTo)}</div>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--stone)', lineHeight:1, padding:0 }}>×</button>
      </div>

      {/* Stats bar */}
      <div style={{ padding:'10px 18px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)', display:'flex', gap:20, flexShrink:0 }}>
        <div>
          <div style={{ fontSize:10, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:500 }}>Transactions</div>
          <div style={{ fontSize:16, fontWeight:500 }}>{catTxns.length}</div>
        </div>
        <div>
          <div style={{ fontSize:10, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:500 }}>Total</div>
          <div style={{ fontSize:16, fontWeight:500 }} className={total>=0?'vp':'vn'}>{total>=0?'+':''}{fmt(total)}</div>
        </div>
        <div>
          <div style={{ fontSize:10, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:500 }}>Average</div>
          <div style={{ fontSize:16, fontWeight:500 }}>{catTxns.length > 0 ? fmt(Math.abs(total/catTxns.length)) : '—'}</div>
        </div>
      </div>

      {/* Transaction list */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {catTxns.length === 0 ? (
          <div style={{ padding:24, textAlign:'center', color:'var(--stone)', fontSize:12 }}>No transactions in current date range.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--sand)', position:'sticky', top:0 }}>
                <th style={{ padding:'7px 18px', fontSize:11, fontWeight:500, color:'var(--stone)', textAlign:'left', textTransform:'uppercase', letterSpacing:'0.04em' }}>Date</th>
                <th style={{ padding:'7px 10px', fontSize:11, fontWeight:500, color:'var(--stone)', textAlign:'left', textTransform:'uppercase', letterSpacing:'0.04em' }}>Description</th>
                <th style={{ padding:'7px 18px', fontSize:11, fontWeight:500, color:'var(--stone)', textAlign:'right', textTransform:'uppercase', letterSpacing:'0.04em' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {catTxns.map(t => (
                <tr key={t.id} style={{ borderBottom:'0.5px solid var(--bd)' }}>
                  <td style={{ padding:'8px 18px', fontSize:12, color:'var(--stone)', whiteSpace:'nowrap' }}>{t.date}</td>
                  <td style={{ padding:'8px 10px', fontSize:12 }}>
                    <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>{t.desc}</div>
                    {t.payee && <div style={{ fontSize:11, color:'var(--stone)' }}>{t.payee}</div>}
                  </td>
                  <td style={{ padding:'8px 18px', fontSize:12, textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:500 }} className={t.amt>=0?'vp':'vn'}>
                    {t.amt>=0?'+':''}{fmt(t.amt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
  const [mode,    setMode]    = useState('journals'); // 'journals' | 'transactions'

  const priorDates  = getPriorDates(compare, dateFrom, dateTo);
  const accountMap  = Object.fromEntries((accounts||[]).map(a=>[a.id,a]));
  const hasJournals = (journals||[]).some(j => (j.journal_lines||j.lines||[]).length > 0);

  // Journal-based (double-entry) — primary
  const accts  = buildTBFromJournals(journals||[], dateFrom, dateTo, catMap, accountMap);
  const acctsp = priorDates ? buildTBFromJournals(journals||[], priorDates[0], priorDates[1], catMap, accountMap) : [];
  const balanced = isTBBalanced(accts);

  // Transaction-based legacy fallback data
  const ft          = filterByDateRange(txns, dateFrom, dateTo);
  const ftP         = priorDates ? filterByDateRange(txns, priorDates[0], priorDates[1]) : [];
  const priorLabel  = priorDates ? dateRangeLabel(priorDates[0], priorDates[1]) : '';
  const legacyAccts = buildAccountTotals(ft, catMap);

  // Pick source based on mode
  const useJournals   = mode === 'journals' && hasJournals;
  const displayAccts  = useJournals ? accts     : legacyAccts;
  const displayAcctsP = useJournals ? acctsp    : (priorDates ? buildAccountTotals(ftP, catMap) : []);
  const priorByKey    = Object.fromEntries(displayAcctsP.map(a => [a.ac || a.label, a]));

  const totalDR = displayAccts.reduce((s,a)=>s+(a.dr||0),0);
  const totalCR = displayAccts.reduce((s,a)=>s+(a.cr||0),0);

  return (
    <div>
      <PeriodBar />

      {/* Mode toggle + balanced badge */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}>
        {hasJournals ? (
          <>
            <div style={{ display:'flex', borderRadius:'var(--rr)', border:'0.5px solid var(--bd2)', overflow:'hidden' }}>
              {[['journals','Double-entry ledger'],['transactions','Transactions (legacy)']].map(([m,l])=>(
                <button key={m} onClick={()=>setMode(m)}
                  style={{ padding:'5px 12px', fontSize:11.5, border:'none', cursor:'pointer', fontFamily:'var(--font-sans)',
                    background:mode===m?'var(--a)':'#FDFAF6', color:mode===m?'#fff':'var(--stone)', fontWeight:mode===m?500:400 }}>
                  {l}
                </button>
              ))}
            </div>
            {useJournals && (
              <span style={{ fontSize:11, padding:'3px 10px', borderRadius:99, fontWeight:600,
                background: balanced ? 'var(--gnb)' : 'var(--rdb)',
                color:      balanced ? 'var(--gn)'  : 'var(--rd)' }}>
                {balanced ? '✓ Balanced — DR = CR' : `⚠ Imbalanced by ${fmt(Math.abs(totalDR - totalCR))}`}
              </span>
            )}
          </>
        ) : (
          <div style={{ fontSize:12, color:'var(--stone)', padding:'6px 10px', background:'var(--al)', borderRadius:'var(--rr)', border:'0.5px solid var(--bd)' }}>
            💡 Assign categories to transactions to generate double-entry journals. The trial balance will then truly balance (DR = CR).
          </div>
        )}
      </div>

      <CompareBar compare={compare} setCompare={setCompare} />
      <BalanceAlert balanced={balanced} okText="Trial balance is balanced." warnText="Trial balance out of balance." />
      <A4Paper title="Trial Balance" subtitle={dateRangeLabel(dateFrom, dateTo)}>
        <div style={{ padding:'20px 0 0' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 120px', padding:'6px 32px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd2)' }}>
            {['Account','Debit ($)','Credit ($)'].map((h,i) => (
              <span key={h} style={{ fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:i>0?'right':'left' }}>{h}</span>
            ))}
          </div>
          {accts.length === 0 && <div style={{ padding:'24px 32px', color:'var(--stone)', fontSize:12 }}>No allocated transactions in range.</div>}
          {accts.map(a => {
            // Find matching category for drill-through
            const matchedCat = Object.values(catMap).find(c => c.ac === a.ac || c.l === a.ac);
            return (
              <div key={a.ac}
                style={{ display:'grid', gridTemplateColumns:'1fr 120px 120px', padding:'7px 32px', borderBottom:'0.5px solid var(--bd)', fontSize:12.5, cursor:matchedCat?'pointer':'default' }}
                onClick={() => matchedCat && setDrill(matchedCat)}
                onMouseEnter={e => { if(matchedCat) e.currentTarget.style.background='var(--sand)'; }}
                onMouseLeave={e => { e.currentTarget.style.background=''; }}
              >
                <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                  {a.ac}
                  <span style={{ fontSize:10, color:'var(--stone)', marginLeft:4 }}>{a.t}</span>
                  {matchedCat && <span style={{ fontSize:10, color:'var(--stone)', opacity:0.5 }}>↗</span>}
                </span>
                <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{a.dr>0?fmt(a.dr):'—'}</span>
                <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{a.cr>0?fmt(a.cr):'—'}</span>
              </div>
            );
          })}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 120px', padding:'8px 32px', background:'var(--sand)', borderTop:'1.5px solid var(--ink)', fontWeight:600, fontSize:12.5 }}>
            <span>Total</span>
            <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:(useJournals?balanced:true)?'var(--ink)':'var(--rd)' }}>{fmt(totalDR)}</span>
            <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:(useJournals?balanced:true)?'var(--ink)':'var(--rd)' }}>{fmt(totalCR)}</span>
          </div>
          <div style={{ height:24 }} />
        </div>
      </A4Paper>
      {drill && <DrillPanel cat={drill} txns={txns} dateFrom={dateFrom} dateTo={dateTo} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ── Profit & Loss ─────────────────────────────────────────────────────────────
export function ProfitAndLoss() {
  const { txns, catMap, dateFrom, dateTo } = useApp();
  const [drill,   setDrill]   = useState(null);
  const [compare, setCompare] = useState('none');

  const ft  = filterByDateRange(txns, dateFrom, dateTo);
  const priorDates = getPriorDates(compare, dateFrom, dateTo);
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

  const incomeLines  = Object.values(byCat).filter(c => c.t==='income');
  const expenseLines = Object.values(byCat).filter(c => c.t==='expense');
  const totalIncome  = incomeLines.reduce((s,c) => s+c.total, 0);
  const totalExpense = expenseLines.reduce((s,c) => s+c.total, 0);
  const netProfit    = totalIncome + totalExpense;

  const totalIncomeP  = Object.values(byCatP).filter(c=>c.t==='income').reduce((s,c)=>s+c.total,0);
  const totalExpenseP = Object.values(byCatP).filter(c=>c.t==='expense').reduce((s,c)=>s+c.total,0);
  const netProfitP    = totalIncomeP + totalExpenseP;

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
      <CompareBar compare={compare} setCompare={setCompare} />
      <A4Paper title="Profit & Loss" subtitle={dateRangeLabel(dateFrom, dateTo)}>
        <div style={{ padding:'20px 0 0' }}>
          {compare!=='none' && <CompareHeader labelA={dateRangeLabel(dateFrom,dateTo)} labelB={priorLabel} />}

          <StHead>Income</StHead>
          {incomeLines.length===0 && <StRow label="No income in period" value="" indent />}
          {incomeLines.map(c => (
            <StRow key={c.id} label={c.l} value={fmt(c.total)}
              valueB={compare!=='none' ? (byCatP[c.id]?fmt(byCatP[c.id].total):'—') : undefined}
              indent clickable onClick={() => setDrill(c)} valueClass="vp" />
          ))}
          <StTotal label="Total Income" value={fmt(totalIncome)} valueB={compare!=='none'?fmt(totalIncomeP):undefined} valueClass="vp" />

          <div style={{ height:8 }} />
          <StHead>Expenses</StHead>
          {expenseLines.length===0 && <StRow label="No expenses in period" value="" indent />}
          {expenseLines.map(c => (
            <StRow key={c.id} label={c.l} value={fmt(Math.abs(c.total))}
              valueB={compare!=='none' ? (byCatP[c.id]?fmt(Math.abs(byCatP[c.id].total)):'—') : undefined}
              indent clickable onClick={() => setDrill(c)} valueClass="vn" />
          ))}
          <StTotal label="Total Expenses" value={fmt(Math.abs(totalExpense))} valueB={compare!=='none'?fmt(Math.abs(totalExpenseP)):undefined} valueClass="vn" />

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

// ── Balance Sheet ─────────────────────────────────────────────────────────────
export function BalanceSheet() {
  const { txns, catMap, dateFrom, dateTo, accounts } = useApp();
  const [showZero, setShowZero] = useState(false);
  const [drill,    setDrill]    = useState(null);
  const [compare,  setCompare]  = useState('none');

  const ft = filterByDateRange(txns, dateFrom, dateTo);
  const priorDates = getPriorDates(compare, dateFrom, dateTo);
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
  const totalAssets    = liquidTotal + investTotal + fixedAssets.reduce((s,c)=>s+Math.abs(c.total),0);

  const ccAccounts = bankAccounts.filter(a => (a.type==='credit_card'||a.type==='loan') && (showZero||Math.abs(a.balance)>0.005));
  const ccTotal    = bankAccounts.filter(a=>a.type==='credit_card'||a.type==='loan').reduce((s,a)=>s+Math.abs(a.balance),0);
  const catLiabilities = vals.filter(c=>c.t==='liability');
  const totalLiab  = ccTotal + catLiabilities.reduce((s,c)=>s+Math.abs(c.total),0);
  const totalEquity = totalAssets - totalLiab;
  const totalLE    = totalLiab + totalEquity;

  // Prior period for comparison
  const valsMapP   = {};
  valsP.forEach(c => { valsMapP[c.id] = c; });

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
      <A4Paper title="Balance Sheet" subtitle={dateRangeLabel(dateFrom, dateTo)}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0, padding:'20px 0 0' }}>
          {/* Assets */}
          <div style={{ borderRight:'0.5px solid var(--bd)' }}>
            <StHead>Assets</StHead>
            {(liquidAccounts.length>0||liquidTotal!==0)&&(
              <>
                <StHead>Cash & Bank</StHead>
                {liquidAccounts.map(a => <StRow key={a.id} label={a.name} value={fmt(a.balance)} indent valueClass={a.balance>=0?'vp':''} />)}
                <StTotal label="Total Cash & Bank" value={fmt(liquidTotal)} valueClass={liquidTotal>=0?'vp':''} />
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
            {(ccAccounts.length>0||catLiabilities.length>0)&&(
              <>
                {ccAccounts.length>0&&<StHead>Credit Cards & Loans</StHead>}
                {ccAccounts.map(a=><StRow key={a.id} label={`${a.name}${a.credit_limit?` (limit ${fmt(a.credit_limit)})`:''}`} value={fmt(Math.abs(a.balance))} indent valueClass="vn"/>)}
                {catLiabilities.length>0&&<StHead>Other Liabilities</StHead>}
                {catLiabilities.map(c=><StRow key={c.id} label={c.l} value={fmt(Math.abs(c.total))} indent valueClass="vn" clickable onClick={()=>setDrill(c)}/>)}
                <StTotal label="Total Liabilities" value={fmt(totalLiab)} valueClass="vn"/>
              </>
            )}
            <StHead>Equity</StHead>
            {vals.filter(c=>c.t==='equity').map(c=><StRow key={c.id} label={c.l} value={fmt(c.total)} indent/>)}
            <StRow label="Net retained earnings" value={fmt(totalEquity-(vals.filter(c=>c.t==='equity').reduce((s,c)=>s+c.total,0)))} indent valueClass={totalEquity>=0?'vp':'vn'}/>
            <StTotal label="Total Equity" value={fmt(totalEquity)} valueClass={totalEquity>=0?'vp':'vn'}/>
            <StGrand label="Total Liabilities & Equity" value={fmt(totalLE)} />
          </div>
        </div>
        <div style={{ height:24 }} />
      </A4Paper>
      {drill && <DrillPanel cat={drill} txns={txns} dateFrom={dateFrom} dateTo={dateTo} onClose={()=>setDrill(null)} />}
    </div>
  );
}

// ── Payee Report ──────────────────────────────────────────────────────────────
export function PayeeReport() {
  const { txns, catMap, payees, dateFrom, dateTo } = useApp();
  const [compare, setCompare] = useState('none');
  const ft = filterByDateRange(txns, dateFrom, dateTo);
  const priorDates = getPriorDates(compare, dateFrom, dateTo);
  const ftP = priorDates ? filterByDateRange(txns, priorDates[0], priorDates[1]) : [];

  function buildByPayee(transactions) {
    const m = {};
    transactions.forEach(t => {
      const k = t.payee || '(No payee)';
      if (!m[k]) m[k] = { total:0, count:0, income:0, expense:0, cats:new Set() };
      m[k].total+=t.amt; m[k].count++;
      if (t.amt>0) m[k].income+=t.amt; else m[k].expense+=Math.abs(t.amt);
      const c = catMap[t.cat]; if (c) m[k].cats.add(c.l);
    });
    return m;
  }

  const byPayee  = buildByPayee(ft);
  const byPayeeP = buildByPayee(ftP);
  const rows     = Object.entries(byPayee).sort((a,b)=>Math.abs(b[1].total)-Math.abs(a[1].total));
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
        <div className="ch"><h3>Payee summary</h3></div>
        <table>
          <thead>
            <tr>
              <th>Payee</th>
              <th className="tr">Txns</th>
              <th className="tr">Income</th>
              <th className="tr">Spent</th>
              <th className="tr">Net</th>
              {compare!=='none'&&<th className="tr">Prior net</th>}
              {compare!=='none'&&<th className="tr">Variance</th>}
              <th>Categories</th>
            </tr>
          </thead>
          <tbody>
            {rows.length===0&&<tr><td colSpan={8} style={{ textAlign:'center', padding:24, color:'var(--stone)' }}>No transactions in range.</td></tr>}
            {rows.map(([name,v])=>{
              const prior = byPayeeP[name];
              const variance = prior ? v.total - prior.total : null;
              return (
                <tr key={name}>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
