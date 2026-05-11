/**
 * views/Banking/Transactions/index.jsx
 * Page orchestrator — state, handlers, data flow.
 * UI is delegated to TransactionFilters, TransactionRow, and overlay components.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../../context/AppContext';
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
          accounts, journals, setJournals, dateFrom, dateTo, toast, org, user, PALETTE,
          refreshData } = useApp();

  const [accountTab,    setAccountTab]    = useState(defaultAccountTab);
  const [allocTab,      setAllocTab]      = useState('all');
  const [search,        setSearch]        = useState('');
  const [typeFilter,    setTypeFilter]    = useState('');
  const [payeeFilter,   setPayeeFilter]   = useState('');
  const [selected,      setSelected]      = useState(new Set());
  const [compactView,   setCompactView]   = useState(true);   // Reconcile tab view mode
  const [showFilter,    setShowFilter]    = useState(false);  // Filter panel open
  // Local date range — only active when filter is open and user sets dates
  const [localDateFrom, setLocalDateFrom] = useState('');
  const [localDateTo,   setLocalDateTo]   = useState('');
  const [sortCol,     setSortCol]     = useState('date');
  const [sortDir,     setSortDir]     = useState('desc');

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir(col === 'date' ? 'desc' : 'asc'); }
  }

  // Auto-assign payees from description matching — runs once per session on mount.
  // Sequential (not parallel) to avoid overwhelming the browser connection pool.
  const autoPayeeRanRef = useRef(false);
  useEffect(() => {
    if (autoPayeeRanRef.current) return;
    if (!txns?.length || !payees?.length) return;
    autoPayeeRanRef.current = true;

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

    // Apply optimistically to UI immediately — no network wait
    setTxns(p => (p || []).map(t => {
      const found = toAssign.find(a => a.txnId === t.id);
      return found ? { ...t, payee: found.payeeName, payee_id: found.payeeId } : t;
    }));

    // Persist to DB in small sequential batches to avoid connection exhaustion
    (async () => {
      const BATCH = 5;
      for (let i = 0; i < toAssign.length; i += BATCH) {
        const chunk = toAssign.slice(i, i + BATCH);
        await Promise.allSettled(
          chunk.map(({ txnId, payeeId }) => updateTransaction(txnId, { payee_id: payeeId }).catch(() => {}))
        );
        // Small pause between batches
        if (i + BATCH < toAssign.length) await new Promise(r => setTimeout(r, 50));
      }
    })();
  }, []); // eslint-disable-line

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
  const journalTimers   = useRef({}); // debounce rapid re-categorisation

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
      const ob  = parseFloat(a.opening_balance) || 0;
      const isCC = a.type === 'credit_card' || a.type === 'loan';
      if (isCC) {
        // CC: opening_balance = amount owed at statement start (positive = owed)
        // Spending transactions are negative (reduce your bank balance → increase CC debt)
        // Current owed = opening_owed + (-sum_of_txns)  (spending is negative, so -negative = positive debt)
        map[a.id] = ob - sum; // sum is negative for spending → -sum is positive = more owed
      } else {
        // Asset account: balance = opening + transactions (spending negative, deposits positive)
        map[a.id] = ob + sum;
      }
    });
    return map;
  }, [accounts, txns]);

  const baseFt = useMemo(() => {
    // If local date filter set, use it; otherwise show ALL transactions (no date limit)
    let ft = (localDateFrom && localDateTo)
      ? filterByDateRange(txns || [], localDateFrom, localDateTo)
      : (txns || []);
    if (accountTab === 'unlinked') ft = ft.filter(t => !t.account_id);
    else if (accountTab)           ft = ft.filter(t => t.account_id === accountTab);
    return ft;
  }, [txns, localDateFrom, localDateTo, accountTab]);

  const recon = useMemo(() => {
    const total = baseFt.length, matched = baseFt.filter(t => !!t.cat).length;
    const totalIn  = baseFt.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0);
    const totalOut = baseFt.filter(t => t.amt < 0).reduce((s, t) => s + t.amt, 0);
    return { total, matched, unmatched: total - matched, pct: total > 0 ? Math.round(matched / total * 100) : 0, totalIn, totalOut };
  }, [baseFt]);

  let ft = [...baseFt];
  // Reconcile: needs categorisation
  if (allocTab === 'uncategorised') ft = ft.filter(t => !t.cat);
  // Bank Statements: all imported bank transactions (reconciled + unreconciled)
  if (allocTab === 'categorised')   ft = ft.filter(t => t.imported || !!t.account_id);
  // Account Transactions ('all'): no extra filter — shows everything
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
  const showBalance = allocTab === 'categorised'; // Balance column only on Bank Statements

  // Running balance: computed from ALL transactions for each account (not just the filtered set).
  // This ensures the balance is correct even when viewing a filtered subset (Bank Statements tab).
  // We compute the cumulative balance for every txn in allTxns, oldest→newest, then display
  // the balance for each txn in ft by looking it up in the map.
  const runningBal = (() => {
    if (!showBalance) return {};
    const map = {};
    // Group ALL txns by account (not just ft — so balance is correct even in filtered views)
    const allByAcct = {};
    (txns || []).forEach(t => {
      if (!t.account_id) return;
      if (!allByAcct[t.account_id]) allByAcct[t.account_id] = [];
      allByAcct[t.account_id].push(t);
    });
    Object.entries(allByAcct).forEach(([acctId, acctTxns]) => {
      const acct  = (accounts || []).find(a => a.id === acctId);
      const ob    = parseFloat(acct?.opening_balance) || 0;
      const isCC  = acct?.type === 'credit_card' || acct?.type === 'loan';
      // Sort ALL account txns chronologically oldest first
      const ordered = [...acctTxns].sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        return d !== 0 ? d : (a.id < b.id ? -1 : 1); // stable secondary sort
      });
      let running = ob; // start from opening balance
      ordered.forEach(t => {
        const amt = t.amt ?? 0;
        // CC: spending (negative amt) means more owed → running - amt (subtracting negative = adding)
        // Asset: deposits positive, spending negative → running + amt
        running = isCC ? running - amt : running + amt;
        map[t.id] = running;
      });
    });
    // Mark any txn without an account as null
    ft.forEach(t => { if (!(t.id in map)) map[t.id] = null; });
    return map;
  })();

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
      // Debounce rapid re-categorisation: cancel pending journal post for this txn
      if (journalTimers.current[txnId]) clearTimeout(journalTimers.current[txnId]);
      journalTimers.current[txnId] = setTimeout(() => {
        delete journalTimers.current[txnId];
        postCategoryJournal(org.id, txn ?? { id: txnId, date: '', desc: '', amt: 0 }, cat, acct)
          .then(entry => {
            if (entry) {
              // Update transaction with the journal entry id
              setTxns(p => (p || []).map(t => t.id === txnId ? { ...t, journal_entry_id: entry.id } : t));
              // Refresh journals so GL and Journals view update without reload
              import('../../../services/journalService').then(({ fetchJournals }) => {
                fetchJournals(org.id).then(jnls => setJournals(jnls)).catch(() => {});
              });
            }
          })
          .catch(e => console.warn('Journal post failed:', e.message));
      }, 400); // wait 400ms — if user changes category again, the timer resets
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
    // Optimistic update first
    setTxns(p => (p || []).map(t => selected.has(t.id) ? { ...t, account_id: accountId } : t));
    setSelected(new Set()); setBulkBankId('');
    toast(`${ids.length} transactions assigned to ${(accounts || []).find(a => a.id === accountId)?.name || 'account'}.`);
    // Sequential batches to avoid connection exhaustion
    const BATCH = 10;
    for (let i = 0; i < ids.length; i += BATCH) {
      await Promise.allSettled(ids.slice(i, i + BATCH).map(id => updateTransaction(id, { account_id: accountId }).catch(() => {})));
      if (i + BATCH < ids.length) await new Promise(r => setTimeout(r, 50));
    }
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
      // Sequential batches — avoid ERR_INSUFFICIENT_RESOURCES from hundreds of simultaneous PATCHes
      const txnsToPost = (txns || []).filter(t => ids.includes(t.id));
      (async () => {
        const BATCH = 5;
        for (let i = 0; i < txnsToPost.length; i += BATCH) {
          const chunk = txnsToPost.slice(i, i + BATCH);
          await Promise.allSettled(chunk.map(txn => {
            const acct = txn.account_id ? (accounts || []).find(a => a.id === txn.account_id) : null;
            return postCategoryJournal(org.id, txn, cat, acct).catch(e => console.warn('Bulk journal failed:', e.message));
          }));
          if (i + BATCH < txnsToPost.length) await new Promise(r => setTimeout(r, 80));
        }
      })();
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
          allTxns={txns}
          baseFtCount={baseFt.length}
          compactView={compactView}
          setCompactView={setCompactView}
          showFilter={showFilter}
          setShowFilter={setShowFilter}
          localDateFrom={localDateFrom}
          setLocalDateFrom={setLocalDateFrom}
          localDateTo={localDateTo}
          setLocalDateTo={setLocalDateTo}
        />

        {/* Table — two layouts: Xero-style 2-panel (Reconcile, non-compact) vs compact */}
        {(() => {
          const isXero = allocTab === 'uncategorised' && !compactView;
          return (
        <div style={isXero ? { maxWidth: 860, margin: '0 auto' } : {}}>
        <table style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: 36 }} />
            {isXero ? (
              <>
                <col style={{ width: '43%' }} />
                <col />
                <col style={{ width: 28 }} />
              </>
            ) : (
              <>
                <col style={{ width: 82 }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '19%' }} />
                <col style={{ width: 74 }} />
                <col style={{ width: 74 }} />
                {showBalance && <col style={{ width: 78 }} />}
                {accountTab === null && <col style={{ width: 82 }} />}
                <col style={{ width: 58 }} />
                <col style={{ width: 26 }} />
              </>
            )}
          </colgroup>
          <thead>
            <tr>
              <th style={{ padding:'0 0 0 10px', verticalAlign:'middle', textAlign:'left' }}>
                <input type="checkbox" checked={ft.length > 0 && ft.every(t => selected.has(t.id))} onChange={e => e.target.checked ? selectAll() : setSelected(new Set())} style={{ cursor: 'pointer', display: 'block' }} />
              </th>
              {isXero ? (
                // 2-panel: minimal headers
                <>
                  <th style={{ fontWeight: 500, fontSize: 11, color: 'var(--stone)', borderRight: '0.5px solid var(--bd)', paddingLeft: 6 }}>
                    Bank statement line
                  </th>
                  <th style={{ fontWeight: 500, fontSize: 11, color: 'var(--stone)', paddingLeft: 16 }}>
                    Who / What / Why
                  </th>
                  <th />
                </>
              ) : (
                // Compact: full column headers
                <>
                  {[['date', 'Date'], ['desc', 'Description'], ['payee', 'Payee'], ['cat', 'Account']].map(([col, label]) => (
                    <th key={col} onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                      {label}
                      <span style={{ marginLeft: 4, fontSize: 9, opacity: sortCol === col ? 0.9 : 0.3 }}>{sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                    </th>
                  ))}
                  <th className="tr" onClick={() => toggleSort('amt')} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: 'var(--rd)' }}>
                    Spent <span style={{ marginLeft: 3, fontSize: 9, opacity: sortCol === 'amt' ? 0.9 : 0.3 }}>{sortCol === 'amt' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                  </th>
                  <th className="tr" onClick={() => toggleSort('amt')} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: 'var(--gn)' }}>
                    Received <span style={{ marginLeft: 3, fontSize: 9, opacity: 0.3 }}>⇅</span>
                  </th>
                  {showBalance && <th className="tr" style={{ color: 'var(--stone)', whiteSpace: 'nowrap' }}>Balance</th>}
                  {accountTab === null && <th style={{ whiteSpace: 'nowrap' }}>Source</th>}
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Status</th>
                  <th />
                </>
              )}
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
                runningBal={showBalance ? runningBal[t.id] : null}
                showBalance={showBalance}
                compactView={compactView}
                allocTab={allocTab}
              />
            ))}
            {ft.length === 0 && (
              <tr><td colSpan={(accountTab === null ? 1 : 0) + (showBalance ? 1 : 0) + 8} style={{ textAlign: 'center', padding: 24, color: 'var(--stone)' }}>
                {accountTab === 'unlinked' ? 'No unlinked transactions — all transactions are assigned to a bank account.'
                  : accountTab && baseFt.length === 0 ? 'No transactions linked to this account.'
                  : 'No transactions match your filters.'}
              </td></tr>
            )}
          </tbody>
        </table>
        </div>
          );
        })()}
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
