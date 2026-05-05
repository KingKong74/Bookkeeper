/**
 * views/Banking/Transactions.jsx
 * Always-visible inline inputs for category, payee, and description.
 * No floating dropdowns — everything editable directly in the row.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { MetricCard, PayeeAvatar } from '../../components/ui/index';
import { PeriodBar } from '../../components/ui/PeriodBar';
import { TransactionModal } from './TransactionModal';
import { AddTransactionModal } from './AddTransactionModal';
import { fmt, filterByDateRange, runAutoCatRules, estimateCategoryForMerchant } from '../../utils/helpers';
import { extractMerchantName } from '../../utils/merchant.js';
import { updateTransaction, deleteTransaction, createRule, upsertPayee, createCategory, postCategoryJournal } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';
import { getSessionPref, setSessionPref } from '../../hooks/useSessionPref';

const ACCT_ICON = { checking:'🏦', savings:'💰', credit_card:'💳', loan:'📋', investment:'📈' };
const CAT_TYPE_ORDER  = ['income','expense','asset','liability','equity'];
const CAT_TYPE_LABELS = { income:'Income', expense:'Expenses', asset:'Assets', liability:'Liabilities', equity:'Equity' };

// ── Inline category picker ────────────────────────────────────────────────────
function InlineCatPicker({ txnId, currentCatId, cats, catMap, onSelect, onCreateCat, suggestionCatId, suggestionLabel }) {
  const [q,    setQ]    = useState('');
  const [open, setOpen] = useState(false);
  const [hi,   setHi]   = useState(0);
  const inputRef        = useRef(null);
  const containerRef    = useRef(null);

  const flat = q.trim()
    ? cats.filter(c => c.l.toLowerCase().includes(q.toLowerCase()))
    : cats;

  useEffect(() => setHi(0), [q]);

  useEffect(() => {
    function down(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);

  function pick(catId) {
    onSelect(txnId, catId);
    setQ('');
    setOpen(false);
  }

  function handleKey(e) {
    if (!open) { if (e.key !== 'Escape') setOpen(true); return; }
    if (e.key === 'Escape')   { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(i+1, flat.length-1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(i => Math.max(i-1, 0)); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (flat[hi]) pick(flat[hi].id);
      else if (flat.length === 0 && q.trim().length > 1 && onCreateCat) {
        onCreateCat(q.trim()).then(cat => { if (cat) pick(cat.id); });
      }
    }
  }

  const current    = currentCatId    ? catMap[currentCatId]    : null;
  const suggestion = suggestionCatId ? catMap[suggestionCatId] : null;
  // What to display when closed: real cat > suggestion hint > empty
  const displayCat = current || (suggestion && !open ? suggestion : null);
  const isSuggestion = !current && !!suggestion && !open;

  // Group for display
  const groups = {};
  CAT_TYPE_ORDER.forEach(t => { groups[t] = []; });
  flat.forEach(c => { if (groups[c.t]) groups[c.t].push(c); });
  const sections = q.trim()
    ? [{ label:'', items: flat }]
    : CAT_TYPE_ORDER.filter(t => groups[t].length > 0).map(t => ({ label: CAT_TYPE_LABELS[t], items: groups[t] }));

  let globalIdx = 0;

  return (
    <div ref={containerRef} style={{ position:'relative' }} onClick={e => e.stopPropagation()}>
      {/* Always-visible input */}
      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
        {(current || (suggestion && !open)) && (
          <span style={{ width:7, height:7, borderRadius:'50%', background:(current||suggestion)?.col, flexShrink:0, display:'inline-block', opacity: isSuggestion ? 0.55 : 1 }} />
        )}
        <input
          ref={inputRef}
          value={open ? q : (current?.l || suggestion?.l || '')}
          placeholder="Category…"
          onFocus={() => { setOpen(true); setQ(''); }}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={handleKey}
          style={{
            width:'100%', minWidth:0, padding:'2px 6px', fontSize:11.5,
            border:'0.5px solid transparent', borderRadius:'var(--rr)',
            background: '#FDFAF6',
            color: current ? 'var(--ink)' : suggestion && !open ? suggestion.col : 'var(--stone)',
            fontStyle: isSuggestion ? 'italic' : 'normal',
            fontFamily:'var(--font-sans)', cursor:'text',
            outline:'none',
          }}
          onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor='var(--bd2)'; }}
          onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor='transparent'; }}
        />
        {current && (
          <button
            onClick={e => { e.stopPropagation(); onSelect(txnId, null); }}
            title="Remove category"
            className="inline-clear-btn"
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--stone)', fontSize:12, padding:'0 2px', lineHeight:1, flexShrink:0, opacity:0 }}
          >×</button>
        )}
        {isSuggestion && !open && (
          <button
            onClick={e => { e.stopPropagation(); onSelect(txnId, suggestionCatId); }}
            title={`Apply ${suggestionLabel || 'suggestion'}: ${suggestion?.l}`}
            style={{ background:'var(--gnb)', border:'0.5px solid rgba(59,109,17,0.35)', borderRadius:3, cursor:'pointer', color:'var(--gn)', fontSize:10, padding:'1px 5px', lineHeight:1.4, flexShrink:0, fontWeight:600 }}
          >✓</button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:'fixed',
          left: containerRef.current ? Math.min(containerRef.current.getBoundingClientRect().left, window.innerWidth - 230) : 0,
          top:  containerRef.current ? containerRef.current.getBoundingClientRect().bottom + 2 : 0,
          zIndex:700, background:'#FDFAF6', border:'0.5px solid var(--bd2)',
          borderRadius:'var(--rl)', minWidth:220, maxHeight:280, overflowY:'auto',
          boxShadow:'0 6px 20px rgba(42,36,32,0.14)',
        }}>
          <div style={{ position:'sticky', top:0, background:'#FDFAF6', borderBottom:'0.5px solid var(--bd)', zIndex:1 }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKey}
              placeholder="Search categories…"
              style={{ width:'100%', boxSizing:'border-box', padding:'7px 10px', fontSize:12.5, border:'none', background:'#FDFAF6', outline:'none', fontFamily:'var(--font-sans)' }} />
          </div>
          {current && (
            <div style={{ padding:'5px 10px', fontSize:11.5, color:'var(--stone)', borderBottom:'0.5px solid var(--bd)', cursor:'pointer' }}
              onMouseDown={() => { onSelect(txnId, null); setOpen(false); }}>
              <span style={{ fontSize:11, marginRight:6 }}>✕</span>Remove category
            </div>
          )}
          {sections.map(({ label, items }) => (
            <React.Fragment key={label}>
              {label && <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', background:'var(--sand)', borderTop:'0.5px solid var(--bd)' }}>{label}</div>}
              {items.map(c => {
                const idx = globalIdx++;
                return (
                  <div key={c.id}
                    style={{ padding:'6px 10px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:7, background: idx===hi ? 'var(--al)' : '', fontWeight: c.id===currentCatId?500:400 }}
                    onMouseEnter={() => setHi(idx)}
                    onMouseDown={() => pick(c.id)}
                  >
                    <span style={{ width:7, height:7, borderRadius:'50%', background:c.col, flexShrink:0 }} />
                    <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.l}</span>

                  </div>
                );
              })}
            </React.Fragment>
          ))}
          {flat.length === 0 && q.trim().length > 1 && (
            <div
              style={{ padding:'8px 10px', fontSize:12, cursor:'pointer', color:'var(--a2)', fontWeight:500, display:'flex', alignItems:'center', gap:6 }}
              onMouseDown={async () => { if (onCreateCat) { const cat = await onCreateCat(q.trim()); if (cat) { pick(cat.id); } } }}
            >
              <span style={{ fontSize:13 }}>+</span> Create category "{q.trim()}"
            </div>
          )}
          {flat.length === 0 && !q.trim() && <div style={{ padding:'10px', fontSize:12, color:'var(--stone)', textAlign:'center' }}>No matches</div>}
          <div style={{ padding:'3px 10px', fontSize:10, color:'var(--sand4)', borderTop:'0.5px solid var(--bd)' }}>↑↓ · Enter/Tab · Esc</div>
        </div>
      )}
    </div>
  );
}

// ── Inline payee picker ───────────────────────────────────────────────────────
function InlinePayeePicker({ txnId, currentPayee, payees, setPayees, onSelect, org, PALETTE }) {
  const [q,    setQ]    = useState('');
  const [open, setOpen] = useState(false);
  const [hi,   setHi]   = useState(0);
  const containerRef    = useRef(null);

  const filtered  = (payees||[]).filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  const canCreate = q.trim().length > 1 && !(payees||[]).find(p => p.name.toLowerCase() === q.trim().toLowerCase());
  const allItems  = canCreate ? [...filtered, { _create:true, name:q.trim() }] : filtered;

  useEffect(() => setHi(0), [q]);

  useEffect(() => {
    function down(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);

  async function createAndSelect(name) {
    const col  = (PALETTE||[])[payees.length % (PALETTE||['#888']).length] || '#888';
    const newP = await upsertPayee(org.id, name.trim(), col);
    setPayees(prev => prev.find(p => p.id === newP.id) ? prev : [...prev, newP]);
    onSelect(txnId, newP);
    setOpen(false); setQ('');
  }

  function pickItem(item) {
    if (item._create) createAndSelect(item.name);
    else { onSelect(txnId, item); setOpen(false); setQ(''); }
  }

  function handleKey(e) {
    if (!open) { if (e.key !== 'Escape') setOpen(true); return; }
    if (e.key === 'Escape')    { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(i+1, allItems.length-1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(i => Math.max(i-1, 0)); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (allItems[hi]) pickItem(allItems[hi]);
      else if (canCreate) createAndSelect(q.trim());
    }
  }

  return (
    <div ref={containerRef} style={{ position:'relative' }} onClick={e => e.stopPropagation()}>
      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
        {currentPayee && !open && (
          <PayeeAvatar name={currentPayee} payeesList={payees||[]} size="sm" />
        )}
        <input
          value={open ? q : (currentPayee || '')}
          placeholder="Payee…"
          onFocus={() => { setOpen(true); setQ(currentPayee || ''); }}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={handleKey}
          style={{
            width:'100%', minWidth:0, padding:'2px 6px', fontSize:11.5,
            border:'0.5px solid transparent', borderRadius:'var(--rr)',
            background: '#FDFAF6',
            color: currentPayee ? 'var(--ink)' : 'var(--stone)',
            fontFamily:'var(--font-sans)', cursor:'text', outline:'none',
          }}
          onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor='var(--bd2)'; }}
          onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor='transparent'; }}
        />
        {currentPayee && (
          <button
            onClick={e => { e.stopPropagation(); onSelect(txnId, null); }}
            title="Remove payee"
            className="inline-clear-btn"
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--stone)', fontSize:12, padding:'0 2px', lineHeight:1, flexShrink:0, opacity:0 }}
          >×</button>
        )}
      </div>

      {open && (
        <div style={{
          position:'fixed',
          left: containerRef.current ? Math.min(containerRef.current.getBoundingClientRect().left, window.innerWidth - 230) : 0,
          top:  containerRef.current ? containerRef.current.getBoundingClientRect().bottom + 2 : 0,
          zIndex:700, background:'#FDFAF6', border:'0.5px solid var(--bd2)',
          borderRadius:'var(--rl)', minWidth:220, maxHeight:260, overflowY:'auto',
          boxShadow:'0 6px 20px rgba(42,36,32,0.14)',
        }}>
          <div style={{ position:'sticky', top:0, background:'#FDFAF6', borderBottom:'0.5px solid var(--bd)', zIndex:1 }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKey}
              placeholder="Search or create…"
              style={{ width:'100%', boxSizing:'border-box', padding:'7px 10px', fontSize:12.5, border:'none', background:'#FDFAF6', outline:'none', fontFamily:'var(--font-sans)' }} />
          </div>
          {currentPayee && (
            <div style={{ padding:'5px 10px', fontSize:11.5, color:'var(--stone)', borderBottom:'0.5px solid var(--bd)', cursor:'pointer' }}
              onMouseDown={() => { onSelect(txnId, null); setOpen(false); }}>
              <span style={{ fontSize:11, marginRight:6 }}>✕</span>Remove payee
            </div>
          )}
          {filtered.map((p, i) => (
            <div key={p.id}
              style={{ padding:'6px 10px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:8, background: i===hi ? 'var(--al)' : '' }}
              onMouseEnter={() => setHi(i)}
              onMouseDown={() => pickItem(p)}
            >
              <span style={{ width:20, height:20, borderRadius:'50%', background:`${p.colour||p.col||'#888'}22`, color:p.colour||p.col||'#888', fontSize:9, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontWeight:700 }}>
                {p.name.slice(0,2).toUpperCase()}
              </span>
              <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
            </div>
          ))}
          {canCreate && (
            <div
              style={{ padding:'6px 10px', fontSize:12, cursor:'pointer', color:'var(--a2)', fontWeight:500, borderTop:'0.5px solid var(--bd)', background: hi===filtered.length ? 'var(--al)' : '' }}
              onMouseEnter={() => setHi(filtered.length)}
              onMouseDown={() => createAndSelect(q.trim())}
            >
              <span style={{ marginRight:6 }}>+</span>Create "{q.trim()}"
            </div>
          )}
          {filtered.length === 0 && !canCreate && (
            <div style={{ padding:'10px', fontSize:12, color:'var(--stone)', textAlign:'center' }}>
              {payees.length === 0 ? 'Type a name to create' : 'No matches'}
            </div>
          )}
          <div style={{ padding:'3px 10px', fontSize:10, color:'var(--sand4)', borderTop:'0.5px solid var(--bd)' }}>↑↓ · Enter/Tab · Esc</div>
        </div>
      )}
    </div>
  );
}

// ── Inline description editor ─────────────────────────────────────────────────
function InlineDescEditor({ txnId, value, note, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);

  function commit() {
    if (draft.trim() !== value) onSave(txnId, draft.trim() || value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        onClick={e => e.stopPropagation()}
        style={{ width:'100%', padding:'2px 4px', fontSize:12, border:'0.5px solid var(--a)', borderRadius:'var(--rr)', background:'#fff', fontFamily:'var(--font-sans)', outline:'none' }}
      />
    );
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, overflow:'hidden' }}
      onClick={e => { e.stopPropagation(); setDraft(value); setEditing(true); }}>
      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, cursor:'text' }}
        title="Click to edit">{value}</span>
      {note && <span style={{ color:'var(--a)', fontSize:11, flexShrink:0 }}>📝</span>}
    </div>
  );
}

// ── Delete toast ──────────────────────────────────────────────────────────────
function DeleteToast({ txn, onConfirm, onCancel }) {
  if (!txn) return null;
  return (
    <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#2A2420', color:'#F5F1EB', borderRadius:10, padding:'12px 18px', display:'flex', alignItems:'center', gap:14, zIndex:700, boxShadow:'0 6px 24px rgba(0,0,0,0.25)', fontSize:13, minWidth:320 }}>
      <span style={{ flex:1 }}>Delete <strong>"{txn.desc?.slice(0,30)}{txn.desc?.length>30?'…':''}"</strong>?</span>
      <button onClick={onCancel} style={{ background:'rgba(255,255,255,0.12)', border:'none', color:'#F5F1EB', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:12 }}>Cancel</button>
      <button onClick={onConfirm} style={{ background:'#A32D2D', border:'none', color:'#fff', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:500 }}>Delete</button>
    </div>
  );
}

// ── Make-a-rule prompt ────────────────────────────────────────────────────────
function MakeRulePrompt({ desc, catLabel, onAccept, onDismiss, onNeverShow }) {
  return (
    <div style={{ position:'fixed', bottom:24, right:24, background:'#FDFAF6', border:'0.5px solid var(--bd2)', borderRadius:10, padding:'12px 16px', zIndex:700, boxShadow:'0 6px 24px rgba(42,36,32,0.15)', maxWidth:320, fontSize:12 }}>
      <div style={{ fontWeight:500, marginBottom:4, fontSize:12.5 }}>💡 Make this a rule?</div>
      <div style={{ color:'var(--stone)', marginBottom:10, lineHeight:1.5 }}>
        Always categorise <strong>"{desc?.slice(0,25)}{desc?.length>25?'…':''}"</strong> as <strong>{catLabel}</strong>?
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        <button className="btn btn-a btn-sm" onClick={onAccept}>Create rule</button>
        <button className="btn btn-sm" onClick={onDismiss}>Not now</button>
        <button onClick={onNeverShow} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--stone)', fontSize:11, textDecoration:'underline', padding:'4px 2px' }}>Don't show again</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function Transactions({ defaultAccountTab = null, onClearDefaultTab }) {
  const { txns, setTxns, cats, setCats, catMap, rules, setRules, payees, setPayees,
          accounts, dateFrom, dateTo, toast, org, user, PALETTE } = useApp();

  const [accountTab,    setAccountTab]    = useState(defaultAccountTab);
  const [allocTab,      setAllocTab]      = useState('all');
  const [search,        setSearch]        = useState('');
  const [typeFilter,    setTypeFilter]    = useState('');
  const [payeeFilter,   setPayeeFilter]   = useState('');
  const [selected,      setSelected]      = useState(new Set());
  const [bulkCatDD,     setBulkCatDD]     = useState(false);
  const [bulkBankId,    setBulkBankId]    = useState('');
  const [detailId,      setDetailId]      = useState(null);
  const [showAdd,       setShowAdd]       = useState(false);
  const [newCatDraft,   setNewCatDraft]   = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [rulePrompt,    setRulePrompt]    = useState(null);
  const [justAllocated, setJustAllocated] = useState(new Set());
  const lastClickedIdx  = useRef(null);
  const recentAllocRef  = useRef({});

  // Apply defaultAccountTab from navigation
  useEffect(() => {
    if (defaultAccountTab !== null) { setAccountTab(defaultAccountTab); onClearDefaultTab?.(); }
  }, [defaultAccountTab]); // eslint-disable-line

  // Ctrl+A
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey||e.metaKey) && e.key==='a' && !e.target.matches('input,textarea,select')) {
        e.preventDefault();
        setSelected(new Set((window.__ledgerFt||[]).map(t => t.id)));
      }
      if (e.key==='Escape') clearSel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Category groups for bulk allocate
  const catsByType = useMemo(() => {
    const g = {}; CAT_TYPE_ORDER.forEach(t => { g[t] = []; });
    (cats||[]).forEach(c => { if (g[c.t]) g[c.t].push(c); });
    return g;
  }, [cats]);

  // Pending categories from rules
  const pendingCatMap = useMemo(() => {
    const unalloc = (txns||[]).filter(t => !t.cat && !t._dismissed);
    const map = {};

    // Layer 1: explicit auto-cat rules
    runAutoCatRules(unalloc, rules||[]).forEach(s => { map[s.txnId] = s; });

    // Layer 2: merchant intelligence for remaining unmatched transactions
    for (const t of unalloc) {
      if (map[t.id]?.sugCat) continue; // already has a rule suggestion
      const merchant = extractMerchantName(t.desc || '');
      if (!merchant) continue;
      const est = estimateCategoryForMerchant(merchant, (t.desc||'').toLowerCase(), cats||[]);
      if (!est.catId) continue;
      map[t.id] = {
        txnId:      t.id,
        sugCat:     est.catId,
        sugPayee:   merchant,
        confidence: est.confidence === 'high' ? 'High' : 'Medium',
        reason:     `Merchant: ${merchant}`,
        fromIntel:  true,
      };
    }
    return map;
  }, [txns, rules, cats]);

  // Account balances
  const acctBalances = useMemo(() => {
    const map = {};
    (accounts||[]).forEach(a => {
      const sum = (txns||[]).filter(t => t.account_id===a.id).reduce((s,t)=>s+(t.amt??0),0);
      map[a.id] = (a.opening_balance||0) + sum;
    });
    return map;
  }, [accounts, txns]);

  // Base filtered set
  const baseFt = useMemo(() => {
    let ft = filterByDateRange(txns||[], dateFrom, dateTo);
    if (accountTab==='unlinked') ft = ft.filter(t => !t.account_id);
    else if (accountTab)         ft = ft.filter(t => t.account_id===accountTab);
    return ft;
  }, [txns, dateFrom, dateTo, accountTab]);

  // Reconciliation stats
  const recon = useMemo(() => {
    const total=baseFt.length, matched=baseFt.filter(t=>!!t.cat).length;
    const totalIn=baseFt.filter(t=>t.amt>0).reduce((s,t)=>s+t.amt,0);
    const totalOut=baseFt.filter(t=>t.amt<0).reduce((s,t)=>s+t.amt,0);
    return { total, matched, unmatched:total-matched, pct:total>0?Math.round(matched/total*100):0, totalIn, totalOut };
  }, [baseFt]);

  // Display set
  let ft = [...baseFt];
  if (allocTab==='categorised')   ft = ft.filter(t=>!!t.cat);
  if (allocTab==='uncategorised') ft = ft.filter(t=>!t.cat);
  if (search) ft = ft.filter(t=>t.desc.toLowerCase().includes(search.toLowerCase())||(t.payee||'').toLowerCase().includes(search.toLowerCase())||t.date.includes(search));
  if (typeFilter==='in')  ft = ft.filter(t=>t.amt>0);
  if (typeFilter==='out') ft = ft.filter(t=>t.amt<0);
  if (payeeFilter)        ft = ft.filter(t=>t.payee===payeeFilter);
  ft = [...ft].sort((a,b)=>b.date.localeCompare(a.date));

  if (typeof window!=='undefined') window.__ledgerFt = ft;

  const ua = baseFt.filter(t=>!t.cat).length;
  const unlinkedCount = useMemo(()=>filterByDateRange(txns||[],dateFrom,dateTo).filter(t=>!t.account_id).length,[txns,dateFrom,dateTo]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function allocateCat(txnId, catId) {
    const txn=txns.find(t=>t.id===txnId);
    const prev=txn?.cat?catMap[txn.cat]?.l:null, next=catId?catMap[catId]?.l:null;
    await updateTransaction(txnId,{category_id:catId??null});
    setTxns(p=>(p||[]).map(t=>t.id===txnId?{...t,cat:catId??null,category_id:catId??null}:t));
    if(txn) await logAudit({orgId:org.id,userId:user?.id,transaction:txn,action:catId?'category_changed':'unallocated',changedFields:{category:{from:prev??'Unallocated',to:next??'Unallocated'}}});
    // Post double-entry journal
    try {
      const cat  = catId ? catMap[catId] : null;
      const acct = txn?.account_id ? (accounts||[]).find(a=>a.id===txn.account_id) : null;
      const entry = await postCategoryJournal(org.id, txn??{id:txnId,date:'',desc:'',amt:0}, cat, acct);
      if (entry) setTxns(p=>(p||[]).map(t=>t.id===txnId?{...t,journal_entry_id:entry.id}:t));
    } catch(e) { console.warn('Journal post failed:', e.message); }
    if(catId&&allocTab==='uncategorised'){
      setJustAllocated(p=>new Set([...p,txnId]));
      setTimeout(()=>setJustAllocated(p=>{const n=new Set(p);n.delete(txnId);return n;}),2500);
    }
    if(catId&&txn&&!getSessionPref('suppress_rule_prompt')){
      const key=txn.desc.toLowerCase().slice(0,20), tr=recentAllocRef.current;
      if(!tr[key]) tr[key]={catId,count:0};
      if(tr[key].catId===catId){
        tr[key].count++;
        const noRule=!(rules||[]).some(r=>txn.desc.toLowerCase().includes(r.keyword?.toLowerCase())&&r.catId===catId);
        if(tr[key].count>=2&&noRule&&!rulePrompt) setRulePrompt({desc:txn.desc,catId,catLabel:next,keyword:(() => {
            // Extract meaningful keyword: up to 4 words, strip reference codes (contain digits or #)
            const words = txn.desc.trim().split(/\s+/);
            const meaningful = words.slice(0, Math.min(4, words.length))
              .filter((w,i) => i===0 || !(/[0-9#]/.test(w) || w.length > 12));
            return meaningful.join(' ').toLowerCase();
          })()});
      } else { tr[key]={catId,count:1}; }
    }
  }

  async function allocatePayee(txnId, payeeObj) {
    const txn=txns.find(t=>t.id===txnId);
    await updateTransaction(txnId,{payee_id:payeeObj?.id??null});
    setTxns(p=>(p||[]).map(t=>t.id===txnId?{...t,payee:payeeObj?.name??'',payee_id:payeeObj?.id??null}:t));
    if(txn) await logAudit({orgId:org.id,userId:user?.id,transaction:txn,action:'payee_changed',changedFields:{payee:{from:txn.payee||'None',to:payeeObj?.name||'None'}}});
  }

  // Create a new category — shows type picker modal, returns Promise
  async function handleCreateCat(label) {
    return new Promise(resolve => {
      setNewCatDraft({ label: label.trim(), resolve });
    });
  }

  async function confirmCreateCat(type) {
    if (!newCatDraft) return;
    const { label, resolve } = newCatDraft;
    setNewCatDraft(null);
    const payload = {
      label,
      type,
      account_group: label,
      colour:        PALETTE[(cats||[]).length % PALETTE.length] || '#888780',
      sort_order:    (cats||[]).length,
    };
    try {
      const created = await createCategory(org.id, payload);
      const norm = { ...created, l: created.label, t: created.type, col: created.colour, ac: created.account_group };
      setCats(prev => [...(prev||[]), norm]);
      toast(`Category "${label}" created.`);
      resolve(norm);
    } catch(e) {
      toast('Could not create category: ' + e.message);
      resolve(null);
    }
  }

  async function saveDesc(txnId, desc) {
    await updateTransaction(txnId, { description: desc });
    setTxns(p=>(p||[]).map(t=>t.id===txnId?{...t,desc,description:desc}:t));
  }

  async function bulkAssignBank(accountId) {
    if (!accountId || selected.size===0) return;
    const ids=[...selected];
    await Promise.all(ids.map(id=>updateTransaction(id,{account_id:accountId})));
    setTxns(p=>(p||[]).map(t=>selected.has(t.id)?{...t,account_id:accountId}:t));
    setSelected(new Set()); setBulkBankId('');
    const acct=(accounts||[]).find(a=>a.id===accountId);
    toast(`${ids.length} transactions assigned to ${acct?.name||'account'}.`);
  }

  async function bulkAllocate(catId) {
    if(!catId||selected.size===0) return;
    const ids=[...selected];
    await Promise.all(ids.map(id=>updateTransaction(id,{category_id:catId})));
    setTxns(p=>(p||[]).map(t=>selected.has(t.id)?{...t,cat:catId,category_id:catId}:t));
    setSelected(new Set()); setBulkCatDD(false);
    toast(`${ids.length} transactions → ${catMap[catId]?.l}.`);
    // Post journals in background (non-blocking)
    const cat  = catMap[catId];
    const selectedTxns = (txns||[]).filter(t=>ids.includes(t.id));
    Promise.all(selectedTxns.map(txn => {
      const acct = txn.account_id ? (accounts||[]).find(a=>a.id===txn.account_id) : null;
      return postCategoryJournal(org.id, txn, cat, acct).catch(e=>console.warn('Bulk journal failed:',e.message));
    }));
  }

  function requestDelete(e,txn){e.stopPropagation();setPendingDelete(txn);}
  async function confirmDelete(){
    const txn=pendingDelete; setPendingDelete(null);
    await logAudit({orgId:org.id,userId:user?.id,transaction:txn,action:'deleted'});
    await deleteTransaction(txn.id);
    setTxns(p=>(p||[]).filter(t=>t.id!==txn.id));
    toast('Transaction deleted.');
  }

  async function acceptRule(){
    const{keyword,catId,catLabel}=rulePrompt;
    try{
      const r=await createRule(org.id,{keyword,category_id:catId,payee_name:'',sort_order:(rules||[]).length});
      setRules(p=>[...(p||[]),{...r,catId:r.category_id,keyword:r.keyword,payee:r.payee_name||''}]);
      toast(`Rule: "${keyword}" → ${catLabel}`);
    }catch(e){toast('Could not save: '+e.message);}
    setRulePrompt(null);
  }

  function toggleSelect(e,id){
    e.stopPropagation();
    const idx=ft.findIndex(t=>t.id===id);
    if(e.shiftKey&&lastClickedIdx.current!==null){
      const lo=Math.min(lastClickedIdx.current,idx), hi=Math.max(lastClickedIdx.current,idx);
      setSelected(p=>{const n=new Set(p);for(let i=lo;i<=hi;i++)n.add(ft[i].id);return n;});
    } else {
      setSelected(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
      lastClickedIdx.current=idx;
    }
  }
  function selectAll(){setSelected(new Set(ft.map(t=>t.id)));}
  function clearSel(){setSelected(new Set());}
  function switchAccount(id){setAccountTab(id);clearSel();setAllocTab('all');}

  return (
    <>
      <PeriodBar />

      <div className="card" style={{ marginBottom:0, borderBottomLeftRadius:0, borderBottomRightRadius:0, borderBottom:'none' }}>
        {/* ── Account tabs ── */}
        <div style={{ overflowX:'auto' }}>
          <div style={{ display:'flex', padding:'0 4px', minWidth:'max-content', borderBottom:'0.5px solid var(--bd)' }}>
            <button onClick={()=>switchAccount(null)} style={{ padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:12.5, fontFamily:'var(--font-sans)', whiteSpace:'nowrap', color:accountTab===null?'var(--ink)':'var(--stone)', fontWeight:accountTab===null?500:400, borderBottom:accountTab===null?'2px solid #BA7517':'2px solid transparent', marginBottom:-1 }}>
              All accounts
              <span style={{ marginLeft:6, fontSize:10, color:'var(--stone)', background:'var(--sand2)', padding:'1px 5px', borderRadius:99 }}>
                {filterByDateRange(txns||[],dateFrom,dateTo).length}
              </span>
            </button>
            {unlinkedCount>0&&(
              <button onClick={()=>switchAccount('unlinked')} style={{ padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:12.5, fontFamily:'var(--font-sans)', whiteSpace:'nowrap', color:accountTab==='unlinked'?'var(--ink)':'var(--stone)', fontWeight:accountTab==='unlinked'?500:400, borderBottom:accountTab==='unlinked'?'2px solid var(--rd)':'2px solid transparent', marginBottom:-1, display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--rd)', display:'inline-block' }} />
                Unlinked
                <span style={{ fontSize:10, background:'var(--rdb)', color:'var(--rd)', padding:'1px 5px', borderRadius:99, fontWeight:600 }}>{unlinkedCount}</span>
              </button>
            )}
            {(accounts||[]).map(a=>{
              const bal=acctBalances[a.id]??0, cnt=filterByDateRange(txns||[],dateFrom,dateTo).filter(t=>t.account_id===a.id).length, isCC=a.type==='credit_card', active=accountTab===a.id;
              return (
                <button key={a.id} onClick={()=>switchAccount(a.id)} style={{ padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:12.5, fontFamily:'var(--font-sans)', whiteSpace:'nowrap', color:active?'var(--ink)':'var(--stone)', fontWeight:active?500:400, borderBottom:active?`2px solid ${a.colour||'#BA7517'}`:'2px solid transparent', marginBottom:-1, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:a.colour||'#888', display:'inline-block', flexShrink:0 }} />
                  {ACCT_ICON[a.type]} {a.name}
                  <span style={{ fontSize:10, color:'var(--stone)', background:'var(--sand2)', padding:'1px 5px', borderRadius:99 }}>{cnt}</span>
                  <span style={{ fontSize:10, padding:'1px 6px', borderRadius:99, fontWeight:500, background:isCC?(bal>0?'var(--rdb)':'var(--gnb)'):'var(--sand)', color:isCC?(bal>0?'var(--rd)':'var(--gn)'):'var(--stone)' }}>
                    {isCC?`${fmt(Math.abs(bal))} owed`:fmt(bal)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Recon panel ── */}
        <div style={{ padding:'8px 14px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)', display:'flex', alignItems:'center', gap:18, flexWrap:'wrap' }}>
          {[
            {label:'Total',       value:recon.total},
            {label:'Categorised', value:recon.matched,   colour:'var(--gn)'},
            {label:'Unmatched',   value:recon.unmatched, colour:recon.unmatched>0?'var(--rd)':'var(--stone)'},
          ].map(m=>(
            <div key={m.label}>
              <div style={{ fontSize:10, color:'var(--stone)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.05em' }}>{m.label}</div>
              <div style={{ fontSize:13, fontWeight:500, color:m.colour||'var(--ink)' }}>{m.value}</div>
            </div>
          ))}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:80, height:6, background:'var(--sand3)', borderRadius:3 }}>
              <div style={{ height:6, borderRadius:3, background:recon.pct===100?'var(--gn)':'#BA7517', width:`${recon.pct}%`, transition:'width 0.3s' }} />
            </div>
            <span style={{ fontSize:11, fontWeight:500, color:recon.pct===100?'var(--gn)':'var(--a2)' }}>{recon.pct}%</span>
          </div>
          <div style={{ height:20, width:0.5, background:'var(--bd2)' }} />
          <div><div style={{ fontSize:10, color:'var(--stone)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.05em' }}>Credits</div><div style={{ fontSize:13, fontWeight:500, color:'var(--gn)' }}>+{fmt(recon.totalIn)}</div></div>
          <div><div style={{ fontSize:10, color:'var(--stone)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.05em' }}>Debits</div><div style={{ fontSize:13, fontWeight:500, color:'var(--rd)' }}>-{fmt(Math.abs(recon.totalOut))}</div></div>
        </div>

        {/* ── Alloc tabs + filters ── */}
        <div style={{ borderBottom:'0.5px solid var(--bd)' }}>
          <div style={{ display:'flex', padding:'0 12px' }}>
            {[['all','All'],['categorised','Categorised'],['uncategorised','Uncategorised']].map(([val,label])=>(
              <button key={val} onClick={()=>{setAllocTab(val);clearSel();}} style={{ padding:'7px 12px', background:'none', border:'none', cursor:'pointer', fontSize:12, fontFamily:'var(--font-sans)', color:allocTab===val?'var(--ink)':'var(--stone)', fontWeight:allocTab===val?500:400, borderBottom:allocTab===val?'2px solid var(--a)':'2px solid transparent', marginBottom:-1 }}>
                {label}
                {val==='uncategorised'&&ua>0&&<span style={{ marginLeft:5, fontSize:9, background:'var(--al)', color:'var(--a2)', padding:'1px 5px', borderRadius:99, fontWeight:600 }}>{ua}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="txn-filters">
          <input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} />
          <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            <option value="in">Credits</option>
            <option value="out">Debits</option>
          </select>
          <select value={payeeFilter} onChange={e=>setPayeeFilter(e.target.value)}>
            <option value="">All payees</option>
            {(payees||[]).map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
          {selected.size>0?(
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:12, color:'var(--stone)' }}>{selected.size} selected</span>
              <div style={{ position:'relative' }}>
                <button className="btn btn-a btn-sm" onClick={()=>setBulkCatDD(v=>!v)}>Categorise {selected.size} ▾</button>
                {/* Bulk bank assign — especially useful on unlinked tab */}
                {accountTab==='unlinked' && (
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <select value={bulkBankId} onChange={e=>setBulkBankId(e.target.value)}
                      style={{ fontSize:12, padding:'4px 8px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)', maxWidth:160 }}>
                      <option value="">Assign to account…</option>
                      {(accounts||[]).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <button className="btn btn-a btn-sm" onClick={()=>bulkAssignBank(bulkBankId)} disabled={!bulkBankId}>
                      Move {selected.size}
                    </button>
                  </div>
                )}
                {bulkCatDD&&(
                  <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, background:'#FDFAF6', border:'0.5px solid var(--bd2)', borderRadius:'var(--rl)', padding:0, minWidth:200, maxHeight:300, overflowY:'auto', zIndex:600, boxShadow:'0 6px 20px rgba(42,36,32,0.14)' }} onMouseLeave={()=>{}}>
                    {CAT_TYPE_ORDER.filter(t=>catsByType[t]?.length>0).map(type=>(
                      <React.Fragment key={type}>
                        <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', background:'var(--sand)', borderTop:'0.5px solid var(--bd)' }}>{CAT_TYPE_LABELS[type]}</div>
                        {catsByType[type].map(c=>(
                          <div key={c.id} style={{ padding:'6px 10px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:7 }}
                            onMouseEnter={e=>e.currentTarget.style.background='var(--sand)'}
                            onMouseLeave={e=>e.currentTarget.style.background=''}
                            onClick={()=>bulkAllocate(c.id)}>
                            <span style={{ width:7, height:7, borderRadius:'50%', background:c.col }} />{c.l}
                          </div>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn btn-sm" onClick={clearSel}>Clear</button>
            </div>
          ):(
            <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
              <button className="btn btn-sm" style={{ fontSize:11, color:'var(--stone)' }} onClick={selectAll} title="Ctrl+A">Select all</button>
              <button className="btn btn-a btn-sm" onClick={()=>setShowAdd(true)}>+ Add</button>
            </div>
          )}
        </div>

        {/* Account info banner */}
        {accountTab&&accountTab!=='unlinked'&&(()=>{
          const a=(accounts||[]).find(x=>x.id===accountTab); if(!a) return null;
          const bal=acctBalances[a.id]??0, isCC=a.type==='credit_card';
          return(
            <div style={{ padding:'6px 14px', background:`${a.colour||'#888'}12`, borderBottom:'0.5px solid var(--bd)', display:'flex', alignItems:'center', gap:14, fontSize:12 }}>
              <span style={{ width:9, height:9, borderRadius:'50%', background:a.colour||'#888', display:'inline-block' }} />
              <strong>{a.name}</strong>
              <span style={{ color:'var(--stone)', textTransform:'capitalize' }}>{a.type.replace('_',' ')}</span>
              <span style={{ marginLeft:'auto', fontWeight:500 }} className={isCC?(bal>0?'vn':'vp'):(bal>=0?'':'vn')}>
                {isCC?`${fmt(Math.abs(bal))} owed`:`Balance: ${fmt(bal)}`}
              </span>
            </div>
          );
        })()}

        {/* Table */}
        <table style={{ tableLayout:'fixed' }}>
          <colgroup>
            <col style={{ width:32 }} />
            <col style={{ width:82 }} />
            <col style={{ width:'28%' }} />
            <col style={{ width:130 }} />
            <col style={{ width:140 }} />
            <col style={{ width:90 }} />
            {accountTab===null && <col style={{ width:100 }} />}
            <col style={{ width:70 }} />
            <col style={{ width:28 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ width:36, textAlign:'center' }}>
                <input type="checkbox"
                  checked={ft.length>0 && ft.every(t=>selected.has(t.id))}
                  onChange={e => e.target.checked ? selectAll() : setSelected(new Set())}
                  style={{ cursor:'pointer' }} />
              </th>
              <th>Date</th>
              <th>Description</th>
              <th>Payee</th>
              <th>Category</th>
              <th className="tr">Amount</th>
              {accountTab===null&&<th>Account</th>}
              <th style={{ textAlign:'center' }}>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ft.map(t=>{
              const pending=!t.cat&&pendingCatMap[t.id];
              // catMap is keyed by cat.id (DB uuid). sugCat is also a DB uuid.
              const pendingCat=pending && pending.sugCat ? (catMap[pending.sugCat] || null) : null;
              const isSelected=selected.has(t.id);
              const status=t.cat?'done':(pending?'pending':'todo');
              return(
                <tr key={t.id}
                  style={{ cursor:'default',
                    background: isSelected ? 'rgba(186,117,23,0.15)' : t.cat ? '#FAF3E4' : '#FDFAF6',
                    opacity: justAllocated.has(t.id) ? 0.3 : t.cat ? 0.68 : 1,
                    transition: justAllocated.has(t.id) ? 'opacity 1s ease' : 'opacity 0.12s',
                  }}>
                  <td onClick={e=>toggleSelect(e,t.id)} style={{ cursor:'pointer' }}>
                    <input type="checkbox" checked={isSelected} onChange={()=>{}} style={{ cursor:'pointer' }} />
                  </td>
                  <td style={{ color:'var(--stone)', fontSize:12 }}>
                    {t.date}
                    {!t.imported&&<span style={{ fontSize:9, padding:'1px 3px', borderRadius:3, background:'var(--al)', color:'var(--a2)', fontWeight:600, marginLeft:4 }}>M</span>}
                  </td>
                  {/* Description — inline edit */}
                  <td style={{ maxWidth:0 }}>
                    <InlineDescEditor txnId={t.id} value={t.desc} note={t.note} onSave={saveDesc} />
                  </td>
                  {/* Payee — always visible inline picker */}
                  <td style={{ maxWidth:0 }}>
                    <InlinePayeePicker
                      txnId={t.id} currentPayee={t.payee}
                      payees={payees||[]} setPayees={setPayees}
                      onSelect={allocatePayee} org={org} PALETTE={PALETTE}
                    />
                  </td>
                  {/* Category — inline picker always active; shows suggestion hint when pending */}
                  <td style={{ maxWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:3, minWidth:0 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <InlineCatPicker
                          txnId={t.id}
                          currentCatId={t.cat}
                          cats={cats||[]}
                          catMap={catMap}
                          onSelect={allocateCat}
                          onCreateCat={handleCreateCat}
                          suggestionCatId={pending?.sugCat || null}
                          suggestionLabel={pending?.fromIntel ? 'intel' : 'rule'}
                        />
                      </div>
                      {pending && !t.cat && (
                        <button
                          onClick={e => { e.stopPropagation(); setTxns(p => p.map(x => x.id===t.id ? {...x, _dismissed:true} : x)); }}
                          title="Dismiss suggestion"
                          style={{ flexShrink:0, background:'none', border:'none', cursor:'pointer', color:'var(--stone)', fontSize:13, padding:'0 3px', lineHeight:1, opacity:0.5 }}
                        >×</button>
                      )}
                    </div>
                  </td>
                  <td className={`tr ${t.amt>=0?'vp':'vn'}`}>{t.amt>=0?'+':''}{fmt(t.amt)}</td>
                  {accountTab===null&&(()=>{
                    const acct=(accounts||[]).find(a=>a.id===t.account_id);
                    return(
                      <td>
                        {acct?(
                          <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11 }}>
                            <span style={{ width:7, height:7, borderRadius:'50%', background:acct.colour||'#888', flexShrink:0 }} />
                            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--stone2)' }}>{acct.name}</span>
                          </span>
                        ):(
                          <span style={{ fontSize:11, color:'var(--sand4)', fontStyle:'italic' }}>unlinked</span>
                        )}
                      </td>
                    );
                  })()}
                  <td style={{ textAlign:'center' }}>
                    {status==='done'   &&<span style={{ fontSize:10, padding:'2px 10px', borderRadius:4, background:'var(--gnb)', color:'var(--gn)', fontWeight:600, letterSpacing:'0.02em', display:'inline-block', minWidth:50, textAlign:'center' }}>Done</span>}
                    {status==='pending'&&(
                      pending?.fromIntel
                        ? <span title={`Suggested: ${pending?.reason || 'Merchant intelligence'}`}
                            style={{ fontSize:10, padding:'2px 8px', borderRadius:4, fontWeight:600, letterSpacing:'0.04em', display:'inline-block', minWidth:50, textAlign:'center', background:'rgba(83,74,183,0.12)', color:'#534AB7', border:'0.5px solid rgba(83,74,183,0.3)', cursor:'default' }}>Suggest</span>
                        : <span title={`Rule: ${pending?.rule || 'Auto-cat rule'}`}
                            style={{ fontSize:10, padding:'2px 10px', borderRadius:4, fontWeight:600, letterSpacing:'0.04em', display:'inline-block', minWidth:50, textAlign:'center', background:'var(--al)', color:'var(--a2)', border:'0.5px solid rgba(186,117,23,0.3)', cursor:'default' }}>Match</span>
                    )}
                    {status==='todo'   &&<span style={{ fontSize:10, padding:'2px 10px', borderRadius:4, background:'var(--rdb)', color:'var(--rd)', fontWeight:600, letterSpacing:'0.02em', display:'inline-block', minWidth:50, textAlign:'center' }}>!</span>}
                  </td>
                  <td onClick={e=>requestDelete(e,t)} style={{ cursor:'pointer' }}>
                    <button className="btn-ghost" style={{ padding:'2px 5px', fontSize:13, color:'var(--stone)' }}>×</button>
                  </td>
                </tr>
              );
            })}
            {ft.length===0&&(
              <tr><td colSpan={accountTab===null?9:8} style={{ textAlign:'center', padding:24, color:'var(--stone)' }}>
                {accountTab==='unlinked'?'No unlinked transactions — all transactions are assigned to a bank account.':accountTab&&baseFt.length===0?'No transactions linked to this account.':'No transactions match your filters.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create-category type picker */}
      {newCatDraft && (
        <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) { newCatDraft.resolve(null); setNewCatDraft(null); } }}>
          <div className="modal" style={{ width:380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>New category</h3>
              <button className="btn-ghost" onClick={() => { newCatDraft.resolve(null); setNewCatDraft(null); }}>×</button>
            </div>
            <div style={{ padding:'20px 20px 8px' }}>
              <div style={{ fontSize:13, marginBottom:16 }}>Creating: <strong>"{newCatDraft.label}"</strong></div>
              <div style={{ fontSize:12, color:'var(--stone)', marginBottom:10 }}>Choose type:</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {[
                  ['expense',   'Expense',   'Money going out — food, bills, transport'],
                  ['income',    'Income',    'Money coming in — salary, freelance'],
                  ['asset',     'Asset',     'Things you own — investments, savings'],
                  ['liability', 'Liability', 'Money you owe — loans, credit cards'],
                  ['equity',    'Equity',    'Net worth, retained earnings'],
                ].map(([type, label, desc]) => (
                  <button key={type} className="btn" onClick={() => confirmCreateCat(type)}
                    style={{ textAlign:'left', padding:'10px 14px', display:'flex', flexDirection:'column', gap:2 }}>
                    <span style={{ fontWeight:500, fontSize:12.5 }}>{label}</span>
                    <span style={{ fontSize:11, color:'var(--stone)', fontWeight:400 }}>{desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-foot" style={{ justifyContent:'flex-end' }}>
              <button className="btn btn-sm" onClick={() => { newCatDraft.resolve(null); setNewCatDraft(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {detailId!==null&&<TransactionModal txnId={detailId} onClose={()=>setDetailId(null)} />}
      {showAdd&&<AddTransactionModal onClose={()=>setShowAdd(false)} />}
      <DeleteToast txn={pendingDelete} onConfirm={confirmDelete} onCancel={()=>setPendingDelete(null)} />
      {rulePrompt&&(
        <MakeRulePrompt desc={rulePrompt.desc} catLabel={rulePrompt.catLabel}
          onAccept={acceptRule} onDismiss={()=>setRulePrompt(null)}
          onNeverShow={()=>{setSessionPref('suppress_rule_prompt',true);setRulePrompt(null);}} />
      )}
    </>
  );
}
