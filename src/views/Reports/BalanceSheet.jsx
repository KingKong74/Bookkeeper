/**
 * views/Reports/BalanceSheet.jsx
 * Balance Sheet — assets, liabilities, equity at a point in time.
 * Standard (two-column) and Detailed (Xero-style) views.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { PeriodBar } from '../../components/ui/PeriodBar';
import { fmt, fmtAcct, fmtReport, filterByDateRange, buildBSFromJournals, dateRangeLabel } from '../../utils/helpers';
import { A4Paper, MonoContext, CompareBar, CompareHeader, StHead, StRow, StTotal, StGrand, BSRow, BSTotalRow } from './reportComponents';
import { MetricCard } from '../../components/ui/index.jsx';
import { DrillPanel } from './DrillPanel';
import { getPriorDates } from './reportHelpers';

export function BalanceSheet() {
  const { txns, catMap, dateFrom, dateTo, journals, accounts } = useApp();
  // Balance = opening_balance + sum of ALL transactions for this account (not date-filtered).
  // We load all txns once on mount, outside the FY date window.
  // NOTE: for Basiq-synced accounts ob=current balance at sync time, so this will
  // overcount unless opening_date is used as a cutoff. We match BankAccounts.jsx:
  // use all context txns (FY window) which gives the user a consistent experience.
  const allTxns = txns; // use context txns — matches BankAccounts display
  const [showZero, setShowZero] = useState(false);
  const [drill,    setDrill]    = useState(null);
  const [drillBS,  setDrillBS]  = useState(null);
  const [compare,  setCompare]  = useState('none');
  const [bsView,   setBsView]   = useState('standard');

  const priorDates = getPriorDates(compare, dateFrom, dateTo);
  const accountMap = useMemo(() => Object.fromEntries((accounts || []).map(a => [a.id, a])), [accounts]);
  // hasJournals: true if there are any posted journal entries with category lines (P&L/BS categories)
  // Bank accounts always show from direct transaction sum regardless of this flag
  const hasJournals = (journals || []).some(j => j.status !== 'void' && (j.journal_lines || j.lines || []).some(l => l.category_id));

  const bs  = useMemo(() => buildBSFromJournals(journals || [], '2000-01-01', dateTo, catMap, accountMap), [journals, dateTo, catMap, accountMap]);
  const bsP = useMemo(() => priorDates ? buildBSFromJournals(journals || [], '2000-01-01', priorDates[1], catMap, accountMap) : null, [journals, priorDates, catMap, accountMap]);
  const priorLabel = priorDates ? dateRangeLabel(priorDates[0], priorDates[1]) : '';

  const ft   = useMemo(() => filterByDateRange(txns, dateFrom, dateTo), [txns, dateFrom, dateTo]);
  const ftP  = useMemo(() => priorDates ? filterByDateRange(txns, priorDates[0], priorDates[1]) : [], [txns, priorDates]);
  const vals = useMemo(() => { const m = {}; ft.forEach(t => { const c = catMap[t.cat]; if (!c) return; if (!m[c.id]) m[c.id] = { ...c, total: 0 }; m[c.id].total += t.amt; }); return Object.values(m); }, [ft, catMap]);

  const bankAccounts = useMemo(() => (accounts || []).map(a => {
    const ob   = parseFloat(a.opening_balance) || 0;
    const sum  = (allTxns || []).filter(t => t.account_id === a.id).reduce((s, t) => s + (t.amt ?? 0), 0);
    const isCC = a.type === 'credit_card' || a.type === 'loan';
    // CC: balance = amount owed. opening_balance is amount owed at start.
    // Spending (negative txns) increases CC debt → balance = ob - sum
    // Asset: balance = ob + sum
    const balance = isCC ? ob - sum : ob + sum;
    return { ...a, balance };
  }), [accounts, allTxns]);

  const liquidAccounts = bankAccounts.filter(a => (a.type === 'checking' || a.type === 'savings') && (showZero || Math.abs(a.balance) > 0.005));
  const liquidTotal    = bankAccounts.filter(a => a.type === 'checking' || a.type === 'savings').reduce((s, a) => s + a.balance, 0);
  const investAccounts = bankAccounts.filter(a => a.type === 'investment' && (showZero || Math.abs(a.balance) > 0.005));
  const investTotal    = bankAccounts.filter(a => a.type === 'investment').reduce((s, a) => s + a.balance, 0);
  const fixedAssets    = vals.filter(c => c.t === 'asset');
  const ccAccounts     = bankAccounts.filter(a => (a.type === 'credit_card' || a.type === 'loan') && (showZero || Math.abs(a.balance) > 0.005));
  const ccTotal        = bankAccounts.filter(a => a.type === 'credit_card' || a.type === 'loan').reduce((s, a) => s + Math.abs(a.balance), 0);
  const catLiabilities = vals.filter(c => c.t === 'liability');

  const legacyTotalAssets = liquidTotal + investTotal + fixedAssets.reduce((s, c) => s + Math.abs(c.total), 0);
  const legacyTotalLiab   = ccTotal + catLiabilities.reduce((s, c) => s + Math.abs(c.total), 0);
  const legacyTotalEquity = legacyTotalAssets - legacyTotalLiab;
  const legacyTotalLE     = legacyTotalLiab + legacyTotalEquity;

  // Always use bankAccount direct sums + journal cat lines for totals
  const totalAssets = liquidTotal + investTotal + fixedAssets.reduce((s, c) => s + Math.abs(c.total), 0)
    + (hasJournals ? (bs.assetLines || []).filter(l => !accountMap[l.id]).reduce((s, l) => s + l.net, 0) : 0);
  const totalLiab   = ccTotal + catLiabilities.reduce((s, c) => s + Math.abs(c.total), 0)
    + (hasJournals ? (bs.liabilityLines || []).filter(l => !accountMap[l.id]).reduce((s, l) => s + l.net, 0) : 0);
  const totalEquity = totalAssets - totalLiab;
  const totalLE     = totalLiab + totalEquity;

  return (
    <div>
      <PeriodBar />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <CompareBar compare={compare} setCompare={setCompare} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--stone)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} style={{ cursor: 'pointer' }} />
          Show zero-balance accounts
        </label>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {[['standard', 'Standard'], ['detailed', 'Detailed (Xero-style)']].map(([v, l]) => (
          <button key={v} className={`btn btn-sm${bsView === v ? ' btn-a' : ''}`} onClick={() => setBsView(v)}>{l}</button>
        ))}
      </div>

      <A4Paper title="Balance Sheet" wide={compare !== 'none' || bsView === 'detailed'} subtitle={dateRangeLabel(dateFrom, dateTo)}>
        {bsView === 'detailed' ? (
          <div style={{ padding: '20px 0 0' }}>
            {compare !== 'none' && (
              <div style={{ display: 'grid', gridTemplateColumns: `1fr 130px${compare !== 'none' ? ' 130px' : ''}`, padding: '4px 32px', borderBottom: '0.5px solid var(--bd)' }}>
                <span /><span style={{ textAlign: 'right', fontSize: 11, color: 'var(--stone)', fontWeight: 500 }}>{dateRangeLabel(dateFrom, dateTo)}</span>
                {compare !== 'none' && <span style={{ textAlign: 'right', fontSize: 11, color: 'var(--stone2)', fontWeight: 500 }}>{priorLabel}</span>}
              </div>
            )}
            {[
              { title: 'Assets',      lines: bs?.assetLines,     total: totalAssets,  priorTotal: bsP?.totalAssets },
              { title: 'Liabilities', lines: bs?.liabilityLines, total: -totalLiab,   priorTotal: bsP ? -(bsP.totalLiabilities ?? 0) : 0, isNeg: true },
            ].map(({ title, lines, total, priorTotal, isNeg }) => (
              <React.Fragment key={title}>
                <div style={{ padding: '8px 32px 2px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink)', marginTop: 8 }}>{title}</div>
                {hasJournals ? (lines || []).map(l => {
                  const section = title === 'Assets' ? bsP?.assetLines : bsP?.liabilityLines;
                  const pNet    = section?.find(x => (x.id || x.l) === (l.id || l.l))?.net ?? 0;
                  const bsCat   = catMap[l.id] || (l.id ? { id: l.id, l: l.l || l.name, col: l.col || '#185FA5', t: l.t || 'asset', ac: l.type || 'asset', _isBankDrill:true } : null);
                  return <BSRow key={l.id || l.l} label={l.l || l.name} value={fmtAcct(l.net)} valueB={compare !== 'none' ? fmtAcct(pNet) : undefined} isNeg={l.net < -0.005} clickable={!!bsCat} onClick={bsCat ? () => setDrillBS(bsCat) : undefined} />;
                }) : (
                  title === 'Assets'
                    ? <>{liquidAccounts.map(a => <BSRow key={a.id} label={a.name} value={fmtAcct(a.balance)} isNeg={a.balance < -0.005} clickable onClick={() => setDrill({ id: a.id, l: a.name, col: a.colour || '#185FA5', ac: a.type, t: 'asset', _isBankDrill: true })} />)}{fixedAssets.map(a => <BSRow key={a.id} label={a.l} value={fmtAcct(a.total)} isNeg={a.total < -0.005} />)}</>
                    : <>{ccAccounts.map(a => <BSRow key={a.id} label={a.name} value={fmtAcct(-Math.abs(a.balance))} isNeg clickable onClick={() => setDrill({ id: a.id, l: a.name, col: a.colour || '#F87171', ac: a.type, t: 'liability', _isBankDrill: true })} />)}{catLiabilities.map(a => <BSRow key={a.id} label={a.l} value={fmtAcct(-Math.abs(a.total))} isNeg />)}</>
                )}
                <BSTotalRow label={`Total ${title}`} value={fmtAcct(total)} isNeg={isNeg} valueB={compare !== 'none' ? fmtAcct(priorTotal ?? 0) : undefined} bold />
              </React.Fragment>
            ))}
            <div style={{ padding: '8px 32px 2px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink)', marginTop: 12 }}>Equity</div>
            {vals.filter(x => x.t === 'equity').map(x => <BSRow key={x.id} label={x.l} value={fmtAcct(x.total)} isNeg={x.total < -0.005} />)}
            <BSRow label="Retained Earnings" value={fmtAcct(totalEquity - vals.filter(x => x.t === 'equity').reduce((s, x) => s + x.total, 0))} isNeg={(totalEquity - vals.filter(x => x.t === 'equity').reduce((s, x) => s + x.total, 0)) < -0.005} />
            <BSTotalRow label="Total Equity" value={fmtAcct(totalEquity)} isNeg={totalEquity < -0.005} bold />
            <BSTotalRow label="Total Liabilities and Equity" value={fmtAcct(totalLE)} isNeg={totalLE < -0.005} underline bold />
            <div style={{ height: 24 }} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '20px 0 0' }}>
            <div style={{ borderRight: '0.5px solid var(--bd)' }}>
              <StHead>Assets</StHead>
              {/* Bank accounts — always show from direct transaction sum */}
              {(liquidAccounts.length > 0 || liquidTotal !== 0) && (
                <>
                  <StHead>Cash &amp; Bank</StHead>
                  {liquidAccounts.map(a => <StRow key={a.id} label={a.name} value={fmtReport(a.balance)} indent valueClass={a.balance >= 0 ? 'vp' : 'vn'} clickable onClick={() => setDrill({ id: a.id, l: a.name, col: a.colour || '#185FA5', ac: a.type, t: 'asset', _isBankDrill: true })} />)}
                  {liquidAccounts.length > 1 && <StTotal label="Total Cash &amp; Bank" value={fmtReport(liquidTotal)} valueClass={liquidTotal >= 0 ? 'vp' : 'vn'} />}
                </>
              )}
              {investAccounts.length > 0 && (<><StHead>Investments</StHead>{investAccounts.map(a => <StRow key={a.id} label={a.name} value={fmtReport(a.balance)} indent valueClass={a.balance >= 0 ? 'vp' : 'vn'} clickable onClick={() => setDrill({ id: a.id, l: a.name, col: a.colour || '#185FA5', ac: a.type, t: 'asset', _isBankDrill: true })} />)}<StTotal label="Total Investments" value={fmt(investTotal)} valueClass="vp" /></>)}
              {fixedAssets.length > 0 && (<><StHead>Fixed Assets</StHead>{fixedAssets.map(c => <StRow key={c.id} label={c.l} value={fmt(Math.abs(c.total))} indent clickable onClick={() => setDrill(c)} />)}</>)}
              <StGrand label="Total Assets" value={fmtReport(totalAssets)} />
            </div>
            <div>
              <StHead>Liabilities & Equity</StHead>
              {/* CC/loan liabilities — always show from direct transaction sum */}
              {(ccAccounts.length > 0 || catLiabilities.length > 0 || (hasJournals && bs.liabilityLines?.length > 0)) && (
                <>
                  <StHead>Liabilities</StHead>
                  {ccAccounts.map(a => <StRow key={a.id} label={a.name} value={fmtReport(Math.abs(a.balance))} indent valueClass="" clickable onClick={() => setDrill({ id: a.id, l: a.name, col: a.colour || '#F87171', ac: a.type, t: 'liability', _isBankDrill: true })} />)}
                  {catLiabilities.map(c => <StRow key={c.id} label={c.l} value={fmtReport(Math.abs(c.total))} indent />)}
                  {hasJournals && bs.liabilityLines?.filter(l => !accountMap[l.id]).map(l => <StRow key={l.id || l.l} label={l.l || l.name} value={fmtReport(l.net)} indent />)}
                  <StTotal label="Total Liabilities" value={fmtReport(totalLiab)} valueB={compare !== 'none' ? fmtReport(bsP?.totalLiabilities ?? 0) : undefined} />
                </>
              )}
              <StHead>Equity</StHead>
              {bs.equityLines?.map(l => { const pLine = bsP?.equityLines?.find(x => (x.id || x.l) === (l.id || l.l)); return <StRow key={l.id || l.l} label={l.l || l.name} value={fmtAcct(l.net)} valueB={compare !== 'none' ? fmtAcct(pLine?.net ?? 0) : undefined} indent valueClass={l.net >= 0 ? 'vp' : 'vn'} />; })}
              <StRow label="Retained Earnings" value={fmtAcct(totalEquity - (bs.equityLines?.reduce((s, l) => s + l.net, 0) || 0))} valueB={compare !== 'none' ? fmtAcct((bsP?.totalEquity ?? 0) - (bsP?.equityLines?.reduce((s, l) => s + l.net, 0) || 0)) : undefined} indent valueClass={totalEquity >= 0 ? 'vp' : 'vn'} />
              <StTotal label="Total Equity" value={fmtAcct(totalEquity)} valueB={compare !== 'none' ? fmtAcct(bsP?.totalEquity ?? 0) : undefined} valueClass={totalEquity >= 0 ? 'vp' : 'vn'} />
              <StGrand label="Total Liabilities & Equity" value={fmtAcct(totalLE)} valueB={compare !== 'none' ? fmtAcct(bsP?.totalLE ?? 0) : undefined} />
            </div>
          </div>
        )}
        <div style={{ height: 24 }} />
      </A4Paper>

      {drill   && <DrillPanel cat={drill}   txns={drill._isBankDrill   ? allTxns : txns} dateFrom={drill._isBankDrill   ? '2000-01-01' : dateFrom} dateTo={dateTo} onClose={() => setDrill(null)} />}
      {drillBS && <DrillPanel cat={drillBS} txns={drillBS._isBankDrill ? allTxns : txns} dateFrom={drillBS._isBankDrill ? '2000-01-01' : dateFrom} dateTo={dateTo} onClose={() => setDrillBS(null)} />}
    </div>
  );
}
