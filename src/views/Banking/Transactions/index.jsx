/**
 * views/Banking/Transactions/index.jsx
 * Page orchestrator — state, handlers, data flow.
 * UI is delegated to TransactionFilters, TransactionRow, and overlay components.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../../context/AppContext';
import { PeriodBar } from '../../../components/ui/PeriodBar';
import { TransactionModal }    from '../TransactionModal';
import { AddTransactionModal } from '../AddTransactionModal';
import { fmt, filterByDateRange, runAutoCatRules, estimateCategoryForMerchant } from '../../../utils/helpers';
import { extractMerchantName } from '../../../utils/merchant.js';
import { updateTransaction, deleteTransaction, createRule, createCategory, createCategoryWithCode } from '../../../lib/supabase';
import { upsertPayee } from '../../../services/categoryService';
import { postCategoryJournal } from '../../../services/journalService';
import { logAudit } from '../../../lib/audit';
import { getSessionPref, setSessionPref } from '../../../hooks/useSessionPref';
import { TransactionFilters } from './TransactionFilters';
import { TransactionRow }     from './TransactionRow';
import { DeleteToast }        from './DeleteToast';
import { MakeRulePrompt }     from './MakeRulePrompt';
import { SUPPRESS_KEY_PAYEE, SUPPRESS_KEY_CAT, recordSuppression, isSuppressed } from './transactionHelpers';

const CAT_TYPE_ORDER = ['income', 'expense', 'asset', 'liability', 'equity'];

export function Transactions({ defaultAccountTab = null, onClearDefaultTab }) {
  const { txns, setTxns, cats, setCats, catMap, rules, setRules, payees, setPayees,
          accounts, dateFrom, dateTo, toast, org, user, PALETTE } = useApp();

  const [accountTab,  setAccountTab]  = useState(defaultAccountTab);
  const [allocTab,    setAllocTab]    = useState('all');
  const [search,      setSearch]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState('');
  const [payeeFilter, setPayeeFilter] = useState('');
  const [selected,    setSelected]    = useState(new Set());
  const [sortCol,     setSortCol]     = useState('date');
  const [sortDir,     setSortDir]     = useState('desc');

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir(col === 'date' ? 'desc' : 'asc'); }
  }

  // Auto-assign payees from description matching
  useEffect(() => {
    if (!txns?.length || !payees?.length) return;
    const unassigned = txns.filter(t => !t.payee_id);
    if (!unassigned.length) return;
    const sortedPayees = [...payees].sort((a, b) => (b.name || '').length - (a.name || '').length);
    const toAssign = [];
    for (const t of unassigned) {
      const desc = (t.desc || t.description || '').toLowerCase();
      if (!desc) continue;
      const _merchant = (extractMerchantName(t.desc || '') || '').toLowerCase();
      if (_merchant && isSuppressed(SUPPRESS_KEY_PAYEE, _merchant)) continue;
      let matched = sortedPayees.find(p => { const name = (p.name || '').toLowerCase(); return name.length >= 3 && desc.includes(name); });
      if (!matched && _merchant.length >= 3) {
        matched = sortedPayees.find(p => { const name = (p.name || '').toLowerCase(); return name === _merchant || _merchant.startsWith(name) || name.startsWith(_merchant); });
      }
      if (matched) toAssign.push({ txnId: t.id, payeeId: matched.id, payeeName: matched.name });
    }
    if (!toAssign.length) return;
    Promise.all(toAssign.map(({ txnId, payeeId }) => updateTransaction(txnId, { payee_id: payeeId }).catch(() => {}))).then(() => {
      setTxns(p => (p || []).map(t => { const found = toAssign.find(a => a.txnId === t.id); return found ? { ...t, payee: found.payeeName, payee_id: found.payeeId } : t; }));
    });
  }, [txns?.length, payees?.length]); // eslint-disable-line

  const [bulkCatDD,   setBulkCatDD]   = useState(false);
  const bulkBtnRef                    = useRef(null);
  const [bulkPayeeId, setBulkPayeeId] = useState('');
  const [bulkCatQ,    setBulkCatQ]    = useState('');
  const [bulkBankId,  setBulkBankId]  = useState('');
  const [detailId,    setDetailId]    = useState(null);
  const [showAdd,     setShowAdd]     = useState(false);
  const [newCatDraft, setNewCatDraft] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [rulePrompt,    setRulePrompt]    = useState(null);
  const [justAllocated, setJustAllocated] = useState(new Set());
  const lastClickedIdx  = useRef(null);
  const recentAllocRef  = useRef({});

  useEffect(() => {
    if (defaultAccountTab !== null) { setAccountTab(defaultAccountTab); onClearDefaultTab?.(); }
  }, [defaultAccountTab]); // eslint-disable-line

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !e.target.matches('input,textarea,select')) {
        e.preventDefault();
        setSelected(new Set((window.__ledgerFt || []).map(t => t.id)));
      }
      if (e.key === 'Escape') clearSel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const catsByType = useMemo(() => {
    const g = {}; CAT_TYPE_ORDER.forEach(t => { g[t] = []; });
    (cats || []).forEach(c => { if (g[c.t]) g[c.t].push(c); });
    return g;
  }, [cats]);

  const pendingCatMap = useMemo(() => {
    const unalloc = (txns || []).filter(t => !t.cat && !t._dismissed);
    const map = {};
    runAutoCatRules(unalloc, rules || []).forEach(s => { map[s.txnId] = s; });
    for (const t of unalloc) {
      if (map[t.id]?.sugCat) continue;
      const merchant = extractMerchantName(t.desc || '');
      if (!merchant) continue;
      const est = estimateCategoryForMerchant(merchant, (t.desc || '').toLowerCase(), cats || []);
      if (!est.catId) continue;
      map[t.id] = { txnId: t.id, sugCat: est.catId, sugPayee: merchant, confidence: est.confidence === 'high' ? 'High' : 'Medium', reason: `Merchant: ${merchant}`, fromIntel: true };
    }
    return map;
  }, [txns, rules, cats]);

  const acctBalances = useMemo(() => {
    const map = {};
    (accounts || []).forEach(a => {
      const sum = (txns || []).filter(t => t.account_id === a.id).reduce((s, t) => s + (t.amt ?? 0), 0);
      map[a.id] = (a.opening_balance || 0) + sum;
    });
    return map;
  }, [accounts, txns]);

  const baseFt = useMemo(() => {
    let ft = filterByDateRange(txns || [], dateFrom, dateTo);
    if (accountTab === 'unlinked') ft = ft.filter(t => !t.account_id);
    else if (accountTab)           ft = ft.filter(t => t.account_id === accountTab);
    return ft;
  }, [txns, dateFrom, dateTo, accountTab]);

  const recon = useMemo(() => {
    const total = baseFt.length, matched = baseFt.filter(t => !!t.cat).length;
    const totalIn  = baseFt.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0);
    const totalOut = baseFt.filter(t => t.amt < 0).reduce((s, t) => s + t.amt, 0);
    return { total, matched, unmatched: total - matched, pct: total > 0 ? Math.round(matched / total * 100) : 0, totalIn, totalOut };
  }, [baseFt]);

  let ft = [...baseFt];
  if (allocTab === 'categorised')   ft = ft.filter(t => !!t.cat);
  if (allocTab === 'uncategorised') ft = ft.filter(t => !t.cat);
  if (search)       ft = ft.filter(t => t.desc.toLowerCase().includes(search.toLowerCase()) || (t.payee || '').toLowerCase().includes(search.toLowerCase()) || t.date.includes(search));
  if (typeFilter === 'in')  ft = ft.filter(t => t.amt > 0);
  if (typeFilter === 'out') ft = ft.filter(t => t.amt < 0);
  if (payeeFilter) ft = ft.filter(t => t.payee === payeeFilter);
  ft = [...ft].sort((a, b) => {
    let av, bv;
    if      (sortCol === 'date')  { av = a.date || '';  bv = b.date || ''; }
    else if (sortCol === 'desc')  { av = (a.desc || a.description || '').toLowerCase(); bv = (b.desc || b.description || '').toLowerCase(); }
    else if (sortCol === 'payee') { av = (a.payee || '').toLowerCase(); bv = (b.payee || '').toLowerCase(); }
    else if (sortCol === 'amt')   { av = a.amt ?? 0;   bv = b.amt ?? 0; }
    else if (sortCol === 'cat')   { av = (catMap[a.cat]?.l || '').toLowerCase(); bv = (catMap[b.cat]?.l || '').toLowerCase(); }
    else                          { av = a.date || '';  bv = b.date || ''; }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  if (typeof window !== 'undefined') window.__ledgerFt = ft;

  const ua            = baseFt.filter(t => !t.cat).length;
  const unlinkedCount = useMemo(() => filterByDateRange(txns || [], dateFrom, dateTo).filter(t => !t.account_id).length, [txns, dateFrom, dateTo]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function allocateCat(txnId, catId) {
    const txn = txns.find(t => t.id === txnId);
    const prev = txn?.cat ? catMap[txn.cat]?.l : null;
    const next = catId ? catMap[catId]?.l : null;
    const pending = pendingCatMap[txnId];
    const sugPayeeName = (!txn?.payee && pending?.sugPayee) ? pending.sugPayee : null;

    // ── Optimistic UI update first — instant feedback ───────────────────────
    setTxns(p => (p || []).map(t => t.id === txnId ? { ...t, cat: catId ?? null, category_id: catId ?? null } : t));

    const updates = { category_id: catId ?? null };
    let newPayeeObj = null;
    if (sugPayeeName) {
      try {
        const col = PALETTE[(payees || []).length % (PALETTE || ['#888']).length];
        newPayeeObj = await upsertPayee(org.id, sugPayeeName, col);
        if (!payees?.find(x => x.name?.toLowerCase() === sugPayeeName.toLowerCase())) setPayees(prev => [...(prev || []), newPayeeObj]);
        updates.payee_id = newPayeeObj.id;
        setTxns(p => (p || []).map(t => t.id === txnId ? { ...t, payee: newPayeeObj.name, payee_id: newPayeeObj.id } : t));
      } catch (e) { console.warn('Payee assign failed:', e.message); }
    }

    updateTransaction(txnId, updates).catch(e => console.warn('updateTxn failed:', e.message));
    if (!catId && txn) { const k = (extractMerchantName(txn.desc || txn.description || '') || '').toLowerCase(); if (k) recordSuppression(SUPPRESS_KEY_CAT, k); }
    logAudit({ orgId: org.id, userId: user?.id, transaction: txn, action: catId ? 'category_changed' : 'unallocated', changedFields: { category: { from: prev ?? 'Unallocated', to: next ?? 'Unallocated' } } }).catch(() => {});
    if (catId) {
      const cat = catMap[catId], acct = txn?.account_id ? (accounts || []).find(a => a.id === txn.account_id) : null;
      postCategoryJournal(org.id, txn ?? { id: txnId, date: '', desc: '', amt: 0 }, cat, acct)
        .then(entry => { if (entry) setTxns(p => (p || []).map(t => t.id === txnId ? { ...t, journal_entry_id: entry.id } : t)); })
        .catch(e => console.warn('Journal post failed:', e.message));
    }
    if (catId && allocTab === 'uncategorised') {
      setJustAllocated(p => new Set([...p, txnId]));
      setTimeout(() => setJustAllocated(p => { const n = new Set(p); n.delete(txnId); return n; }), 2500);
    }
    if (catId && txn && !getSessionPref('suppress_rule_prompt')) {
      const key = txn.desc.toLowerCase().slice(0, 20), tr = recentAllocRef.current;
      if (!tr[key]) tr[key] = { catId, count: 0 };
      if (tr[key].catId === catId) {
        tr[key].count++;
        const noRule = !(rules || []).some(r => txn.desc.toLowerCase().includes(r.keyword?.toLowerCase()) && r.catId === catId);
        if (tr[key].count >= 2 && noRule && !rulePrompt) {
          setRulePrompt({ desc: txn.desc, catId, catLabel: next, keyword: (() => {
            // Extract meaningful keyword: up to 4 words, strip reference codes
            const words = txn.desc.trim().split(/\s+/);
            return words.slice(0, Math.min(4, words.length)).filter((w, i) => i === 0 || !(/[0-9#]/.test(w) || w.length > 12)).join(' ').toLowerCase();
          })() });
        }
      } else { tr[key] = { catId, count: 1 }; }
    }
  }

  async function allocatePayee(txnId, payeeObj) {
    const txn = txns.find(t => t.id === txnId);
    if (!payeeObj && txn) { const k = (extractMerchantName(txn.desc || txn.description || '') || '').toLowerCase(); if (k) recordSuppression(SUPPRESS_KEY_PAYEE, k); }
    setTxns(p => (p || []).map(t => t.id === txnId ? { ...t, payee: payeeObj?.name ?? '', payee_id: payeeObj?.id ?? null } : t));
    updateTransaction(txnId, { payee_id: payeeObj?.id ?? null }).catch(() => {});
    if (txn) logAudit({ orgId: org.id, userId: user?.id, transaction: txn, action: 'payee_changed', changedFields: { payee: { from: txn.payee || 'None', to: payeeObj?.name || 'None' } } }).catch(() => {});
  }

  async function handleCreateCat(label) {
    if (label.startsWith('__code__:')) {
      const code = label.replace('__code__:', '');
      if (code.includes('/')) {
        const [parentCode] = code.split('/');
        const parentAcc = (cats || []).find(c => c.code === parentCode && c.is_active !== false);
        return new Promise(resolve => setNewCatDraft({ label: '', code, parentAcc, suffix: code.split('/')[1], isSub: true, resolve }));
      }
      return new Promise(resolve => setNewCatDraft({ label: '', code, resolve }));
    }
    return new Promise(resolve => setNewCatDraft({ label: label.trim(), resolve }));
  }

  function suggestAccountCode(type, label) {
    const TYPE_RANGES = { asset: [100, 399], liability: [400, 599], equity: [600, 699], income: [700, 799], expense: [800, 998] };
    const [lo, hi] = TYPE_RANGES[type] || [800, 998];
    const used = new Set((cats || []).filter(c => c.code && !c.code.includes('/')).map(c => parseInt(c.code)).filter(n => !isNaN(n)));
    if (!label?.trim()) { for (let n = lo; n <= hi; n++) { if (!used.has(n)) return String(n); } return null; }
    const peers = (cats || []).filter(c => c.t === type && c.is_active !== false && c.code && !c.code.includes('/')).sort((a, b) => (a.l || '').localeCompare(b.l || ''));
    const insertIdx = peers.findIndex(p => (p.l || '').toLowerCase() > label.toLowerCase());
    const insertPos = insertIdx === -1 ? peers.length : insertIdx;
    const rangeSize = hi - lo + 1;
    const idealNum  = lo + Math.round((insertPos / (peers.length + 1)) * rangeSize);
    for (let delta = 0; delta <= rangeSize; delta++) {
      if (!used.has(idealNum + delta) && idealNum + delta <= hi) return String(idealNum + delta);
      if (!used.has(idealNum - delta) && idealNum - delta >= lo) return String(idealNum - delta);
    }
    return null;
  }

  async function confirmCreateCat(type) {
    if (!newCatDraft) return;
    const { label, code: draftCode, parentAcc, isSub, resolve } = newCatDraft;
    setNewCatDraft(null);
    const effectiveType = isSub && parentAcc ? parentAcc.t : type;
    const code = draftCode || suggestAccountCode(effectiveType, label);
    const payload = { label, type: effectiveType, account_group: label, colour: parentAcc?.col || PALETTE[(cats || []).length % PALETTE.length] || '#888780', sort_order: parseInt(code) || (cats || []).length, code, parent_id: parentAcc?.id || null };
    try {
      const created = await createCategoryWithCode(org.id, payload);
      const norm = { ...created, l: created.label, t: created.type, col: created.colour, ac: created.account_group, code: created.code || null, is_active: true, parent_id: created.parent_id || null };
      setCats(prev => [...(prev || []), norm]);
      toast(`Account "${label}" created${code ? ` (${code})` : ''}.`);
      resolve(norm);
    } catch (e) { toast('Could not create account: ' + e.message); resolve(null); }
  }

  async function saveDesc(txnId, desc) {
    await updateTransaction(txnId, { description: desc });
    setTxns(p => (p || []).map(t => t.id === txnId ? { ...t, desc, description: desc } : t));
  }

  async function bulkAssignBank(accountId) {
    if (!accountId || selected.size === 0) return;
    const ids = [...selected];
    await Promise.all(ids.map(id => updateTransaction(id, { account_id: accountId })));
    setTxns(p => (p || []).map(t => selected.has(t.id) ? { ...t, account_id: accountId } : t));
    setSelected(new Set()); setBulkBankId('');
    toast(`${ids.length} transactions assigned to ${(accounts || []).find(a => a.id === accountId)?.name || 'account'}.`);
  }

  async function bulkAllocate(catId) {
    if (selected.size === 0) return;
    const ids = [...selected];
    const isUnassign = !catId;
    const updates = { category_id: catId || null };
    let payeeObj = null;
    if (!isUnassign && bulkPayeeId) { payeeObj = (payees || []).find(p => p.id === bulkPayeeId) || null; if (payeeObj) updates.payee_id = payeeObj.id; }
    await Promise.all(ids.map(id => updateTransaction(id, updates)));
    setTxns(p => (p || []).map(t => selected.has(t.id) ? { ...t, cat: catId ?? null, category_id: catId ?? null, payee: isUnassign ? '' : (payeeObj?.name ?? t.payee), payee_id: isUnassign ? null : (payeeObj?.id ?? t.payee_id) } : t));
    setSelected(new Set()); setBulkCatDD(false); setBulkPayeeId(''); setBulkCatQ('');
    toast(`${ids.length} transaction${ids.length > 1 ? 's' : ''} → ${isUnassign ? 'Unassigned' : catMap[catId]?.l}.`);
    if (!isUnassign) {
      const cat = catMap[catId];
      Promise.all((txns || []).filter(t => ids.includes(t.id)).map(txn => {
        const acct = txn.account_id ? (accounts || []).find(a => a.id === txn.account_id) : null;
        return postCategoryJournal(org.id, txn, cat, acct).catch(e => console.warn('Bulk journal failed:', e.message));
      }));
    }
  }

  function requestDelete(e, txn) { e.stopPropagation(); setPendingDelete(txn); }
  async function confirmDelete() {
    const txn = pendingDelete; setPendingDelete(null);
    await logAudit({ orgId: org.id, userId: user?.id, transaction: txn, action: 'deleted' });
    await deleteTransaction(txn.id);
    setTxns(p => (p || []).filter(t => t.id !== txn.id));
    toast('Transaction deleted.');
  }

  async function acceptRule() {
    const { keyword, catId, catLabel } = rulePrompt;
    try {
      const r = await createRule(org.id, { keyword, category_id: catId, payee_name: '', sort_order: (rules || []).length });
      setRules(p => [...(p || []), { ...r, catId: r.category_id, keyword: r.keyword, payee: r.payee_name || '' }]);
      toast(`Rule: "${keyword}" → ${catLabel}`);
    } catch (e) { toast('Could not save: ' + e.message); }
    setRulePrompt(null);
  }

  function toggleSelect(e, id) {
    e.stopPropagation();
    const idx = ft.findIndex(t => t.id === id);
    if (e.shiftKey && lastClickedIdx.current !== null) {
      const lo = Math.min(lastClickedIdx.current, idx), hi = Math.max(lastClickedIdx.current, idx);
      setSelected(p => { const n = new Set(p); for (let i = lo; i <= hi; i++) n.add(ft[i].id); return n; });
    } else {
      setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
      lastClickedIdx.current = idx;
    }
  }
  function selectAll() { setSelected(new Set(ft.map(t => t.id))); }
  function clearSel()  { setSelected(new Set()); }
  function switchAccount(id) { setAccountTab(id); clearSel(); setAllocTab('all'); }

  return (
    <>
      <PeriodBar />

      <div className="card" style={{ marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: 'none' }}>
        <TransactionFilters
          accounts={accounts} txns={txns} dateFrom={dateFrom} dateTo={dateTo}
          accountTab={accountTab} switchAccount={switchAccount} acctBalances={acctBalances} unlinkedCount={unlinkedCount}
          recon={recon}
          allocTab={allocTab} setAllocTab={setAllocTab} ua={ua}
          search={search} setSearch={setSearch} typeFilter={typeFilter} setTypeFilter={setTypeFilter}
          payeeFilter={payeeFilter} setPayeeFilter={setPayeeFilter} payees={payees}
          selected={selected} clearSel={clearSel} selectAll={selectAll} ft={ft}
          bulkCatDD={bulkCatDD} setBulkCatDD={setBulkCatDD} bulkBtnRef={bulkBtnRef}
          bulkPayeeId={bulkPayeeId} setBulkPayeeId={setBulkPayeeId}
          bulkCatQ={bulkCatQ} setBulkCatQ={setBulkCatQ}
          bulkBankId={bulkBankId} setBulkBankId={setBulkBankId}
          cats={cats} catsByType={catsByType}
          bulkAllocate={bulkAllocate} bulkAssignBank={bulkAssignBank}
          setShowAdd={setShowAdd}
        />

        {/* Account info banner */}
        {accountTab && accountTab !== 'unlinked' && (() => {
          const a = (accounts || []).find(x => x.id === accountTab); if (!a) return null;
          const bal = acctBalances[a.id] ?? 0, isCC = a.type === 'credit_card';
          return (
            <div style={{ padding: '6px 14px', background: `${a.colour || '#888'}12`, borderBottom: '0.5px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: a.colour || '#888', display: 'inline-block' }} />
              <strong>{a.name}</strong>
              <span style={{ color: 'var(--stone)', textTransform: 'capitalize' }}>{a.type.replace('_', ' ')}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 500 }} className={isCC ? (bal > 0 ? 'vn' : 'vp') : (bal >= 0 ? '' : 'vn')}>
                {isCC ? `${fmt(Math.abs(bal))} owed` : `Balance: ${fmt(bal)}`}
              </span>
            </div>
          );
        })()}

        {/* Table */}
        <table style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 32 }} />
            <col style={{ width: 82 }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 90 }} />
            {accountTab === null && <col style={{ width: 100 }} />}
            <col style={{ width: 70 }} />
            <col style={{ width: 28 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ width:36, padding:'0 0 0 10px', verticalAlign:'middle', textAlign:'left' }}>
                <input type="checkbox" checked={ft.length > 0 && ft.every(t => selected.has(t.id))} onChange={e => e.target.checked ? selectAll() : setSelected(new Set())} style={{ cursor: 'pointer', display: 'block' }} />
              </th>
              {[['date', 'Date'], ['desc', 'Description'], ['payee', 'Payee'], ['cat', 'Account'], ['amt', 'Amount']].map(([col, label]) => (
                <th key={col} onClick={() => toggleSort(col)} className={col === 'amt' ? 'tr' : undefined} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                  {label}
                  <span style={{ marginLeft: 4, fontSize: 9, opacity: sortCol === col ? 0.9 : 0.3 }}>{sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                </th>
              ))}
              {accountTab === null && <th>Bank</th>}
              <th style={{ textAlign: 'center' }}>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ft.map(t => (
              <TransactionRow
                key={t.id}
                t={t}
                cats={cats} catMap={catMap} payees={payees} setPayees={setPayees}
                accounts={accounts} accountTab={accountTab}
                pendingCatMap={pendingCatMap} justAllocated={justAllocated} selected={selected}
                allocateCat={allocateCat} allocatePayee={allocatePayee}
                saveDesc={saveDesc} handleCreateCat={handleCreateCat}
                toggleSelect={toggleSelect} requestDelete={requestDelete} setDetailId={setDetailId}
                org={org} PALETTE={PALETTE}
              />
            ))}
            {ft.length === 0 && (
              <tr><td colSpan={accountTab === null ? 9 : 8} style={{ textAlign: 'center', padding: 24, color: 'var(--stone)' }}>
                {accountTab === 'unlinked' ? 'No unlinked transactions — all transactions are assigned to a bank account.'
                  : accountTab && baseFt.length === 0 ? 'No transactions linked to this account.'
                  : 'No transactions match your filters.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create-category modal */}
      {newCatDraft && (
        <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) { newCatDraft.resolve(null); setNewCatDraft(null); } }}>
          <div className="modal" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                {newCatDraft.isSub
                  ? `New sub-account /${newCatDraft.suffix} under "${newCatDraft.parentAcc?.l || newCatDraft.code}"`
                  : newCatDraft.code ? `New account — code ${newCatDraft.code}` : 'New account'}
              </h3>
              <button className="btn-ghost" onClick={() => { newCatDraft.resolve(null); setNewCatDraft(null); }}>×</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Account name <span style={{ color: 'var(--rd)' }}>*</span></label>
                <input autoFocus type="text" defaultValue={newCatDraft.label || ''}
                  onChange={e => setNewCatDraft(p => ({ ...p, label: e.target.value }))}
                  placeholder={newCatDraft.isSub ? `e.g. ${newCatDraft.parentAcc?.l || 'Sub-account'} — Division` : 'e.g. Gym & Fitness'}
                  onKeyDown={e => { if (e.key === 'Enter' && newCatDraft.label?.trim()) { if (newCatDraft.isSub && newCatDraft.parentAcc) confirmCreateCat(newCatDraft.parentAcc.t); else confirmCreateCat('expense'); } }}
                />
              </div>
              {newCatDraft.isSub && newCatDraft.parentAcc && (
                <div style={{ padding: '8px 12px', background: 'var(--gnb)', borderRadius: 'var(--rr)', fontSize: 12, color: 'var(--gn)', marginBottom: 14 }}>
                  Sub-account of <strong>{newCatDraft.parentAcc.l}</strong> · type: <strong>{newCatDraft.parentAcc.t}</strong> · code: <strong>{newCatDraft.code}</strong>
                </div>
              )}
              {newCatDraft.isSub ? (
                <button className="btn btn-a" style={{ width: '100%' }} disabled={!newCatDraft.label?.trim()} onClick={() => newCatDraft.label?.trim() && confirmCreateCat(newCatDraft.parentAcc?.t || 'expense')}>Create sub-account</button>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 10 }}>Choose account type:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[['expense', 'Expense', 'Money going out — food, bills, transport'], ['income', 'Income', 'Money coming in — salary, freelance'], ['asset', 'Asset', 'Things you own — investments, savings'], ['liability', 'Liability', 'Money you owe — loans, credit cards'], ['equity', 'Equity', 'Net worth, retained earnings']].map(([type, label, desc]) => {
                      const sugCode = newCatDraft.code || suggestAccountCode(type, newCatDraft?.label);
                      return (
                        <button key={type} className="btn" disabled={!newCatDraft.label?.trim()} onClick={() => newCatDraft.label?.trim() && confirmCreateCat(type)} style={{ textAlign: 'left', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, opacity: newCatDraft.label?.trim() ? 1 : 0.45 }}>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: 500, fontSize: 12.5 }}>{label}</span>
                            <span style={{ fontSize: 11, color: 'var(--stone)', fontWeight: 400 }}>{desc}</span>
                          </div>
                          {sugCode && <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--stone)', flexShrink: 0 }}>{sugCode}</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <div className="modal-foot" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={() => { newCatDraft.resolve(null); setNewCatDraft(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {detailId !== null && <TransactionModal txnId={detailId} onClose={() => setDetailId(null)} />}
      {showAdd && <AddTransactionModal onClose={() => setShowAdd(false)} />}
      <DeleteToast txn={pendingDelete} onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} />
      {rulePrompt && (
        <MakeRulePrompt desc={rulePrompt.desc} catLabel={rulePrompt.catLabel}
          onAccept={acceptRule} onDismiss={() => setRulePrompt(null)}
          onNeverShow={() => { setSessionPref('suppress_rule_prompt', true); setRulePrompt(null); }} />
      )}
    </>
  );
}
