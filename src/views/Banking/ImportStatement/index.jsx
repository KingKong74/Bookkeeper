/**
 * views/Banking/ImportStatement/index.jsx
 * Orchestrator — state, handlers, step routing.
 * UI is delegated to ImportUpload, ImportReviewTable, ImportRuleBuilderModal, CreateAccountModal.
 */
import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../../../context/AppContext';
import {
  bulkImportTransactions, updateBankAccount, createBankAccount,
  getTransactions, savePendingSuggestions, supabase,
} from '../../../lib/supabase';
import { upsertPayee } from '../../../services/categoryService';
import { fmt, analyseImportedTransactions, extractPayeeCandidate, estimateCategoryForMerchant } from '../../../utils/helpers';
import { extractMerchantName } from '../../../utils/merchant.js';

import { parseFile, fmtAmt } from './importHelpers';
import { ImportUpload }           from './ImportUpload';
import { ImportReviewTable }      from './ImportReviewTable';
import { ImportRuleBuilderModal } from './ImportRuleBuilderModal';
import { CreateAccountModal }     from './CreateAccountModal';

export function ImportStatement({ onNavigate, initialParsedFiles = null, onClearInitial }) {
  const {
    txns, catMap, cats, rules, setRules,
    payees, setPayees, setTxns,
    toast, org, accounts: _accts, setAccounts, PALETTE,
    merchantHints, orgSettings,
  } = useApp();
  const accounts = _accts || [];

  const [step,               setStep]              = useState('upload');
  const [loading,            setLoading]           = useState(false);
  const [loadingMsg,         setLoadingMsg]        = useState('');
  const [selectedAccount,    setSelectedAccount]   = useState('');
  const [parsedFiles,        setParsedFiles]       = useState([]);
  const [excluded,           setExcluded]          = useState(new Set());
  const [newPayeesFound,     setNewPayeesFound]    = useState([]);
  const [showRuleBuilder,    setShowRuleBuilder]   = useState(false);
  const [ruleBuilderSeed,    setRuleBuilderSeed]   = useState([]);
  const [showCreateModal,    setShowCreateModal]   = useState(false);
  const fileRowRefs = useRef({});

  // When launched from sandbox/bank sync, jump straight to review with pre-loaded files
  React.useEffect(() => {
    if (initialParsedFiles && initialParsedFiles.length > 0) {
      setParsedFiles(initialParsedFiles);
      setExcluded(new Set());
      setStep('review');
      if (onClearInitial) onClearInitial(); // clear so back-nav works normally
    }
  }, []); // run once on mount only

  // ── Sort files newest-first ─────────────────────────────────────────────
  const sortedParsedFiles = useMemo(() => {
    return [...parsedFiles].sort((a, b) => {
      const aMax = (a.transactions || []).reduce((m, t) => t.date > m ? t.date : m, '');
      const bMax = (b.transactions || []).reduce((m, t) => t.date > m ? t.date : m, '');
      return bMax.localeCompare(aMax);
    });
  }, [parsedFiles]);

  const allTransactions = useMemo(() => {
    const out = [];
    sortedParsedFiles.forEach((pf, fi) => {
      const sorted = [...(pf.transactions || [])].sort((a, b) => b.date.localeCompare(a.date));
      // Inherit file-level _accountId if not already set on txn (bank-feed imports)
      sorted.forEach((t, ti) => out.push({
        ...t,
        _accountId: t._accountId ?? pf._accountId ?? null,
        _file: pf.filename, _fileIdx: fi, _rowIdx: ti, _key: `${fi}:${ti}`
      }));
    });
    return out;
  }, [sortedParsedFiles]);

  // ── Auto-cat intelligence ───────────────────────────────────────────────
  const { autoCatMap, smartOpportunities } = useMemo(() => {
    if (!allTransactions.length) return { autoCatMap: {}, smartOpportunities: { suggestions: [], newPayees: [], ruleOpportunities: [] } };
    const adapted = allTransactions.map(t => ({ id: t._key, cat: null, desc: t.desc, amt: t.amt, date: t.date, payee: '' }));
    const analysis = analyseImportedTransactions(adapted, rules || [], {}, payees || [], cats || [], merchantHints || []);
    const map = {};
    analysis.suggestions.forEach(s => { map[s.txnId] = s; });
    for (const t of allTransactions) {
      if (map[t._key]?.sugCat) continue;
      const merchant = extractMerchantName(t.desc || '');
      if (!merchant) continue;
      if (orgSettings?.merchantIntelEnabled === false) continue;
      const est = estimateCategoryForMerchant(merchant, (t.desc || '').toLowerCase(), cats || [], merchantHints || []);
      if (!est.catId) continue;
      const payeeCandidate = extractPayeeCandidate(t.desc, payees || []) || merchant;
      map[t._key] = { txnId: t._key, sugCat: est.catId, sugCatLabel: est.catLabel, sugPayee: payeeCandidate, confidence: est.confidence === 'high' ? 'High' : 'Medium', reason: `Merchant: ${merchant}`, fromIntel: true };
    }
    return { autoCatMap: map, smartOpportunities: analysis };
  }, [allTransactions, rules, payees, cats, merchantHints, orgSettings]);

  const fileTransactions = useMemo(() => {
    const groups = sortedParsedFiles.map(() => []);
    allTransactions.forEach(t => { if (!groups[t._fileIdx]) groups[t._fileIdx] = []; groups[t._fileIdx].push(t); });
    return groups;
  }, [allTransactions, sortedParsedFiles]);

  const selectedRows = useMemo(() => allTransactions.filter(t => !excluded.has(t._key)), [allTransactions, excluded]);

  const selectedSummary = useMemo(() => selectedRows.reduce((acc, t) => {
    if (t.amt > 0) { acc.creditCount++; acc.creditTotal += t.amt; }
    else if (t.amt < 0) { acc.debitCount++; acc.debitTotal += t.amt; }
    if (autoCatMap[t._key]?.sugCat) acc.autoCatCount++;
    return acc;
  }, { creditCount: 0, debitCount: 0, creditTotal: 0, debitTotal: 0, autoCatCount: 0 }), [selectedRows, autoCatMap]);

  const selectedCountByFile = useMemo(
    () => fileTransactions.map(ft => ft.filter(t => !excluded.has(t._key)).length),
    [fileTransactions, excluded]
  );

  // ── Handlers ───────────────────────────────────────────────────────────
  async function handleFiles(files) {
    if (!files?.length) return;
    setLoading(true); setExcluded(new Set());
    const results = await Promise.all(Array.from(files).map(f => parseFile(f, txns)));
    setParsedFiles(results);
    setStep('review');
    setLoading(false);
  }

  function addMoreFiles() { document.getElementById('import-file-in-more').click(); }
  function toggleRow(key)  { setExcluded(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; }); }
  function toggleFile(fi)  {
    const keys = (fileTransactions[fi] || []).map(t => t._key);
    const allEx = keys.every(k => excluded.has(k));
    setExcluded(p => { const n = new Set(p); if (allEx) keys.forEach(k => n.delete(k)); else keys.forEach(k => n.add(k)); return n; });
  }
  function toggleAll(on)   { setExcluded(on ? new Set() : new Set(allTransactions.map(t => t._key))); }
  function reset()         { setStep('upload'); setParsedFiles([]); setExcluded(new Set()); setNewPayeesFound([]); }
  function removeFile(fi)  {
    const keys = new Set((fileTransactions[fi] || []).map(t => t._key));
    setParsedFiles(prev => prev.filter((_, i) => i !== fi));
    setExcluded(prev => { const n = new Set(prev); keys.forEach(k => n.delete(k)); return n; });
  }

  async function doImport(acctId) {
    const accountId = acctId || selectedAccount;
    // Check if this is a bank-feed import (each file has _accountId already set)
    const isBankFeed = parsedFiles.every(pf => pf._accountId);
    if (!accountId && !isBankFeed) { setShowCreateModal(true); return; }
    if (!org) { toast('No organisation found.'); return; }
    setLoading(true); setLoadingMsg('Preparing…');
    try {
      // Resolve payees
      const payeeIds = {};
      const sugPayeeNames = [...new Set(selectedRows.map(t => autoCatMap[t._key]?.sugPayee).filter(Boolean))];
      const newNames = sugPayeeNames.filter(name => !(payees || []).find(p => p.name.toLowerCase() === name.toLowerCase()));
      sugPayeeNames.forEach(name => {
        const ex = (payees || []).find(p => p.name.toLowerCase() === name.toLowerCase());
        if (ex) payeeIds[name] = ex.id;
      });
      if (newNames.length) {
        const created = await Promise.all(newNames.map((name, i) => upsertPayee(org.id, name, (PALETTE || [])[i % (PALETTE || ['#888']).length] || '#888')));
        created.forEach((p, i) => { payeeIds[newNames[i]] = p.id; setPayees(prev => prev.find(x => x.id === p.id) ? prev : [...prev, p]); });
      }

      if (!selectedRows.length) { toast('No transactions selected.'); return; }
      setLoadingMsg(`Importing ${selectedRows.length} transaction${selectedRows.length !== 1 ? 's' : ''}…`);

      const isBankFeed = parsedFiles.some(pf => pf.fileType === 'bank_feed');
      let parts = [];

      if (isBankFeed) {
        // Bank-feed: approve pending_import txns in DB (set pending_import = false)
        // and optionally update their category/payee from auto-cat suggestions
        const updates = selectedRows.map(t => {
          const sug = autoCatMap[t._key];
          return {
            id: t.id,  // bank-feed txns already have a DB id
            pending_import: false,
            category_id: sug?.sugCat && !sug?.fromIntel ? sug.sugCat : (t.cat || null),
            payee_id: sug?.sugPayee && !sug?.fromIntel ? (payeeIds[sug.sugPayee] || null) : null,
          };
        }).filter(u => u.id); // safety: only update rows with a real id

        if (updates.length) {
          // Approve in batches of 50
          for (let i = 0; i < updates.length; i += 50) {
            const batch = updates.slice(i, i + 50);
            await Promise.all(batch.map(u =>
              supabase.from('transactions').update({
                pending_import: false,
                ...(u.category_id ? { category_id: u.category_id } : {}),
                ...(u.payee_id    ? { payee_id:    u.payee_id    } : {}),
              }).eq('id', u.id)
            ));
          }
        }
        parts = [`Approved ${updates.length} transaction${updates.length !== 1 ? 's' : ''} from bank feed`];
      } else {
        // File import: insert new transactions
        const toImport = selectedRows.map(t => {
          const sug = autoCatMap[t._key];
          const txnAccountId = t._accountId || accountId;
          return {
            date: t.date, desc: t.desc, amt: t.amt,
            cat:      sug?.sugCat && !sug?.fromIntel ? sug.sugCat : (t.cat || null),
            payee_id: sug?.sugPayee && !sug?.fromIntel ? (payeeIds[sug.sugPayee] || null) : null,
            note: t.note, account_id: txnAccountId,
          };
        });
        const { inserted, linked, skipped } = await bulkImportTransactions(org.id, toImport);
        parts = [`Imported ${inserted} transaction${inserted !== 1 ? 's' : ''}`];
        if (linked)  parts.push(`${linked} existing linked to account`);
        if (skipped) parts.push(`${skipped} duplicates skipped`);
      }

      // Update opening balance from earliest parsed statement
      // For CC/loan: openingBalance from statement is amount owed (positive) — store as-is
      // For assets: openingBalance from statement is account value — store as-is
      // Only update if this statement is EARLIER than the current opening_date
      const summaries = parsedFiles.map(pf => pf.summary).filter(s => s?.openingBalance != null && s.periodStart);
      if (summaries.length) {
        const earliest = summaries.reduce((best, s) => !best || s.periodStart < best.periodStart ? s : best, null);
        try {
          const acct = accounts.find(a => a.id === accountId);
          if (acct && earliest && (!acct.opening_date || earliest.periodStart < acct.opening_date)) {
            // Store opening balance with correct sign:
            // CC/loan: statement opening = amount owed (positive) → store as positive
            // Asset: statement opening = account value → store as-is
            const openingToStore = earliest.openingBalance;
            const updated = await updateBankAccount(accountId, {
              opening_balance: openingToStore,
              opening_date:    earliest.periodStart,
            });
            if (updated && setAccounts) setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, ...updated } : a));
            parts.push(`Opening balance set to ${Math.abs(openingToStore).toFixed(2)}`);
          }
        } catch (e) { console.warn('Opening balance update failed:', e.message); }
      }

      toast(parts.join(' · ') + '.');
      const fresh = await getTransactions(org.id, '2000-01-01', '2099-12-31');
      setTxns(fresh.map(t => ({ ...t, cat: t.category_id ?? null, desc: t.description ?? '', amt: parseFloat(t.amount) ?? 0, payee: t.payees?.name ?? t.payee ?? '', note: t.note ?? '' })));

      const intelSugs = Object.values(autoCatMap).filter(s => s.fromIntel && s.sugCat);
      if (intelSugs.length) savePendingSuggestions(org.id, intelSugs).catch(() => {});

      onNavigate('transactions');
    } catch (e) { toast('Import failed: ' + e.message); }
    finally { setLoading(false); }
  }

  async function handleCreateAccount(form) {
    const created = await createBankAccount(org.id, {
      name: form.name.trim(), type: form.type, colour: form.colour,
      currency: 'AUD', opening_balance: 0, sort_order: accounts.length,
    });
    setAccounts(prev => [...(prev || []), created]);
    setSelectedAccount(created.id);
    setShowCreateModal(false);
    await doImport(created.id);
  }

  // ── Upload step ─────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <ImportUpload
        accounts={accounts}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        onFiles={handleFiles}
        loading={loading}
        onNavigate={onNavigate}
      />
    );
  }

  // ── Review step ─────────────────────────────────────────────────────────
  const totalFiles = sortedParsedFiles.length;
  const errorFiles = sortedParsedFiles.filter(p => p.error);

  return (
    <div>
      {/* Loading overlay */}
      {loading && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,10,5,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 18 }}>
          <div style={{ width: 44, height: 44, border: '4px solid rgba(255,255,255,0.2)', borderTop: '4px solid #fff', borderRadius: '50%', animation: 'ledger-spin 0.8s linear infinite' }} />
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{loadingMsg || 'Importing…'}</div>
          <style>{'@keyframes ledger-spin { to { transform: rotate(360deg); } }'}</style>
        </div>
      )}

      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            {totalFiles} file{totalFiles !== 1 ? 's' : ''} parsed
            {errorFiles.length > 0 && <span style={{ marginLeft: 8, color: 'var(--rd)', fontSize: 12 }}> · {errorFiles.length} failed</span>}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--stone)', marginBottom: 10 }}>
            {selectedRows.length} of {allTransactions.length} transactions selected
          </div>
          {/* Account selector — hidden for bank-feed imports (each file has its own account) */}
          {!parsedFiles.every(pf => pf._accountId) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Import to account:</label>
              {accounts.length === 0
                ? <span style={{ fontSize: 12, color: 'var(--stone)' }}>Transactions will be unlinked.</span>
                : <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
                    style={{ padding: '5px 10px', fontSize: 12.5, border: '0.5px solid var(--bd2)', borderRadius: 'var(--rr)', color: 'var(--ink)', fontFamily: 'var(--font-sans)', minWidth: 220 }}>
                    <option value="">— No account (unlinked) —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type.replace('_', ' ')})</option>)}
                  </select>
              }
              {selectedAccount && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--al)', color: 'var(--a2)', fontWeight: 500 }}>✓ {accounts.find(a => a.id === selectedAccount)?.name}</span>}
            </div>
          )}
          {parsedFiles.every(pf => pf._accountId) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--stone)', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.05em' }}>Accounts:</span>
              {[...new Set(parsedFiles.map(pf => pf.filename))].map(name => (
                <span key={name} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--al)', color: 'var(--a2)', fontWeight: 500 }}>{name}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <button className="btn" onClick={reset}>← Change files</button>
          <button className="btn btn-sm" onClick={addMoreFiles}>+ Add more</button>
          <button className="btn btn-a" onClick={() => doImport()} disabled={loading || selectedRows.length === 0}>
            {loading ? 'Importing…' : `Import ${selectedRows.length} transaction${selectedRows.length !== 1 ? 's' : ''}`}
          </button>
        </div>

        {/* Hidden input for adding more files */}
        <input type="file" id="import-file-in-more" multiple accept=".csv,.pdf"
          style={{ display: 'none' }}
          onChange={async e => {
            const newResults = await Promise.all(Array.from(e.target.files).map(f => parseFile(f, txns)));
            setParsedFiles(prev => {
              const names = new Set(prev.map(p => p.filename));
              return [...prev, ...newResults.filter(r => !names.has(r.filename))];
            });
            setExcluded(new Set());
            e.target.value = '';
          }} />
      </div>

      {/* File summary cards */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {sortedParsedFiles.map((pf, fi) => {
          const fileTxns    = fileTransactions[fi] || [];
          const fileExcluded = fileTxns.every(t => excluded.has(t._key));
          const filePartial  = !fileExcluded && fileTxns.some(t => excluded.has(t._key));
          return (
            <div key={fi}
              onClick={() => fileRowRefs.current[fi]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{ border: '0.5px solid var(--bd)', borderRadius: 'var(--rr)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 200, cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--a)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--bd)'}
            >
              <input type="checkbox" checked={!fileExcluded} onChange={() => toggleFile(fi)} style={{ cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pf.filename}</div>
                <div style={{ fontSize: 11, color: 'var(--stone)', marginTop: 1 }}>
                  {pf.error ? <span style={{ color: 'var(--rd)' }}>⚠ {pf.error}</span> : `${fileTxns.length} transactions${filePartial ? ' (partial)' : ''}`}
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); removeFile(fi); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--stone)', fontSize: 14, padding: 0, flexShrink: 0 }}>×</button>
            </div>
          );
        })}
      </div>

      {/* Repeating pattern banner */}
      {smartOpportunities.ruleOpportunities.length > 0 && (
        <div style={{ marginBottom: 10, padding: '10px 14px', background: 'var(--al)', borderRadius: 'var(--rl)', border: '0.5px solid rgba(186,117,23,0.3)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 12.5, color: 'var(--a2)', marginBottom: 3 }}>
              {smartOpportunities.ruleOpportunities.length} repeating pattern{smartOpportunities.ruleOpportunities.length !== 1 ? 's' : ''} detected
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {smartOpportunities.ruleOpportunities.slice(0, 5).map(op => (
                <span key={op.keyword} style={{ padding: '1px 8px', background: 'rgba(186,117,23,0.15)', color: 'var(--a2)', borderRadius: 99, fontSize: 11, fontWeight: 500 }}>
                  "{op.keyword}" ×{op.count}
                </span>
              ))}
              {smartOpportunities.ruleOpportunities.length > 5 && <span style={{ fontSize: 11, color: 'var(--a2)' }}>+{smartOpportunities.ruleOpportunities.length - 5} more</span>}
            </div>
          </div>
          <button className="btn btn-a btn-sm" onClick={() => {
            setRuleBuilderSeed(smartOpportunities.ruleOpportunities.map(op => ({
              id: `${op.keyword}:${op.exampleDesc}`, keyword: op.keyword,
              catId: op.sugCatId || '', catLabel: op.sugCatLabel || '', catConfidence: op.catConfidence || 'low',
              payee: op.suggestName || op.payee || extractPayeeCandidate(op.exampleDesc, payees || []),
              amtExact: op.amtExact != null ? String(op.amtExact.toFixed(2)) : '',
              amtMin: '', amtMax: '', direction: 'out', enabled: true, count: op.count, example: op.exampleDesc,
            })));
            setShowRuleBuilder(true);
          }}>Review & add rules →</button>
        </div>
      )}

      {/* Main review card */}
      <div className="card">
        <div className="ch">
          <h3>Review transactions</h3>
          <p style={{ fontSize: 11 }}>Uncheck rows to exclude · organised by source file</p>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 12 }}>
            <span className="vp">+{selectedSummary.creditCount} credits</span>
            <span className="vn">-{selectedSummary.debitCount} debits</span>
            {selectedSummary.autoCatCount > 0 && (
              <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: 'var(--al)', color: 'var(--a2)' }}>
                {Math.round(selectedSummary.autoCatCount / (selectedSummary.creditCount + selectedSummary.debitCount) * 100)}% auto-cat
              </span>
            )}
            <button className="btn btn-sm" onClick={() => toggleAll(true)}>All</button>
            <button className="btn btn-sm" onClick={() => toggleAll(false)}>None</button>
          </div>
        </div>

        <ImportReviewTable
          sortedParsedFiles={sortedParsedFiles}
          fileTransactions={fileTransactions}
          fileRowRefs={fileRowRefs}
          allTransactions={allTransactions}
          excluded={excluded}
          selectedCountByFile={selectedCountByFile}
          autoCatMap={autoCatMap}
          catMap={catMap}
          toggleRow={toggleRow}
          toggleFile={toggleFile}
          toggleAll={toggleAll}
          selectedRows={selectedRows}
          selectedSummary={selectedSummary}
        />
      </div>

      {/* Rule builder modal */}
      {showRuleBuilder && (
        <ImportRuleBuilderModal
          initialForms={ruleBuilderSeed}
          cats={cats} rules={rules} org={org} setRules={setRules} toast={toast}
          onClose={() => setShowRuleBuilder(false)}
        />
      )}

      {/* New payees banner */}
      {newPayeesFound.length > 0 && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--al)', borderRadius: 'var(--rl)', border: '0.5px solid var(--a2)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--a2)', flex: 1 }}>
            <strong>{newPayeesFound.length} new payee{newPayeesFound.length > 1 ? 's' : ''} found:</strong>{' '}{newPayeesFound.join(', ')}
          </span>
          <button className="btn btn-a btn-sm" onClick={async () => {
            for (const name of newPayeesFound) {
              const p = await upsertPayee(org.id, name, (PALETTE || [])[payees.length % (PALETTE || ['#888']).length] || '#888');
              setPayees(prev => prev.find(x => x.id === p.id) ? prev : [...prev, p]);
            }
            toast(`${newPayeesFound.length} payee${newPayeesFound.length > 1 ? 's' : ''} added.`);
            setNewPayeesFound([]);
            onNavigate('transactions');
          }}>Add all</button>
          <button className="btn btn-sm" onClick={() => { setNewPayeesFound([]); onNavigate('transactions'); }}>Skip</button>
        </div>
      )}

      {/* Create account modal */}
      {showCreateModal && (
        <CreateAccountModal
          accounts={accounts}
          selectedAccount={selectedAccount}
          setSelectedAccount={setSelectedAccount}
          onClose={() => setShowCreateModal(false)}
          onImportExisting={() => { setShowCreateModal(false); doImport(selectedAccount); }}
          onCreate={handleCreateAccount}
        />
      )}
    </div>
  );
}
