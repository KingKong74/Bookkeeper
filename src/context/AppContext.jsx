/**
 * context/AppContext.jsx
 * ----------------------
 * Global state backed by Supabase.
 *
 * The DB uses snake_case field names (category_id, description) while the
 * views were originally written with shorthand names (cat, desc).
 * To avoid rewriting every view, transactions are normalised on the way in:
 *   t.cat   = t.category_id
 *   t.desc  = t.description
 *   t.amt   = t.amount
 *   t.payee = t.payees?.name  (joined relation)
 *
 * Context also exposes `txns` / `setTxns` as aliases for backward compat.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  supabase, getMyOrgs, getTransactions, getCategories,
  getPayees, getRules, getJournals, getBudgets,
  getTaxProfile, getTaxReferenceData, upsertPayee,
  getBankAccounts, getMerchantHints, getMasterCOA, getOrgSettings,
} from '../lib/supabase';
import { currentFYStart } from '../utils/helpers';

const AppContext = createContext(null);

/** Normalise a DB transaction row into the shape views expect */
function normaliseTxn(t) {
  return {
    ...t,
    // shorthand aliases used throughout views
    cat:   t.category_id  ?? null,
    desc:  t.description  ?? '',
    amt:   parseFloat(t.amount) ?? 0,
    payee: t.payees?.name ?? t.payee ?? '',
    note:  t.note ?? '',
  };
}

/** Normalise a DB category row — views use c.l / c.t / c.col / c.ac */
function normaliseCat(c) {
  return {
    ...c,
    l:   c.label         ?? '',
    t:   c.type          ?? '',
    col: c.colour        ?? '#888780',
    ac:  c.account_group ?? '',
  };
}

/** Normalise a DB rule row — views use r.catId / r.keyword / r.payee */
function normaliseRule(r) {
  return {
    ...r,
    catId:     r.category_id ?? '',
    payee:     r.payee_name  ?? '',
    keyword:   r.keyword     ?? '',
    amtExact:  r.amt_exact  != null ? String(r.amt_exact)  : '',
    amtMin:    r.amt_min    != null ? String(r.amt_min)    : '',
    amtMax:    r.amt_max    != null ? String(r.amt_max)    : '',
    direction: r.direction  ?? '',
  };
}

export function AppProvider({ children }) {

  // ── Auth ──────────────────────────────────────────────────
  const [session,     setSession]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ── Active org ────────────────────────────────────────────
  const [org, setOrg] = useState(null);

  // ── Financial data (normalised) ───────────────────────────
  const [transactions, setTransactions] = useState([]);
  const [categories,   setCategories]   = useState([]);
  const [payees,       setPayees]       = useState([]);
  const [rules,        setRules]        = useState([]);
  const [journals,     setJournals]     = useState([]);
  const [budgets,      setBudgets]      = useState([]);
  const [accounts,     setAccounts]     = useState([]);
  const [masterCOA,    setMasterCOA]    = useState([]);
  const [merchantHints, setMerchantHints] = useState([]);
  const [orgSettings,   setOrgSettings]   = useState({ merchantIntelEnabled: true });

  // ── Tax ───────────────────────────────────────────────────
  const [taxProfile, setTaxProfile] = useState(null);
  const [taxRefData, setTaxRefData] = useState(null);

  // ── Date range ─────────────────────────────────────────────
  const fyStart = currentFYStart();
  const [dateFrom, setDateFrom] = useState(`${fyStart}-07-01`);
  const [dateTo,   setDateTo]   = useState(`${fyStart + 1}-06-30`);
  const [fyMode,   setFyMode]   = useState(fyStart);

  // ── Loading / error ────────────────────────────────────────
  const [dataLoading, setDataLoading] = useState(false);
  const [error,       setError]       = useState(null);

  // ── Toast ──────────────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);
  const toast = useCallback((msg) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2600);
  }, []);

  // ── Derived maps ───────────────────────────────────────────
  // catMap keyed by DB uuid (used by reports)
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
  // Also key by the shorthand id field for legacy views
  const catMapById = { ...catMap };

  const PALETTE = [
    '#3B6D11','#1D9E75','#639922','#085041','#BA7517','#854F0B',
    '#993C1D','#D85A30','#185FA5','#0C447C','#D4537E','#993556',
    '#7F77DD','#534AB7','#0F6E56','#E24B4A','#5F5E5A','#444441',
    '#888780','#A32D2D',
  ];

  // ── Auth listener ──────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
      if (!session) {
        setOrg(null); setTransactions([]); setCategories([]);
        setPayees([]); setRules([]); setJournals([]); setBudgets([]);
        setTaxProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session?.user) loadAllData(); }, [session?.user?.id]); // eslint-disable-line
  useEffect(() => { if (org) loadTransactions(org.id); }, [dateFrom, dateTo, org?.id]); // eslint-disable-line

  // ── Data loaders ───────────────────────────────────────────
  async function loadAllData() {
    setDataLoading(true);
    setError(null);
    try {
      const orgs = await getMyOrgs();
      if (!orgs.length) throw new Error('No organisation found. Make sure the SQL migration has been run.');
      const activeOrg = orgs[0];
      setOrg(activeOrg);

      const [cats, pays, rls, jnls, txns, budgRows, taxProf, taxRef, accts, hints, masterCOAData, settings] = await Promise.all([
        getCategories(activeOrg.id),
        getPayees(activeOrg.id),
        getRules(activeOrg.id),
        getJournals(activeOrg.id),
        getTransactions(activeOrg.id, dateFrom, dateTo),
        getBudgets(activeOrg.id, fyStart),
        getTaxProfile(activeOrg.id, fyStart),
        getTaxReferenceData(fyStart).catch(() => null),
        getBankAccounts(activeOrg.id).catch(() => []),
        getMerchantHints(activeOrg.id).catch(() => []),
        getMasterCOA().catch(() => []),
        getOrgSettings(activeOrg.id).catch(() => ({})),
      ]);

      setCategories(cats.map(normaliseCat));
      setPayees(pays);
      setRules(rls.map(normaliseRule));
      setJournals(jnls);
      setTransactions(txns.map(normaliseTxn));
      setBudgets(budgRows);
      setTaxProfile(taxProf);
      setTaxRefData(taxRef);
      setAccounts(accts || []);
      setMerchantHints(hints || []);
      setMasterCOA(masterCOAData || []);
      setOrgSettings(prev => ({ merchantIntelEnabled:true, ...prev, ...(settings||{}) }));
    } catch (e) {
      console.error('Failed to load data:', e);
      setError(e.message);
    } finally {
      setDataLoading(false);
    }
  }

  async function loadTransactions(orgId) {
    try {
      const txns = await getTransactions(orgId, dateFrom, dateTo);
      setTransactions(txns.map(normaliseTxn));
    } catch (e) {
      console.error(e);
    }
  }

  // Quiet background refresh (no spinner) — called on tab switches
  async function refreshData() {
    if (!org) return;
    try {
      const [cats, jnls, txns] = await Promise.all([
        getCategories(org.id),
        getJournals(org.id),
        getTransactions(org.id, dateFrom, dateTo),
      ]);
      setCategories(cats.map(normaliseCat));
      setJournals(jnls);
      setTransactions(txns.map(normaliseTxn));
    } catch (e) {
      console.warn('Background refresh failed:', e.message);
    }
  }

  // ── Payee helper: ensure a payee exists ────────────────────
  const ensurePayee = useCallback(async (name) => {
    if (!name?.trim() || !org) return;
    const exists = payees.some(p => p.name.toLowerCase() === name.toLowerCase());
    if (!exists) {
      const col = PALETTE[payees.length % PALETTE.length];
      try {
        const newPayee = await _up(org.id, name.trim(), col);
        setPayees(prev => [...prev, newPayee]);
      } catch (e) {
        console.error('ensurePayee failed:', e);
      }
    }
  }, [payees, org, PALETTE]);

  // ── Expose everything ──────────────────────────────────────
  const value = {
    // Auth
    session, user: session?.user ?? null, authLoading,
    // Org
    org,
    // Data — both modern names and legacy aliases
    transactions, setTransactions,
    txns: transactions,                        // ← legacy alias
    setTxns: setTransactions,                  // ← legacy alias
    categories,   setCategories,
    cats: categories,                          // ← legacy alias
    setCats: setCategories,                    // ← legacy alias
    payees,       setPayees,
    rules,        setRules,
    journals,     setJournals,
    budgets,      setBudgets,
    catMap,                                    // keyed by DB uuid
    // Bank accounts
    accounts, setAccounts,
    // Tax
    taxProfile, setTaxProfile,
    taxRefData, setTaxRefData,
    // Date range
    dateFrom, dateTo, fyMode,
    setDateFrom, setDateTo, setFyMode,
    // UI
    toast, toastMsg,
    dataLoading, error,
    PALETTE,
    ensurePayee,
    reloadAll: loadAllData,
    refreshData,
    masterCOA, setMasterCOA,
    // Intelligence
    merchantHints, setMerchantHints,
    orgSettings,   setOrgSettings,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
