/**
 * views/Banking/BankAccounts.jsx
 * --------------------------------
 * Bank account management with:
 *   - Drag-and-drop reordering
 *   - Clicking card navigates to that account's transactions
 *   - Delete unlinks transactions immediately (no page reload)
 *   - Balance shown for each account
 */

import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { createBankAccount, updateBankAccount, deleteBankAccount } from '../../services/bankService';
import { getTransactions, getBankAccounts } from '../../lib/supabase';

const ACCOUNT_TYPES = [
  { value:'checking',    label:'Everyday / Cheque', icon:'🏦' },
  { value:'savings',     label:'Savings',           icon:'💰' },
  { value:'credit_card', label:'Credit Card',       icon:'💳' },
  { value:'loan',        label:'Loan',              icon:'📋' },
  { value:'investment',  label:'Investment',        icon:'📈' },
];
const ACCOUNT_COLOURS = ['#185FA5','#0C447C','var(--gn)','#1D9E75','var(--a)','var(--a2)','#993C1D','#D85A30','#D4537E','#7F77DD','#5F5E5A','#444441'];
const typeInfo = v => ACCOUNT_TYPES.find(t => t.value === v) || ACCOUNT_TYPES[0];
const fmtBal  = n => '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function BankAccounts({ onNavigate, onSandboxReview }) {
  const { accounts: _accts, setAccounts, txns, setTxns, org, toast, PALETTE } = useApp();
  const [basiqConnecting, setBasiqConnecting] = React.useState(false);
  const [basiqSyncing,    setBasiqSyncing]    = React.useState(false);
  const [basiqStatus,     setBasiqStatus]     = React.useState(null);

  async function connectBasiq() {
    setBasiqConnecting(true);
    try {
      const res = await supabase.functions.invoke('basiq-connect', {
        body: { orgId: org.id },
      });
      if (res.error) throw new Error(res.error.message ?? JSON.stringify(res.error));
      const url = res.data?.url;
      if (!url) throw new Error('No consent URL returned. Check BASIQ_API_KEY secret is set.');

      // Open Basiq Consent UI in a popup
      const popup = window.open(url, 'basiq-consent', 'width=560,height=760,scrollbars=yes,resizable=yes');

      // Detect when user finishes (popup closes) then auto-sync
      const poll = setInterval(() => {
        try {
          if (!popup || popup.closed) {
            clearInterval(poll);
            setBasiqConnecting(false);
            toast('Bank connected! Syncing transactions…');
            syncBasiq();
          }
        } catch(e) { /* cross-origin access error is expected — ignore */ }
      }, 800);
    } catch(e) {
      toast('Connect failed: ' + e.message);
      setBasiqConnecting(false);
    }
  }

  // Build parsedFiles-format from raw DB transactions grouped by account
  async function routeToReview(insertedCount) {
    if (insertedCount === 0) { toast('No new transactions found.'); return; }
    // Refresh accounts in context
    const freshAccts = await getBankAccounts(org.id);
    setAccounts(freshAccts);

    // Fetch ONLY the pending_import transactions (awaiting user approval)
    const { data: pendingTxns } = await supabase
      .from('transactions')
      .select('*')
      .eq('org_id', org.id)
      .eq('pending_import', true)
      .order('date', { ascending: false });

    const normaliseTxn = t => ({
      ...t,
      cat: t.category_id ?? null,
      desc: t.description ?? '',
      amt: parseFloat(t.amount) ?? 0,
      payee: t.payees?.name ?? t.payee ?? '',
      note: t.note ?? '',
    });
    const normalisedPending = (pendingTxns || []).map(normaliseTxn);

    // Group by account for multi-account review
    const byAcct = {};
    normalisedPending.forEach(t => {
      const key = t.account_id || '__unlinked__';
      if (!byAcct[key]) byAcct[key] = [];
      byAcct[key].push(t);
    });
    const acctMap = Object.fromEntries(freshAccts.map(a => [a.id, a]));
    const parsedFiles = Object.entries(byAcct).map(([acctId, acctTxns]) => {
      const acct = acctMap[acctId];
      return {
        filename: acct ? `${acct.name} (${ACCOUNT_TYPES.find(t => t.value === acct.type)?.label || acct.type})` : 'Unlinked transactions',
        transactions: acctTxns.map(t => ({
          id: t.id,           // DB id — needed for pending_import approval
          date: t.date,
          desc: t.desc,
          amt: t.amt,
          note: t.note,
          _accountId: acctId === '__unlinked__' ? null : acctId,
        })),
        summary: null,
        fileType: 'bank_feed',
        _accountId: acctId === '__unlinked__' ? null : acctId,
        _acctColour: acct?.colour,
        _acctType: acct?.type,
      };
    });
    if (onSandboxReview) {
      onSandboxReview(parsedFiles);
    } else {
      toast(`${insertedCount} transactions synced. Navigate to Import to review.`);
    }
  }

  async function syncBasiq(fromDate) {
    setBasiqSyncing(true); setBasiqStatus(null);
    try {
      const res = await supabase.functions.invoke('basiq-sync', {
        body: { orgId: org.id, ...(fromDate ? { fromDate } : {}) },
      });
      if (res.error) throw new Error(res.error.message ?? JSON.stringify(res.error));
      const { accounts: n, transactions: tx } = res.data;
      setBasiqStatus(tx);
      const txDetail = `${tx.inserted} new, ${tx.skipped} already existed (${tx.fetched} fetched from Basiq)`;
      toast(`Synced ${n} account${n!==1?'s':''} · ${txDetail}.`);
      await routeToReview(tx.inserted ?? 0);
    } catch(e) { toast('Sync failed: ' + e.message); }
    setBasiqSyncing(false);
  }

  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('basiq') === 'done') {
      window.history.replaceState({}, '', window.location.pathname);
      syncBasiq();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function connectSandbox() {
    setBasiqSyncing(true); setBasiqStatus(null);
    try {
      toast('Connecting sandbox bank (Hooli Bank)…');
      const connectRes = await supabase.functions.invoke('basiq-sandbox-connect', {
        body: { orgId: org.id, loginId: 'gavinBelson', password: 'hooli2016', institution: 'AU00000' },
      });
      if (connectRes.error) throw new Error(connectRes.error.message ?? JSON.stringify(connectRes.error));
      const { status } = connectRes.data;
      if (status === 'failed') throw new Error('Sandbox connection job failed. Check Basiq dashboard logs.');
      toast('Connected! Syncing transactions…');
      const syncRes = await supabase.functions.invoke('basiq-sync', { body: { orgId: org.id } });
      if (syncRes.error) throw new Error(syncRes.error.message ?? JSON.stringify(syncRes.error));
      const { transactions: tx, accounts: n } = syncRes.data;
      setBasiqStatus(tx);
      const detail = tx.fetched !== tx.matched
        ? `${tx.inserted} new, ${tx.skipped} already existed (${tx.fetched} fetched from Basiq, ${tx.matched} matched to accounts)`
        : `${tx.inserted} new, ${tx.skipped} already existed`;
      toast(`Synced ${n} account${n!==1?'s':''} · ${detail}.`);
      await routeToReview(tx.inserted ?? 0);
    } catch(e) { toast('Sandbox connect failed: ' + e.message); }
    setBasiqSyncing(false);
  }
  const accounts = _accts || [];
  const txnsList = txns  || [];

  const [editing,  setEditing]  = useState(null);
  const [form,     setForm]     = useState({});
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(null);   // account being deleted

  // ── Drag-and-drop state ────────────────────────────────────────────────────
  const dragIdx   = useRef(null);
  const [dragOver, setDragOver] = useState(null);   // index being hovered

  function onDragStart(e, idx) {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.5';
  }
  function onDragEnd(e) {
    e.currentTarget.style.opacity = '';
    setDragOver(null);
  }
  function onDragOver(e, idx) {
    e.preventDefault();
    setDragOver(idx);
  }
  async function onDrop(e, idx) {
    e.preventDefault();
    setDragOver(null);
    const from = dragIdx.current;
    if (from === null || from === idx) return;
    const reordered = [...accounts];
    const [moved]   = reordered.splice(from, 1);
    reordered.splice(idx, 0, moved);
    // Assign new sort_order values
    const updated = reordered.map((a, i) => ({ ...a, sort_order: i }));
    setAccounts(updated);
    // Persist in background
    await Promise.all(updated.map(a => updateBankAccount(a.id, { sort_order: a.sort_order }).catch(() => {})));
    dragIdx.current = null;
  }

  // ── Balance calculation ────────────────────────────────────────────────────
  function calcBalance(acct) {
    // Only count non-pending transactions
    const sum    = txnsList.filter(t => t.account_id === acct.id && !t.pending_import).reduce((s,t) => s+(t.amt??0), 0);
    const ob     = parseFloat(acct.opening_balance) || 0;
    const isCC   = acct.type === 'credit_card' || acct.type === 'loan';
    // CC: opening_balance = amount owed. Spending (negative) increases debt: owed = ob - sum
    // Asset: balance = ob + sum
    return isCC ? ob - sum : ob + sum;
  }

  // ── Edit / Create ──────────────────────────────────────────────────────────
  function openNew() {
    setForm({ name:'', type:'checking', currency:'AUD', opening_balance:0, opening_date:'', credit_limit:'', colour:'#185FA5', sort_order: accounts.length });
    setEditing('new');
  }
  function openEdit(acct, e) {
    e?.stopPropagation();
    setForm({ ...acct, credit_limit: acct.credit_limit ?? '', opening_date: acct.opening_date ?? '' });
    setEditing(acct.id);
  }

  async function save() {
    if (!form.name?.trim()) { toast('Account name is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        name:            form.name.trim(),
        type:            form.type,
        currency:        form.currency || 'AUD',
        opening_balance: parseFloat(form.opening_balance) || 0,
        opening_date:    form.opening_date || null,
        credit_limit:    form.type === 'credit_card' ? (parseFloat(form.credit_limit) || null) : null,
        colour:          form.colour || '#185FA5',
        sort_order:      form.sort_order ?? accounts.length,
      };
      if (editing === 'new') {
        const created = await createBankAccount(org.id, payload);
        setAccounts(prev => [...prev, created]);
        toast('Account created.');
      } else {
        const updated = await updateBankAccount(editing, payload);
        setAccounts(prev => prev.map(a => a.id === editing ? updated : a));
        toast('Account updated.');
      }
      setEditing(null);
    } catch(e) { toast('Error: ' + e.message); }
    finally    { setSaving(false); }
  }

  // ── Delete — unlinks transactions immediately ──────────────────────────────
  async function confirmDelete() {
    const acct = deleting;
    setDeleting(null);
    try {
      await deleteBankAccount(acct.id);
      // Unlink transactions in local state immediately — no reload needed
      setTxns(prev => (prev||[]).map(t =>
        t.account_id === acct.id ? { ...t, account_id: null } : t
      ));
      setAccounts(prev => prev.filter(a => a.id !== acct.id));
      toast(`"${acct.name}" deleted. ${txnsList.filter(t=>t.account_id===acct.id).length} transactions unlinked.`);
    } catch(e) { toast('Error: ' + e.message); }
  }

  function f(k,v) { setForm(p => ({ ...p, [k]: v })); }

  return (
    <div>
      {/* Setup hint */}
      {accounts.length === 0 && txnsList.length > 0 && (
        <div style={{ marginBottom:14, padding:'10px 14px', background:'var(--al)', borderRadius:'var(--rr)', fontSize:12, color:'var(--a2)', lineHeight:1.6 }}>
          <strong>Setup needed:</strong> Create your accounts below, then re-import your statements and select the account to link them.
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <p style={{ fontSize:12, color:'var(--stone)' }}>Drag to reorder · Click a card to view transactions</p>
        <div style={{ display:'flex', gap:6 }}>
          <button className="btn btn-sm" onClick={connectBasiq} disabled={basiqConnecting}
            style={{ display:'flex', alignItems:'center', gap:5 }}>
            {basiqConnecting ? '⏳ Connecting…' : '🏦 Connect bank'}
          </button>
          <button className="btn btn-sm" onClick={connectSandbox} disabled={basiqSyncing}
            title="Connect Basiq sandbox (test data — Hooli Bank)" style={{ opacity:0.75 }}>
            {basiqSyncing ? '⏳ Syncing…' : '🧪 Sandbox test'}
          </button>
          {org?.basiq_user_id && (
            <button className="btn btn-sm" onClick={()=>syncBasiq()} disabled={basiqSyncing} title="Re-sync transactions from Basiq">
              {basiqSyncing ? '⏳ Syncing…' : '↻ Sync now'}
            </button>
          )}
          <button className="btn btn-a btn-sm" onClick={openNew}>+ Add account</button>
        </div>
      </div>
      {basiqStatus && (
        <div style={{ marginBottom:12, padding:'8px 12px', background:'var(--al)', borderRadius:'var(--rr)', fontSize:12, color:'var(--a2)' }}>
          ✓ Sync complete — <strong>{basiqStatus.inserted}</strong> new, <strong>{basiqStatus.skipped}</strong> already imported
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:40 }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🏦</div>
          <p style={{ fontWeight:500, marginBottom:6 }}>No bank accounts yet</p>
          <p style={{ fontSize:12, color:'var(--stone)', marginBottom:16 }}>Add your accounts to link imported transactions and track balances.</p>
          <button className="btn btn-a" onClick={openNew}>Add your first account</button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(268px,1fr))', gap:12 }}>
          {accounts.map((acct, idx) => {
            const balance  = calcBalance(acct);
            const info     = typeInfo(acct.type);
            const isCC     = acct.type === 'credit_card';
            // For CC: balance = amount owed (positive), available = limit - owed
            const available = isCC && acct.credit_limit ? acct.credit_limit - balance : null;
            const txnCnt   = txnsList.filter(t => t.account_id === acct.id).length;

            return (
              <div
                key={acct.id}
                draggable
                onDragStart={e => onDragStart(e, idx)}
                onDragEnd={onDragEnd}
                onDragOver={e => onDragOver(e, idx)}
                onDrop={e => onDrop(e, idx)}
                onClick={() => onNavigate?.('transactions', acct.id)}
                style={{
                  background:'var(--bg-card)',
                  border: dragOver === idx ? `1.5px solid ${acct.colour||'var(--a)'}` : '0.5px solid var(--bd)',
                  borderRadius:'var(--rl)', overflow:'hidden', cursor:'pointer',
                  transition:'box-shadow 0.1s, border 0.1s',
                  boxShadow: dragOver === idx ? `0 0 0 3px ${acct.colour||'var(--a)'}22` : 'none',
                }}
              >
                {/* Colour strip + drag handle */}
                <div style={{ height:4, background:acct.colour||'#185FA5', display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:8, cursor:'grab' }}>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,0.6)', letterSpacing:1 }}>⠿</span>
                </div>

                <div style={{ padding:'14px 16px' }}>
                  {/* Header row */}
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500 }}>{acct.name}</div>
                      <div style={{ fontSize:11, color:'var(--stone)', marginTop:2 }}>
                        {info.icon} {info.label} · {acct.currency}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:4 }} onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm btn-ghost" onClick={e => openEdit(acct, e)} style={{ fontSize:11 }}>Edit</button>
                      <button
                        className="btn btn-sm"
                        style={{ fontSize:11, background:'var(--rdb)', color:'var(--rd)', border:'0.5px solid #f09595' }}
                        onClick={e => { e.stopPropagation(); setDeleting(acct); }}
                      >×</button>
                    </div>
                  </div>

                  {/* Balance */}
                  {isCC ? (
                    <>
                      <div style={{ fontSize:11, color:'var(--stone)', marginBottom:2 }}>Balance owing</div>
                      <div style={{ fontSize:22, fontWeight:500, color: balance > 0.005 ? 'var(--rd)' : balance < -0.005 ? 'var(--gn)' : 'var(--stone)', letterSpacing:'-0.02em' }}>
                        {balance > 0.005 ? fmtBal(balance) : balance < -0.005 ? `${fmtBal(Math.abs(balance))} CR` : '$0.00'}
                      </div>
                      {acct.credit_limit && (
                        <>
                          <div style={{ marginTop:8, height:5, background:'var(--sand3)', borderRadius:3 }}>
                            <div style={{ height:5, borderRadius:3, width:`${Math.min(100, Math.max(0, (balance/acct.credit_limit)*100))}%`, background: balance/acct.credit_limit > 0.8 ? 'var(--rd)' : acct.colour, transition:'width 0.3s' }} />
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--stone)', marginTop:4 }}>
                            <span>Available: <strong style={{ color:'var(--gn)' }}>{fmtBal(Math.max(0, available))}</strong></span>
                            <span>Limit: {fmtBal(acct.credit_limit)}</span>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:11, color:'var(--stone)', marginBottom:2 }}>Balance</div>
                      <div style={{ fontSize:22, fontWeight:500, color: balance >= 0 ? 'var(--ink)' : 'var(--rd)', letterSpacing:'-0.02em' }}>
                        {balance < 0 ? '−' : ''}{fmtBal(balance)}
                      </div>
                    </>
                  )}

                  {/* Footer */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10, paddingTop:8, borderTop:'0.5px solid var(--bd)' }}>
                    <div style={{ fontSize:11, color:'var(--stone)' }}>
                      {txnCnt} transactions
                    </div>
                    <div style={{ fontSize:11, color:'var(--a)', fontWeight:500 }}>
                      View →
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="modal-bg" onClick={() => setDeleting(null)}>
          <div className="modal" style={{ width:380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head" style={{ background:'var(--rdb)', borderBottom:'0.5px solid #f09595' }}>
              <h3 style={{ color:'var(--rd)' }}>Delete account</h3>
              <button className="btn-ghost" style={{ padding:0, fontSize:16 }} onClick={() => setDeleting(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize:13, marginBottom:10 }}>
                Delete <strong>"{deleting.name}"</strong>?
              </p>
              {txnsList.filter(t => t.account_id === deleting.id).length > 0 ? (
                <div style={{ padding:'10px 12px', background:'var(--al)', borderRadius:'var(--rr)', fontSize:12, color:'var(--a2)' }}>
                  <strong>{txnsList.filter(t => t.account_id === deleting.id).length} transactions</strong> will be unlinked and moved back to the Unlinked tab. No transactions are deleted.
                </div>
              ) : (
                <p style={{ fontSize:12, color:'var(--stone)' }}>This account has no linked transactions.</p>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="btn" style={{ background:'var(--rd)', color:'#fff', border:'none' }} onClick={confirmDelete}>Delete account</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Create modal */}
      {editing !== null && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <div className="modal" style={{ width:440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editing === 'new' ? 'Add account' : 'Edit account'}</h3>
              <button className="btn-ghost" style={{ padding:0, fontSize:16 }} onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Account name</label>
                <input type="text" value={form.name||''} onChange={e => f('name',e.target.value)} placeholder="e.g. ANZ Everyday" />
              </div>
              <div className="field">
                <label>Account type</label>
                <select value={form.type||'checking'} onChange={e => f('type',e.target.value)}>
                  {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              {form.type === 'credit_card' && (
                <div className="field">
                  <label>Credit limit</label>
                  <div style={{ position:'relative' }}>
                    <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--stone)' }}>$</span>
                    <input type="number" min="0" step="100" value={form.credit_limit||''} style={{ paddingLeft:22 }} onChange={e => f('credit_limit',e.target.value)} placeholder="5000" />
                  </div>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="field">
                  <label>Opening balance</label>
                  <div style={{ position:'relative' }}>
                    <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--stone)' }}>$</span>
                    <input type="number" step="0.01" value={form.opening_balance??0} style={{ paddingLeft:22 }} onChange={e => f('opening_balance',e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label>Opening date</label>
                  <input type="date" value={form.opening_date||''} onChange={e => f('opening_date',e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Colour</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, paddingTop:4 }}>
                  {ACCOUNT_COLOURS.map(col => (
                    <span key={col} onClick={() => f('colour',col)} style={{ width:24, height:24, borderRadius:'50%', background:col, cursor:'pointer', border:form.colour===col?'2.5px solid var(--ink)':'2px solid transparent' }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-a" onClick={save} disabled={saving}>{saving?'Saving…':'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
