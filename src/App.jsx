/**
 * App.jsx
 * Root component: auth gate, shell layout, view routing.
 * Tab switching is instant — no background refresh on navigation.
 * Data stays fresh from the initial load + optimistic UI updates in each view.
 */

import React, { useState, useEffect, useTransition, Suspense } from 'react';
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

  // Apply saved theme immediately on mount
  useEffect(() => {
    const dark = localStorage.getItem('pref_dark_mode') === 'true';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, []);

  const [view, setView] = useState('dashboard');
  const [sandboxParsedFiles, setSandboxParsedFiles] = useState(null); // pre-parsed files from sandbox/bank sync
  const [defaultAccountTab, setDefaultAccountTab] = useState(null);
  const [isPending, startTransition] = useTransition();

  function navigateTo(nextView) {
    startTransition(() => setView(nextView));
  }

  if (authLoading) return <Splash text="Loading…" />;
  if (!session)    return <AuthScreen />;
  if (dataLoading) return <Splash text="Loading your data…" />;
  if (error)       return <ErrorScreen message={error} />;

  const adapted      = (transactions || []).map(t => ({ ...t, cat: t.category_id, desc: t.description }));
  const adaptedRules = (rules || []).map(r => ({ ...r, catId: r.category_id }));
  const ft           = filterByDateRange(adapted, dateFrom, dateTo);
  const unallocated  = ft.filter(t => !t.cat).length;
  const unlinked     = ft.filter(t => !t.account_id).length;
  const suggestions  = runAutoCatRules(adapted, adaptedRules).length;
  const periodLabel  = typeof fyMode === 'number' ? fyLabel(fyMode) : dateRangeLabel(dateFrom, dateTo);

  function renderView() {
    switch (view) {
      case 'dashboard':    return <Dashboard       onNavigate={navigateTo} />;
      case 'transactions': return <Transactions defaultAccountTab={defaultAccountTab} onClearDefaultTab={() => setDefaultAccountTab(null)} />;
      case 'approve':      return <AutoCategorise  onNavigate={navigateTo} />;
      case 'import':       return <ImportStatement onNavigate={navigateTo} initialParsedFiles={sandboxParsedFiles} onClearInitial={() => setSandboxParsedFiles(null)} />;
      case 'accounts':     return <BankAccounts
        onNavigate={(v, acctId) => { setDefaultAccountTab(acctId || null); startTransition(() => setView(v)); }}
        onSandboxReview={pf => { setSandboxParsedFiles(pf); startTransition(() => setView('import')); }}
      />;
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
      default:             return <Dashboard onNavigate={navigateTo} />;
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
        onNavigate={navigateTo}
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
            <ProfileCircle user={user} />
          </div>
        </div>
        <div className="content" style={{ position: 'relative' }}>
          {isPending && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 50,
              background: 'var(--sand)', opacity: 0.65,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ViewSpinner />
            </div>
          )}
          {renderView()}
        </div>
      </div>
      <Toast message={toastMsg} />
    </div>
  );
}

function ProfileCircle({ user }) {
  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '?';
  const hue = user?.email
    ? user.email.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
    : 200;
  return (
    <div
      title={user?.email || 'Profile'}
      style={{
        width: 30, height: 30, borderRadius: '50%',
        background: `hsl(${hue},42%,44%)`,
        color: '#fff', fontSize: 11, fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, userSelect: 'none', letterSpacing: '0.02em',
        cursor: 'default',
      }}
    >
      {initials}
    </div>
  );
}

function ViewSpinner() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 20, height: 20,
        border: '2px solid var(--bd2)',
        borderTopColor: 'var(--a)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      <span style={{ fontSize: 11, color: 'var(--stone)' }}>Loading…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
