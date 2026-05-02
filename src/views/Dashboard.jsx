/**
 * views/Dashboard.jsx
 * -------------------
 * Home screen with:
 *   - KPI cards (income, expenses, net, needs review)
 *   - Cash flow projection panel (W/M/Q/Y based on actuals)
 *   - Runway calculator (assets vs recurring spend)
 *   - Recent transactions
 *   - Top payees & categories
 *   - Quick actions
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { MetricCard, PayeeAvatar } from '../components/ui/index';
import { fmt, filterByDateRange, payeeColor, runAutoCatRules, currentFYStart } from '../utils/helpers';

// ── Cash flow projection engine ───────────────────────────────────────────────

function buildProjections(txns, catMap, accounts = []) {
  const now    = new Date();
  const fyStart = currentFYStart();
  const fyFrom  = `${fyStart}-07-01`;
  const fyTo    = `${fyStart + 1}-06-30`;
  const fyTxns  = filterByDateRange(txns || [], fyFrom, fyTo);

  // Detect recurring transactions: same payee/description appearing ≥2 times per month
  const monthGroups = {};
  fyTxns.forEach(t => {
    const mo  = t.date.slice(0, 7); // YYYY-MM
    const key = (t.payee || t.desc).toLowerCase().slice(0, 30);
    if (!monthGroups[key]) monthGroups[key] = { months: new Set(), total: 0, count: 0, amt: t.amt, desc: t.desc, payee: t.payee, cat: t.cat };
    monthGroups[key].months.add(mo);
    monthGroups[key].total += t.amt;
    monthGroups[key].count++;
  });

  const recurring = Object.values(monthGroups).filter(g => g.months.size >= 2);
  const monthlyRecurringCost = recurring.filter(g => g.amt < 0).reduce((s, g) => s + Math.abs(g.total / g.months.size), 0);

  // Period averages
  const periods = { W: 7, M: 30, Q: 91, Y: 365 };
  const projections = {};

  Object.entries(periods).forEach(([label, days]) => {
    const from = new Date(now - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to   = now.toISOString().slice(0, 10);
    const period = filterByDateRange(txns, from, to);

    const income   = period.filter(t => t.amt > 0 && (catMap||{})[t.cat]?.t === 'income').reduce((s, t) => s + t.amt, 0);
    const expenses = period.filter(t => t.amt < 0).reduce((s, t) => s + t.amt, 0);
    const net      = income + expenses;

    // Project forward: annualise then scale to 12 months
    const scale    = 365 / days;
    const projIncome   = income   * scale / 12;  // monthly equivalent
    const projExpenses = Math.abs(expenses) * scale / 12;
    const projNet      = projIncome - projExpenses;

    projections[label] = { income, expenses: Math.abs(expenses), net, projIncome, projExpenses, projNet, label, days };
  });

  // Total liquid assets (checking + savings accounts balance)
  const liquidAssets = (accounts || [])
    .filter(a => a.type === 'checking' || a.type === 'savings')
    .reduce((s, a) => {
      const acctTxns = txns.filter(t => t.account_id === a.id);
      const balance  = (a.opening_balance || 0) + acctTxns.reduce((bs, t) => bs + (t.amt ?? 0), 0);
      return s + balance;
    }, 0);

  // Runway: liquid assets ÷ average monthly expenditure
  // Only uses actual cash/savings — not investment or CC
  const monthlyExpenses = projections['M']?.projExpenses ?? 0;
  const runwayMonths = monthlyExpenses <= 0 ? Infinity : liquidAssets / monthlyExpenses;

  return { projections, recurring, monthlyRecurringCost, liquidAssets, runwayMonths };
}

// ── Cashflow chart (simple SVG bar chart) ─────────────────────────────────────

function CashflowBars({ txns, catMap }) {
  // Last 6 months of net cashflow
  const bars = useMemo(() => {
    const result = [];
    const now    = new Date();
    for (let i = 5; i >= 0; i--) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const from  = d.toISOString().slice(0, 10);
      const to    = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
      const mo    = filterByDateRange(txns, from, to);
      const inc   = mo.filter(t => t.amt > 0 && (catMap||{})[t.cat]?.t === 'income').reduce((s, t) => s + t.amt, 0);
      const exp   = Math.abs(mo.filter(t => t.amt < 0).reduce((s, t) => s + t.amt, 0));
      const label = d.toLocaleString('default', { month:'short' });
      result.push({ label, income: inc, expenses: exp, net: inc - exp });
    }
    return result;
  }, [txns, catMap]);

  const maxVal = Math.max(...bars.flatMap(b => [b.income, b.expenses]), 1);
  const barH   = 60;

  return (
    <div style={{ display:'flex', gap:6, alignItems:'flex-end', height: barH + 28, padding:'0 4px' }}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
          <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end', height:barH }}>
            {/* Income bar */}
            <div style={{
              flex:1, borderRadius:'2px 2px 0 0',
              height: `${(b.income / maxVal) * barH}px`,
              background:'#3B6D11', minHeight: b.income > 0 ? 2 : 0,
            }} />
            {/* Expense bar */}
            <div style={{
              flex:1, borderRadius:'2px 2px 0 0',
              height: `${(b.expenses / maxVal) * barH}px`,
              background: b.expenses > b.income ? '#A32D2D' : '#BA7517',
              minHeight: b.expenses > 0 ? 2 : 0,
            }} />
          </div>
          <span style={{ fontSize:10, color:'var(--stone)', whiteSpace:'nowrap' }}>{b.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Runway meter ──────────────────────────────────────────────────────────────

function RunwayMeter({ months, liquidAssets, monthlyExpenses }) {
  if (liquidAssets <= 0 || monthlyExpenses <= 0) {
    return (
      <div style={{ padding:'8px 0' }}>
        <div style={{ fontSize:12, color:'var(--stone)', marginBottom:6 }}>Runway on current spend</div>
        <div style={{ padding:'10px 12px', background:'var(--sand2)', borderRadius:'var(--rr)', fontSize:12, color:'var(--stone)' }}>
          {liquidAssets <= 0
            ? 'No liquid assets linked. Add bank accounts and link transactions via import.'
            : 'No expenses recorded in the last 30 days.'}
        </div>
      </div>
    );
  }
  if (!isFinite(months)) {
    return (
      <div style={{ textAlign:'center', padding:'8px 0' }}>
        <div style={{ fontSize:28, fontWeight:600, color:'var(--gn)' }}>∞</div>
        <div style={{ fontSize:11, color:'var(--stone)', marginTop:2 }}>Income covers expenses</div>
      </div>
    );
  }

  const pct    = Math.min(100, (months / 24) * 100);
  const color  = months < 3 ? '#A32D2D' : months < 6 ? '#BA7517' : '#3B6D11';
  const label  = months < 1 ? `${Math.round(months * 30)} days`
               : months < 12 ? `${months.toFixed(1)} months`
               : `${(months / 12).toFixed(1)} years`;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12 }}>
        <span style={{ color:'var(--stone)' }}>Runway on current spend</span>
        <span style={{ fontWeight:600, color }}>{label}</span>
      </div>
      <div style={{ height:8, background:'var(--sand3)', borderRadius:4 }}>
        <div style={{ height:8, borderRadius:4, background:color, width:`${pct}%`, transition:'width 0.5s' }} />
      </div>
      <div style={{ fontSize:11, color:'var(--stone)', marginTop:4 }}>
        Liquid assets: <strong>{fmt(liquidAssets)}</strong>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function Dashboard({ onNavigate }) {
  const { txns: _txns, catMap, rules: _rules, payees: _payees, accounts: _accounts, dateFrom, dateTo } = useApp();
  // Safe defaults — context values start as undefined during first render
  const txns    = _txns    || [];
  const rules   = _rules   || [];
  const payees  = _payees  || [];
  const accounts = _accounts || [];
  const [projPeriod, setProjPeriod] = useState('M');  // W | M | Q | Y

  const ft = filterByDateRange(txns, dateFrom, dateTo);

  // KPIs
  const totalIncome   = ft.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0);
  const totalExpenses = ft.filter(t => t.amt < 0).reduce((s, t) => s + t.amt, 0);
  const netPosition   = totalIncome + totalExpenses;
  const unallocated   = ft.filter(t => !t.cat).length;
  const suggestions   = runAutoCatRules(txns || [], rules || []).length;
  const needsReview   = unallocated + suggestions;

  // Projections
  const { projections, recurring, monthlyRecurringCost, liquidAssets, runwayMonths } = useMemo(
    () => buildProjections(txns, catMap || {}, accounts),
    [txns, catMap, accounts]
  );
  const proj = projections[projPeriod];

  // Recent transactions
  const recent = [...ft].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  // Top payees
  const byPayee = {};
  ft.forEach(t => {
    if (!t.payee) return;
    if (!byPayee[t.payee]) byPayee[t.payee] = { total:0 };
    byPayee[t.payee].total += t.amt;
  });
  const topPayees = Object.entries(byPayee).sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total)).slice(0, 4);
  const maxPayee  = topPayees[0] ? Math.abs(topPayees[0][1].total) : 1;

  // Top categories
  const byCat = {};
  ft.forEach(t => {
    const c = catMap[t.cat];
    if (!c || c.t !== 'expense') return;
    if (!byCat[c.l]) byCat[c.l] = { total:0, col:c.col };
    byCat[c.l].total += Math.abs(t.amt);
  });
  const topCats = Object.entries(byCat).sort((a, b) => b[1].total - a[1].total).slice(0, 4);
  const maxCat  = topCats[0]?.[1].total || 1;

  return (
    <div>
      {/* KPI row */}
      <div className="metrics">
        <MetricCard label="Income"       value={fmt(totalIncome)}           valueClass="vp" sub={`${ft.filter(t=>t.amt>0).length} entries`} />
        <MetricCard label="Expenses"     value={fmt(Math.abs(totalExpenses))} valueClass="vn" sub={`${ft.filter(t=>t.amt<0).length} entries`} />
        <MetricCard label="Net position" value={fmt(netPosition)}           valueClass={netPosition>=0?'vp':'vn'} sub={netPosition>=0?'Surplus':'Deficit'} />
        <MetricCard label="Needs review" value={needsReview} valueClass="va"
          sub={`${suggestions} suggestions · ${unallocated} unallocated`}
          onClick={() => onNavigate('approve')} />
      </div>

      {/* ── Cashflow & runway row ── */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,3fr) minmax(0,2fr)', gap:12, marginBottom:12 }}>

        {/* Cashflow projection card */}
        <div className="card">
          <div className="ch">
            <h3>Cash flow</h3>
            <div style={{ display:'flex', gap:4, marginLeft:'auto' }}>
              {['W','M','Q','Y'].map(p => (
                <button key={p} onClick={() => setProjPeriod(p)} style={{
                  padding:'3px 9px', fontSize:11, border:'0.5px solid var(--bd2)',
                  borderRadius:'var(--rr)', cursor:'pointer', fontFamily:'var(--font-sans)',
                  background: projPeriod===p ? 'var(--al)' : 'transparent',
                  color:      projPeriod===p ? 'var(--a2)' : 'var(--stone)',
                  fontWeight: projPeriod===p ? 500 : 400,
                }}>
                  {p === 'W' ? '7d' : p === 'M' ? '30d' : p === 'Q' ? '90d' : '1y'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding:'12px 14px' }}>
            {/* Bar chart */}
            <CashflowBars txns={txns} catMap={catMap} />

            {/* Legend */}
            <div style={{ display:'flex', gap:14, marginTop:6, marginBottom:12 }}>
              <span style={{ fontSize:11, color:'var(--stone)', display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ width:10, height:10, borderRadius:2, background:'#3B6D11', display:'inline-block' }} /> Income
              </span>
              <span style={{ fontSize:11, color:'var(--stone)', display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ width:10, height:10, borderRadius:2, background:'#BA7517', display:'inline-block' }} /> Expenses
              </span>
            </div>

            {/* Period stats */}
            {proj && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                {[
                  { label: 'Income', value: fmt(proj.income), cls: 'vp' },
                  { label: 'Expenses', value: fmt(proj.expenses), cls: 'vn' },
                  { label: 'Net', value: (proj.net>=0?'+':'')+fmt(proj.net), cls: proj.net>=0?'vp':'vn' },
                ].map(m => (
                  <div key={m.label} style={{ background:'var(--sand)', borderRadius:'var(--rr)', padding:'8px 10px' }}>
                    <div style={{ fontSize:10, color:'var(--stone)', fontWeight:500, marginBottom:2 }}>{m.label}</div>
                    <div style={{ fontSize:14, fontWeight:500 }} className={m.cls}>{m.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Monthly projection */}
            {proj && (
              <div style={{ marginTop:10, padding:'8px 10px', background:'var(--sand)', borderRadius:'var(--rr)', fontSize:12 }}>
                <span style={{ color:'var(--stone)' }}>Projected monthly: </span>
                <span style={{ fontWeight:500 }} className={proj.projNet>=0?'vp':'vn'}>
                  {proj.projNet>=0?'+':''}{fmt(proj.projNet)}/mo
                </span>
                <span style={{ color:'var(--stone)', marginLeft:8 }}>
                  ({fmt(proj.projIncome)}/mo in · {fmt(proj.projExpenses)}/mo out)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Position & runway card */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="card">
            <div className="ch"><h3>Position overview</h3></div>
            <div style={{ padding:'12px 14px' }}>
              <RunwayMeter months={runwayMonths} liquidAssets={liquidAssets} monthlyExpenses={projections['M']?.projExpenses ?? 0} />

              <div style={{ marginTop:14, paddingTop:12, borderTop:'0.5px solid var(--bd)' }}>
                <div style={{ fontSize:11, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>
                  Recurring ({recurring.length} detected)
                </div>
                {recurring.filter(r => r.amt < 0).slice(0, 4).map((r, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:5 }}>
                    <span style={{ color:'var(--stone2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:130 }}>
                      {r.payee || r.desc}
                    </span>
                    <span style={{ fontVariantNumeric:'tabular-nums', color:'var(--rd)', flexShrink:0 }}>
                      −{fmt(Math.abs(r.total / r.months.size))}/mo
                    </span>
                  </div>
                ))}
                {recurring.filter(r => r.amt < 0).length > 4 && (
                  <div style={{ fontSize:11, color:'var(--stone)', marginTop:2 }}>
                    +{recurring.filter(r => r.amt < 0).length - 4} more
                  </div>
                )}
                <div style={{ marginTop:8, paddingTop:8, borderTop:'0.5px solid var(--bd)', display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:500 }}>
                  <span>Est. monthly recurring</span>
                  <span className="vn">−{fmt(monthlyRecurringCost)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Account balances */}
          {(accounts || []).length > 0 && (
            <div className="card">
              <div className="ch"><h3>Accounts</h3><button className="btn btn-sm" onClick={() => onNavigate('accounts')}>Manage</button></div>
              <div style={{ padding:'8px 0' }}>
                {(accounts || []).map(a => {
                  const acctTxns = txns.filter(t => t.account_id === a.id);
                  const bal      = (a.opening_balance || 0) + acctTxns.reduce((s, t) => s + (t.amt ?? 0), 0);
                  const isCC     = a.type === 'credit_card';
                  return (
                    <div key={a.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 14px', borderBottom:'0.5px solid var(--bd)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:a.colour, flexShrink:0 }} />
                        <span style={{ fontSize:12 }}>{a.name}</span>
                      </div>
                      <span style={{ fontSize:12, fontWeight:500, fontVariantNumeric:'tabular-nums' }}
                        className={isCC ? (bal > 0 ? 'vn' : 'vp') : (bal >= 0 ? '' : 'vn')}>
                        {isCC && bal > 0 ? '−' : ''}{fmt(Math.abs(bal))}
                        {isCC && <span style={{ fontSize:10, color:'var(--stone)', marginLeft:4 }}>owed</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom row ── */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,3fr) minmax(0,2fr)', gap:12 }}>

        {/* Recent transactions */}
        <div className="card">
          <div className="ch">
            <h3>Recent transactions</h3>
            <button className="btn btn-sm" onClick={() => onNavigate('transactions')}>View all</button>
          </div>
          {recent.length === 0 && <div style={{ padding:'20px 14px', fontSize:12, color:'var(--stone)' }}>No transactions in period.</div>}
          {recent.map(t => {
            const c = catMap[t.cat];
            return (
              <div className="act-item" key={t.id}>
                <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                  <PayeeAvatar name={t.payee} payeesList={payees} />
                  <div style={{ minWidth:0 }}>
                    <div className="act-desc">{t.desc}</div>
                    <div className="act-meta">
                      {t.date}{t.payee && ` · ${t.payee}`}{c ? ` · ${c.l}` : ' · Unallocated'}
                    </div>
                  </div>
                </div>
                <span style={{ fontWeight:500, fontVariantNumeric:'tabular-nums', flexShrink:0, marginLeft:8 }}
                  className={t.amt>=0?'vp':'vn'}>
                  {t.amt>=0?'+':''}{fmt(t.amt)}
                </span>
              </div>
            );
          })}
          {suggestions > 0 && (
            <div style={{ margin:'8px 14px 4px', padding:'8px 12px', background:'var(--ab)', borderRadius:'var(--rr)', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12 }}>
              <span style={{ color:'var(--a2)' }}>⚡ {suggestions} auto-cat suggestion{suggestions>1?'s':''}</span>
              <button className="btn btn-sm btn-a" onClick={() => onNavigate('approve')}>Review</button>
            </div>
          )}
        </div>

        {/* Top payees + top categories */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="card">
            <div className="ch"><h3>Top payees</h3><button className="btn btn-sm" onClick={() => onNavigate('payees')}>Report</button></div>
            <div style={{ padding:'10px 14px' }}>
              {topPayees.length === 0 && <p style={{ fontSize:12, color:'var(--stone)' }}>Assign payees to see insights.</p>}
              {topPayees.map(([name, v]) => {
                const col = payeeColor(name, payees);
                return (
                  <div key={name} style={{ marginBottom:9, display:'flex', alignItems:'center', gap:8 }}>
                    <PayeeAvatar name={name} payeesList={payees} size="sm" />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:110 }}>{name}</span>
                        <span style={{ fontVariantNumeric:'tabular-nums', fontWeight:500, flexShrink:0 }} className={v.total>=0?'vp':'vn'}>{fmt(v.total)}</span>
                      </div>
                      <div style={{ height:3, background:'var(--sand3)', borderRadius:2, marginTop:3 }}>
                        <div style={{ height:3, borderRadius:2, background:col, width:`${Math.round(Math.abs(v.total)/maxPayee*100)}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="ch"><h3>Top categories</h3></div>
            <div style={{ padding:'10px 14px' }}>
              {topCats.length === 0 && <p style={{ fontSize:12, color:'var(--stone)' }}>No expenses in period.</p>}
              {topCats.map(([label, v]) => (
                <div key={label} style={{ marginBottom:9 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                    <span>{label}</span>
                    <span style={{ fontVariantNumeric:'tabular-nums' }}>{fmt(v.total)}</span>
                  </div>
                  <div style={{ height:3, background:'var(--sand3)', borderRadius:2 }}>
                    <div style={{ height:3, borderRadius:2, background:v.col, width:`${Math.round(v.total/maxCat*100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="ch"><h3>Quick actions</h3></div>
            <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 }}>
              <button className="btn" style={{ textAlign:'left' }} onClick={() => onNavigate('import')}>Import bank statement</button>
              <button className="btn" style={{ textAlign:'left' }} onClick={() => onNavigate('transactions')}>+ Add transaction</button>
              <button className="btn" style={{ textAlign:'left' }} onClick={() => onNavigate('tax')}>Tax tracker ↗</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
