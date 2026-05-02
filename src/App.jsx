/**
 * App.jsx
 * -------
 * Root component. Handles:
 *   1. Auth gating — shows AuthScreen if no session
 *   2. Loading state — shows spinner while data loads
 *   3. Shell layout — Sidebar + main content area
 *   4. View routing — maps view keys to components
 */

import React, { useState } from 'react';
import { useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Toast } from './components/ui/index';
import { AuthScreen } from './views/Auth';
import { Dashboard }       from './views/Dashboard';
import { Transactions }    from './views/Banking/Transactions';
import { AutoCategorise }  from './views/Banking/AutoCategorise';
import { ImportStatement } from './views/Banking/ImportStatement';
import { BankAccounts }   from './views/Banking/BankAccounts';
import { Reconciliation }  from './views/Banking/Reconciliation';
import { Journals, ChartOfAccounts, Categories, AutoCatRules, Budgets } from './views/Accounting/index';
import { TrialBalance, ProfitAndLoss, BalanceSheet, PayeeReport } from './views/Reports/index';
import { TaxTracker } from './views/Tax/TaxTracker';
import { AuditTrailReport } from './views/Reports/AuditTrailReport';
import { Settings } from './views/Settings/index';
import { filterByDateRange, runAutoCatRules, dateRangeLabel, fyLabel } from './utils/helpers';
import { signOut } from './lib/supabase';

const VIEW_TITLES = {
  dashboard:'Dashboard', transactions:'Transactions', approve:'Auto-categorise',
  import:'Import statement', reconcile:'Reconciliation', journals:'Journals',
  coa:'Chart of accounts', categories:'Categories', rules:'Auto-cat rules',
  budgets:'Budgets', tax:'Tax tracker', trial:'Trial balance',
  pl:'Profit & loss', balance:'Balance sheet', payees:'Payee report',
};

export default function App() {
  const {
    session, authLoading, dataLoading, error,
    transactions, rules,
    dateFrom, dateTo, fyMode,
    toastMsg, toast,
    user, org,
  } = useApp();

  const [view, setView] = useState('dashboard');
  const [defaultAccountTab, setDefaultAccountTab] = useState(null);

  if (authLoading) return <Splash text="Loading…" />;
  if (!session)    return <AuthScreen />;
  if (dataLoading) return <Splash text="Loading your data…" />;
  if (error)       return <ErrorScreen message={error} />;

  // Adapt DB shape for helpers (desc vs description, category_id vs cat)
  const adapted = (transactions || []).map(t => ({
    ...t, cat: t.category_id, desc: t.description,
  }));
  const adaptedRules = (rules || []).map(r => ({
    ...r, catId: r.category_id,
  }));

  const ft          = filterByDateRange(adapted, dateFrom, dateTo);
  const unallocated = ft.filter(t => !t.cat).length;
  const unlinked    = ft.filter(t => !t.account_id).length;
  const suggestions = runAutoCatRules(adapted, adaptedRules).length;
  const periodLabel = typeof fyMode === 'number' ? fyLabel(fyMode) : dateRangeLabel(dateFrom, dateTo);

  function renderView() {
    switch (view) {
      case 'dashboard':    return <Dashboard       onNavigate={setView} />;
      case 'transactions': return <Transactions defaultAccountTab={defaultAccountTab} onClearDefaultTab={() => setDefaultAccountTab(null)} />;
      case 'approve':      return <AutoCategorise  onNavigate={setView} />;
      case 'import':       return <ImportStatement onNavigate={setView} />;
      case 'accounts':     return <BankAccounts onNavigate={(v, acctId) => { setDefaultAccountTab(acctId || null); setView(v); }} />;
      case 'reconcile':    return <Reconciliation />;
      case 'journals':     return <Journals />;
      case 'coa':          return <ChartOfAccounts />;
      case 'categories':   return <Categories />;
      case 'rules':        return <AutoCatRules />;
      case 'budgets':      return <Budgets />;
      case 'tax':          return <TaxTracker />;
      case 'auditlog':     return <AuditTrailReport />;
      case 'settings':     return <Settings />;
      case 'trial':        return <TrialBalance />;
      case 'pl':           return <ProfitAndLoss />;
      case 'balance':      return <BalanceSheet />;
      case 'payees':       return <PayeeReport />;
      default:             return <Dashboard onNavigate={setView} />;
    }
  }

  async function handleSignOut() {
    await signOut();
    toast('Signed out.');
  }

  return (
    <div className="shell">
      <Sidebar
        currentView={view}
        onNavigate={setView}
        badges={{ ua: unallocated, approve: suggestions, unlinked }}
        user={user}
        orgName={org?.name}
        onSignOut={handleSignOut}
      />
      <div className="main">
        <div className="topbar">
          <div className="tb-left">
            <h2>{VIEW_TITLES[view] || view}</h2>
            <span className="tb-pill">{periodLabel}</span>
          </div>
          <div className="tb-right">
            {['trial','pl','balance','payees','tax'].includes(view) && (
              <button className="btn" onClick={() => typeof sendPrompt === 'function' && sendPrompt(`Analyse my ${VIEW_TITLES[view]} for ${periodLabel}`)}>
                Ask Claude ↗
              </button>
            )}
          </div>
        </div>
        <div className="content">{renderView()}</div>
      </div>
      <Toast message={toastMsg} />
    </div>
  );
}

function Splash({ text }) {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--sand)' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:24, height:24, background:'#BA7517', transform:'rotate(45deg)', borderRadius:3, margin:'0 auto 14px', opacity:0.8 }} />
        <p style={{ fontSize:13, color:'var(--stone)' }}>{text}</p>
      </div>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--sand)' }}>
      <div className="card" style={{ maxWidth:400, padding:24, textAlign:'center' }}>
        <p style={{ fontWeight:500, marginBottom:8 }}>Failed to load data</p>
        <p style={{ fontSize:12, color:'var(--stone)', marginBottom:16 }}>{message}</p>
        <button className="btn btn-a" onClick={() => window.location.reload()}>Retry</button>
      </div>
    </div>
  );
}
