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
import { updateTransaction, deleteTransaction, createRule, upsertPayee, createCategory, createCategoryWithCode, postCategoryJournal } from '../../lib/supabase';
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

  // Selectable = active accounts that are NOT parents-with-active-children
  const selectable = (cats||[]).filter(c => {
    if (c.is_active === false) return false;
    const hasSubs = cats.some(ch=>ch.parent_id===c.id&&ch.is_active!==false);
    return !hasSubs;
  });
  const flat = q.trim()
    ? selectable.filter(c => {
        const lq = q.toLowerCase();
        return (c.l||'').toLowerCase().includes(lq) || (c.code||'').includes(lq);
      })
    : selectable;

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
      if (flat[hi]) { pick(flat[hi].id); return; }
      const trimQ = q.trim();
      // Code pattern: "831" or "831/002" — create with pre-filled code
      if (/^\d{1,3}(\/\d{1,3})?$/.test(trimQ) && onCreateCat) {
        onCreateCat('__code__:' + trimQ).then(cat => { if (cat) pick(cat.id); });
        return;
      }
      if (flat.length === 0 && trimQ.length > 1 && onCreateCat) {
        onCreateCat(trimQ).then(cat => { if (cat) pick(cat.id); });
      }
    }
  }

  const current    = currentCatId    ? catMap[currentCatId]    : null;
  const suggestion = suggestionCatId ? catMap[suggestionCatId] : null;
  // What to display when closed: real cat > suggestion hint > empty
  const displayCat = current || (suggestion && !open ? suggestion : null);
  const isSuggestion = !current && !!suggestion && !open;

  // Group for display — with parent headers and numeric code sort
  function buildSectionItems(items) {
    const withParent = items.filter(c=>c.parent_id);
    const standalone = items.filter(c=>!c.parent_id);
    const byParent = {};
    withParent.forEach(c=>{if(!byParent[c.parent_id])byParent[c.parent_id]=[];byParent[c.parent_id].push(c);});
    const result = [];
    Object.keys(byParent).forEach(pid => {
      const parent = cats.find(x=>x.id===pid);
      if (parent) result.push({c:parent, isHeader:true, indent:false});
      byParent[pid].sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999))
        .forEach(ch=>result.push({c:ch, isHeader:false, indent:true}));
    });
    standalone.sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999))
      .forEach(c=>result.push({c, isHeader:false, indent:false}));
    return result;
  }
  const groups = {};
  CAT_TYPE_ORDER.forEach(t => { groups[t] = []; });
  flat.forEach(c => { if (groups[c.t]) groups[c.t].push(c); });
  const sections = q.trim()
    ? [{ label:'', items: flat.map(c=>({c, isHeader:false, indent:!!c.parent_id})) }]
    : CAT_TYPE_ORDER.filter(t=>groups[t].length>0).map(t=>({
        label: CAT_TYPE_LABELS[t],
        items: buildSectionItems(groups[t]),
      }));

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
          placeholder="Account…"
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
            title="Remove account"
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
              <span style={{ fontSize:11, marginRight:6 }}>✕</span>Remove account
            </div>
          )}
          {sections.map(({ label, items }) => (
            <React.Fragment key={label}>
              {label && <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', background:'var(--sand)', borderTop:'0.5px solid var(--bd)' }}>{label}</div>}
              {items.map(({c, isHeader, indent}) => {
                if (isHeader) return (
                  <div key={'h:'+c.id} style={{ padding:'4px 10px', fontSize:11, display:'flex', alignItems:'center', gap:6, background:'var(--sand)', color:'var(--stone)', borderTop:'0.5px solid var(--bd)', cursor:'default' }}>
                    <span style={{ width:7, height:7, borderRadius:'50%', background:c.col, flexShrink:0 }} />
                    {c.code && <span style={{ fontFamily:'monospace', fontSize:10, color:'var(--stone2)' }}>{c.code}</span>}
                    <span style={{ fontWeight:500 }}>{c.l}</span>
                  </div>
                );
                const idx = globalIdx++;
                return (
                  <div key={c.id}
                    style={{ padding:'6px 10px 6px '+(indent?'22px':'10px'), fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:7, background:idx===hi?'var(--al)':'', fontWeight:c.id===currentCatId?500:400 }}
                    onMouseEnter={() => setHi(idx)}
                    onMouseDown={() => pick(c.id)}
                  >
                    {indent && <span style={{ fontSize:9, color:'var(--stone2)' }}>└</span>}
                    <span style={{ width:7, height:7, borderRadius:'50%', background:c.col, flexShrink:0 }} />
                    {c.code && <span style={{ fontFamily:'monospace', fontSize:10, color:'var(--stone2)', flexShrink:0 }}>
                      {indent && c.code.includes('/') ? '/' + c.code.split('/')[1] : c.code}
                    </span>}
                    <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.l}</span>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
          {q.trim().length > 0 && (
            <div
              style={{ padding:'8px 10px', fontSize:12, cursor:'pointer', color:'var(--a2)', fontWeight:500, display:'flex', alignItems:'center', gap:6 }}
              onMouseDown={async () => {
                if (!onCreateCat) return;
                const trimQ = q.trim();
                const isCode = /^\d{1,3}(\/\d{1,3})?$/.test(trimQ);
                const signal = isCode ? '__code__:' + trimQ : trimQ;
                const cat = await onCreateCat(signal);
                if (cat) pick(cat.id);
              }}
            >
              <span style={{ fontSize:13 }}>+</span>
              {/^\d{1,3}(\/\d{1,3})?$/.test(q.trim())
                ? <span>Create account with code <strong style={{ fontFamily:'monospace' }}>{q.trim()}</strong></span>
                : <span>Create account &ldquo;{q.trim()}&rdquo;</span>
              }
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
// ── Suppression store ─────────────────────────────────────────────────────────
const SUPPRESS_THRESHOLD = 2;
const SUPPRESS_KEY_PAYEE = 'ledger_suppressed_payee';
const SUPPRESS_KEY_CAT   = 'ledger_suppressed_cat';
function getSuppressed(k){try{return JSON.parse(localStorage.getItem(k)||'{}');}catch{return{};}}
function recordSuppression(k,kw){const s=getSuppressed(k);s[kw]=(s[kw]||0)+1;try{localStorage.setItem(k,JSON.stringify(s));}catch{}return s[kw];}
function isSuppressed(k,kw){return(getSuppressed(k)[kw]||0)>=SUPPRESS_THRESHOLD;}

export function Transactions({ defaultAccountTab = null, onClearDefaultTab }) {
  const { txns, setTxns, cats, setCats, catMap, rules, setRules, payees, setPayees,
          accounts, dateFrom, dateTo, toast, org, user, PALETTE } = useApp();

  const [accountTab,    setAccountTab]    = useState(defaultAccountTab);
  const [allocTab,      setAllocTab]      = useState('all');
  const [search,        setSearch]        = useState('');
  const [typeFilter,    setTypeFilter]    = useState('');
  const [payeeFilter,   setPayeeFilter]   = useState('');
  const [selected,      setSelected]      = useState(new Set());
  const [sortCol,       setSortCol]       = useState('date');
  const [sortDir,       setSortDir]       = useState('desc'); // 'asc' | 'desc'

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortCol(col); setSortDir(col==='date'?'desc':'asc'); }
  }

  // Auto-assign payees: match payee names against transaction descriptions.
  // Two strategies (in priority order):
  //   1. Payee name appears verbatim in the description (case-insensitive)
  //   2. Extracted merchant name matches a payee name (case-insensitive)
  useEffect(() => {
    if (!txns?.length || !payees?.length) return;
    const unassigned = txns.filter(t => !t.payee_id);
    if (!unassigned.length) return;
    // Sort payees longest-first so "Woolworths Metro" matches before "Woolworths"
    const sortedPayees = [...payees].sort((a,b)=>(b.name||'').length-(a.name||'').length);
    const toAssign = [];
    for (const t of unassigned) {
      const desc = (t.desc || t.description || '').toLowerCase();
      if (!desc) continue;
      const _merchant = (extractMerchantName(t.desc||'')||'').toLowerCase();
      if (_merchant && isSuppressed(SUPPRESS_KEY_PAYEE, _merchant)) continue;
      // Strategy 1: payee name substring in description
      let matched = sortedPayees.find(p => {
        const name = (p.name||'').toLowerCase();
        return name.length >= 3 && desc.includes(name);
      });
      // Strategy 2: extracted merchant matches payee
      if (!matched) {
        const merchant = _merchant;
        if (merchant.length >= 3) {
          matched = sortedPayees.find(p => {
            const name = (p.name||'').toLowerCase();
            return name === merchant || merchant.startsWith(name) || name.startsWith(merchant);
          });
        }
      }
      if (matched) toAssign.push({ txnId: t.id, payeeId: matched.id, payeeName: matched.name });
    }
    if (!toAssign.length) return;
    Promise.all(toAssign.map(({ txnId, payeeId }) =>
      updateTransaction(txnId, { payee_id: payeeId }).catch(() => {})
    )).then(() => {
      setTxns(p => (p||[]).map(t => {
        const found = toAssign.find(a => a.txnId === t.id);
        return found ? { ...t, payee: found.payeeName, payee_id: found.payeeId } : t;
      }));
    });
  }, [txns?.length, payees?.length]); // eslint-disable-line
  const [bulkCatDD,     setBulkCatDD]     = useState(false);
  const bulkBtnRef = React.useRef(null);
  const [bulkPayeeId,   setBulkPayeeId]   = useState('');
  const [bulkCatQ,      setBulkCatQ]      = useState('');
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
  ft = [...ft].sort((a,b)=>{
    let av, bv;
    if (sortCol==='date')   { av=a.date||''; bv=b.date||''; }
    else if (sortCol==='desc')  { av=(a.desc||a.description||'').toLowerCase(); bv=(b.desc||b.description||'').toLowerCase(); }
    else if (sortCol==='payee') { av=(a.payee||'').toLowerCase(); bv=(b.payee||'').toLowerCase(); }
    else if (sortCol==='amt')   { av=a.amt??0; bv=b.amt??0; }
    else if (sortCol==='cat')   { av=(catMap[a.cat]?.l||'').toLowerCase(); bv=(catMap[b.cat]?.l||'').toLowerCase(); }
    else                        { av=a.date||''; bv=b.date||''; }
    if (av<bv) return sortDir==='asc'?-1:1;
    if (av>bv) return sortDir==='asc'?1:-1;
    return 0;
  });

  if (typeof window!=='undefined') window.__ledgerFt = ft;

  const ua = baseFt.filter(t=>!t.cat).length;
  const unlinkedCount = useMemo(()=>filterByDateRange(txns||[],dateFrom,dateTo).filter(t=>!t.account_id).length,[txns,dateFrom,dateTo]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function allocateCat(txnId, catId) {
    const txn=txns.find(t=>t.id===txnId);
    const prev=txn?.cat?catMap[txn.cat]?.l:null, next=catId?catMap[catId]?.l:null;
    const pending = pendingCatMap[txnId];
    const sugPayeeName = (!txn?.payee && pending?.sugPayee) ? pending.sugPayee : null;

    // ── Optimistic UI update first — instant feedback ───────────────────────
    setTxns(p=>(p||[]).map(t=>t.id===txnId?{...t,cat:catId??null,category_id:catId??null}:t));

    // ── Background: DB writes (non-blocking after UI update) ────────────────
    const updates = { category_id: catId ?? null };
    let newPayeeObj = null;

    // Resolve payee upsert first (needed for DB update)
    if (sugPayeeName) {
      try {
        const col = PALETTE[(payees||[]).length % (PALETTE||['#888']).length];
        newPayeeObj = await upsertPayee(org.id, sugPayeeName, col);
        if (!payees?.find(x=>x.name?.toLowerCase()===sugPayeeName.toLowerCase())) {
          setPayees(prev => [...(prev||[]), newPayeeObj]);
        }
        updates.payee_id = newPayeeObj.id;
        setTxns(p=>(p||[]).map(t=>t.id===txnId?{...t,payee:newPayeeObj.name,payee_id:newPayeeObj.id}:t));
      } catch(e) { console.warn('Payee assign failed:', e.message); }
    }

    // Fire remaining DB calls in parallel (non-blocking)
    updateTransaction(txnId, updates).catch(e=>console.warn('updateTxn failed:',e.message));
    if (!catId && txn) { const k=(extractMerchantName(txn.desc||txn.description||'')||'').toLowerCase(); if(k) recordSuppression(SUPPRESS_KEY_CAT,k); }
    logAudit({orgId:org.id,userId:user?.id,transaction:txn,action:catId?'category_changed':'unallocated',changedFields:{category:{from:prev??'Unallocated',to:next??'Unallocated'}}}).catch(()=>{});
    if (catId) {
      const cat=catMap[catId], acct=txn?.account_id?(accounts||[]).find(a=>a.id===txn.account_id):null;
      postCategoryJournal(org.id,txn??{id:txnId,date:'',desc:'',amt:0},cat,acct)
        .then(entry=>{ if(entry) setTxns(p=>(p||[]).map(t=>t.id===txnId?{...t,journal_entry_id:entry.id}:t)); })
        .catch(e=>console.warn('Journal post failed:',e.message));
    }
    if(catId&&allocTab==='uncategorised'){
      setJustAllocated(p=>new Set([...p,txnId]));
      setTimeout(()=>setJustAllocated(p=>{const n=new Set(p);n.delete(txnId);return n;}),2500);
    }
    if (!catId && txn) { const k=(extractMerchantName(txn.desc||txn.description||'')||'').toLowerCase(); if(k) recordSuppression(SUPPRESS_KEY_CAT,k); }
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
    if (!payeeObj && txn) { const k=(extractMerchantName(txn.desc||txn.description||'')||'').toLowerCase(); if(k) recordSuppression(SUPPRESS_KEY_PAYEE,k); }
    // Optimistic update first
    setTxns(p=>(p||[]).map(t=>t.id===txnId?{...t,payee:payeeObj?.name??'',payee_id:payeeObj?.id??null}:t));
    // Fire DB in background
    updateTransaction(txnId,{payee_id:payeeObj?.id??null}).catch(()=>{});
    if(txn) logAudit({orgId:org.id,userId:user?.id,transaction:txn,action:'payee_changed',changedFields:{payee:{from:txn.payee||'None',to:payeeObj?.name||'None'}}}).catch(()=>{});
  }

  // Create a new category — shows type picker modal, returns Promise
  async function handleCreateCat(label) {
    if (label.startsWith('__code__:')) {
      const code = label.replace('__code__:', '');
      // Sub-code pattern: "831/002" → find parent account with code "831"
      if (code.includes('/')) {
        const [parentCode, suffix] = code.split('/');
        const parentAcc = (cats||[]).find(c => c.code === parentCode && c.is_active !== false);
        return new Promise(resolve => setNewCatDraft({
          label: '', code, parentAcc, suffix, isSub: true, resolve
        }));
      }
      return new Promise(resolve => setNewCatDraft({ label:'', code, resolve }));
    }
    return new Promise(resolve => setNewCatDraft({ label: label.trim(), resolve }));
  }

  function suggestAccountCode(type, label) {
    const TYPE_RANGES = { asset:[100,399], liability:[400,599], equity:[600,699], income:[700,799], expense:[800,998] };
    const [lo, hi] = TYPE_RANGES[type] || [800,998];
    const used = new Set((cats||[]).filter(c=>c.code&&!c.code.includes('/')).map(c=>parseInt(c.code)).filter(n=>!isNaN(n)));
    if (!label?.trim()) {
      for (let n=lo; n<=hi; n++) { if (!used.has(n)) return String(n); }
      return null;
    }
    const peers = (cats||[]).filter(c=>c.t===type&&c.is_active!==false&&c.code&&!c.code.includes('/')).sort((a,b)=>(a.l||'').localeCompare(b.l||''));
    const insertIdx = peers.findIndex(p=>(p.l||'').toLowerCase()>label.toLowerCase());
    const insertPos = insertIdx===-1 ? peers.length : insertIdx;
    const rangeSize = hi-lo+1;
    const idealNum = lo+Math.round((insertPos/(peers.length+1))*rangeSize);
    for (let delta=0; delta<=rangeSize; delta++) {
      if (!used.has(idealNum+delta) && idealNum+delta<=hi) return String(idealNum+delta);
      if (!used.has(idealNum-delta) && idealNum-delta>=lo) return String(idealNum-delta);
    }
    return null;
  }

  async function confirmCreateCat(type) {
    if (!newCatDraft) return;
    const { label, code: draftCode, parentAcc, isSub, resolve } = newCatDraft;
    setNewCatDraft(null);
    const effectiveType = isSub && parentAcc ? parentAcc.t : type;
    const code = draftCode || suggestAccountCode(effectiveType, label);
    const payload = {
      label,
      type: effectiveType,
      account_group: label,
      colour: parentAcc?.col || PALETTE[(cats||[]).length % PALETTE.length] || '#888780',
      sort_order: parseInt(code) || (cats||[]).length,
      code,
      parent_id: parentAcc?.id || null,
    };
    try {
      const created = await createCategoryWithCode(org.id, payload);
      const norm = { ...created, l:created.label, t:created.type, col:created.colour,
        ac:created.account_group, code:created.code||null, is_active:true,
        parent_id: created.parent_id||null };
      setCats(prev => [...(prev||[]), norm]);
      toast(`Account "${label}" created${code ? ` (${code})` : ''}.`);
      resolve(norm);
    } catch(e) {
      toast('Could not create account: ' + e.message);
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
    if (selected.size === 0) return;
    const ids = [...selected];
    const isUnassign = !catId;
    const updates = { category_id: catId || null };
    // Assign payee from dropdown if one is selected
    let payeeObj = null;
    if (!isUnassign && bulkPayeeId) {
      payeeObj = (payees||[]).find(p => p.id === bulkPayeeId) || null;
      if (payeeObj) updates.payee_id = payeeObj.id;
    }
    await Promise.all(ids.map(id => updateTransaction(id, updates)));
    setTxns(p => (p||[]).map(t => selected.has(t.id)
      ? { ...t,
          cat:      catId ?? null, category_id: catId ?? null,
          payee:    isUnassign ? '' : (payeeObj?.name ?? t.payee),
          payee_id: isUnassign ? null : (payeeObj?.id ?? t.payee_id) }
      : t));
    setSelected(new Set()); setBulkCatDD(false); setBulkPayeeId(''); setBulkCatQ('');
    const label = isUnassign ? 'Unassigned' : catMap[catId]?.l;
    toast(`${ids.length} transaction${ids.length>1?'s':''} → ${label}.`);
    if (!isUnassign) {
      const cat = catMap[catId];
      const selectedTxns = (txns||[]).filter(t => ids.includes(t.id));
      Promise.all(selectedTxns.map(txn => {
        const acct = txn.account_id ? (accounts||[]).find(a=>a.id===txn.account_id) : null;
        return postCategoryJournal(org.id, txn, cat, acct).catch(e=>console.warn('Bulk journal failed:',e.message));
      }));
    }
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
                <button ref={bulkBtnRef} className="btn btn-a btn-sm" onClick={()=>setBulkCatDD(v=>!v)}>Categorise {selected.size} ▾</button>
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
                {bulkCatDD&&(()=>{
                  const br=bulkBtnRef.current?.getBoundingClientRect();
                  return <div style={{ position:'fixed', top:(br?.bottom??0)+4, right:window.innerWidth-(br?.right??0), background:'#FDFAF6', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', padding:0, minWidth:280, maxHeight:360, overflowY:'auto', zIndex:9999, boxShadow:'0 8px 24px rgba(42,36,32,0.18)' }}>
                    {/* Payee + category search */}
                    <div style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--bd)', background:'#FDFAF6', position:'sticky', top:0, zIndex:1 }}>
                      <div style={{ fontSize:10, color:'var(--stone)', marginBottom:4 }}>Assign payee (optional)</div>
                      <select value={bulkPayeeId} onChange={e=>setBulkPayeeId(e.target.value)}
                        style={{ width:'100%', fontSize:12, padding:'4px 6px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#fff', marginBottom:6 }}>
                        <option value="">— no payee —</option>
                        {(payees||[]).sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(p=>(
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <input placeholder="Search accounts…" value={bulkCatQ||''} onChange={e=>setBulkCatQ(e.target.value)}
                        style={{ width:'100%', fontSize:12, padding:'4px 6px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#fff', boxSizing:'border-box' }} />
                    </div>
                    {/* Unassign */}
                    <div style={{ padding:'7px 10px', fontSize:12, cursor:'pointer', color:'var(--rd)', display:'flex', alignItems:'center', gap:7, borderBottom:'0.5px solid var(--bd)' }}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(163,45,45,0.06)'}
                      onMouseLeave={e=>e.currentTarget.style.background=''}
                      onClick={()=>bulkAllocate(null)}>
                      ✕ Unassign category
                    </div>
                    {/* Category list with search filter */}
                    {CAT_TYPE_ORDER.filter(t=>catsByType[t]?.some(cat=>{
                      if (!bulkCatQ) return true;
                      const q=bulkCatQ.toLowerCase();
                      return (cat.l||'').toLowerCase().includes(q)||(cat.code||'').includes(q);
                    })).map(type=>(
                      <React.Fragment key={type}>
                        <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', background:'#f5f0eb', borderTop:'0.5px solid var(--bd)' }}>{CAT_TYPE_LABELS[type]}</div>
                        {catsByType[type].filter(cat=>{
                          if (!bulkCatQ) return true;
                          const q=bulkCatQ.toLowerCase();
                          return (cat.l||'').toLowerCase().includes(q)||(cat.code||'').includes(q);
                        }).map(cat => {
                          const hasSubs = (cats||[]).some(ch=>ch.parent_id===cat.id&&ch.is_active!==false);
                          if (hasSubs) return (
                            <div key={cat.id} style={{ padding:'4px 10px', fontSize:11.5, background:'var(--sand)', color:'var(--stone)', display:'flex', alignItems:'center', gap:6, borderTop:'0.5px solid var(--bd)' }}>
                              <span style={{ width:7,height:7,borderRadius:'50%',background:cat.col,flexShrink:0 }}/>
                              {cat.code&&<span style={{fontFamily:'monospace',fontSize:10}}>{cat.code}</span>}
                              <span style={{fontWeight:500}}>{cat.l}</span>
                            </div>
                          );
                          return (
                            <div key={cat.id} style={{ padding:'6px 10px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:7 }}
                              onMouseEnter={e=>e.currentTarget.style.background='var(--al)'}
                              onMouseLeave={e=>e.currentTarget.style.background='#FDFAF6'}
                              onClick={()=>bulkAllocate(cat.id)}>
                              <span style={{ width:7,height:7,borderRadius:'50%',background:cat.col,flexShrink:0 }}/>
                              {cat.code&&<span style={{fontFamily:'monospace',fontSize:10,color:'var(--stone2)',flexShrink:0}}>{cat.code.includes('/')?'/'+cat.code.split('/')[1]:cat.code}</span>}
                              <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cat.l}</span>
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>;
                })()
                }
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
              <th style={{ width:36, padding:'0 0 0 10px', verticalAlign:'middle', textAlign:'left' }}>
                <input type="checkbox"
                  checked={ft.length>0 && ft.every(t=>selected.has(t.id))}
                  onChange={e => e.target.checked ? selectAll() : setSelected(new Set())}
                  style={{ cursor:'pointer', display:'block' }} />
              </th>
              {[['date','Date'],['desc','Description'],['payee','Payee'],['cat','Account'],['amt','Amount']].map(([col,label])=>(
                <th key={col} onClick={()=>toggleSort(col)} className={col==='amt'?'tr':undefined}
                  style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
                  {label}
                  <span style={{ marginLeft:4, fontSize:9, opacity:sortCol===col?0.9:0.3 }}>
                    {sortCol===col ? (sortDir==='asc'?'▲':'▼') : '⇅'}
                  </span>
                </th>
              ))}
              {accountTab===null&&<th>Bank</th>}
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
                    opacity: justAllocated.has(t.id) ? 0.3 : 1,
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
                          suggestionCatId={(() => {
                            const sid = pending?.sugCat || null;
                            if (!sid) return null;
                            const hasSubs = (cats||[]).some(ch=>ch.parent_id===sid&&ch.is_active!==false);
                            return hasSubs ? null : sid;
                          })()}
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
                  <td style={{ whiteSpace:'nowrap', textAlign:'right', padding:'0 6px 0 0' }}>
                    <button className="btn-ghost" title="Open details" onClick={e=>{e.stopPropagation();setDetailId(t.id);}}
                      style={{ padding:'2px 5px', fontSize:12, color:'var(--stone)', opacity:0.6 }}>⤢</button>
                    <button className="btn-ghost" title="Delete" onClick={e=>requestDelete(e,t)}
                      style={{ padding:'2px 5px', fontSize:13, color:'var(--stone)' }}>×</button>
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
              <h3>
                {newCatDraft.isSub
                  ? `New sub-account /${newCatDraft.suffix} under "${newCatDraft.parentAcc?.l||newCatDraft.code}"`
                  : newCatDraft.code ? `New account — code ${newCatDraft.code}` : 'New account'}
              </h3>
              <button className="btn-ghost" onClick={() => { newCatDraft.resolve(null); setNewCatDraft(null); }}>×</button>
            </div>
            <div className="modal-body">
              {/* Name input — always required */}
              <div className="field">
                <label>Account name <span style={{ color:'var(--rd)' }}>*</span></label>
                <input autoFocus type="text"
                  defaultValue={newCatDraft.label||''}
                  onChange={e => setNewCatDraft(p => ({ ...p, label: e.target.value }))}
                  placeholder={newCatDraft.isSub ? `e.g. ${newCatDraft.parentAcc?.l||'Sub-account'} — Division` : 'e.g. Gym & Fitness'}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newCatDraft.label?.trim()) {
                      // For sub-codes, type is inherited from parent — skip type picker
                      if (newCatDraft.isSub && newCatDraft.parentAcc) confirmCreateCat(newCatDraft.parentAcc.t);
                      else confirmCreateCat('expense');
                    }
                  }}
                />
              </div>
              {newCatDraft.isSub && newCatDraft.parentAcc && (
                <div style={{ padding:'8px 12px', background:'var(--gnb)', borderRadius:'var(--rr)', fontSize:12, color:'var(--gn)', marginBottom:14 }}>
                  Sub-account of <strong>{newCatDraft.parentAcc.l}</strong> · type: <strong>{newCatDraft.parentAcc.t}</strong> · code: <strong>{newCatDraft.code}</strong>
                </div>
              )}
              {newCatDraft.isSub ? (
                /* Sub-account: type is inherited, just show a create button */
                <button className="btn btn-a" style={{ width:'100%' }}
                  disabled={!newCatDraft.label?.trim()}
                  onClick={() => newCatDraft.label?.trim() && confirmCreateCat(newCatDraft.parentAcc?.t||'expense')}>
                  Create sub-account
                </button>
              ) : (
                <>
                  <div style={{ fontSize:12, color:'var(--stone)', marginBottom:10 }}>Choose account type:</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {[
                      ['expense',   'Expense',   'Money going out — food, bills, transport'],
                      ['income',    'Income',    'Money coming in — salary, freelance'],
                      ['asset',     'Asset',     'Things you own — investments, savings'],
                      ['liability', 'Liability', 'Money you owe — loans, credit cards'],
                      ['equity',    'Equity',    'Net worth, retained earnings'],
                    ].map(([type, label, desc]) => {
                      const sugCode = newCatDraft.code || suggestAccountCode(type, newCatDraft?.label);
                      return (
                        <button key={type} className="btn"
                          disabled={!newCatDraft.label?.trim()}
                          onClick={() => newCatDraft.label?.trim() && confirmCreateCat(type)}
                          style={{ textAlign:'left', padding:'10px 14px', display:'flex', alignItems:'center', gap:10,
                            opacity: newCatDraft.label?.trim() ? 1 : 0.45 }}>
                          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:2 }}>
                            <span style={{ fontWeight:500, fontSize:12.5 }}>{label}</span>
                            <span style={{ fontSize:11, color:'var(--stone)', fontWeight:400 }}>{desc}</span>
                          </div>
                          {sugCode && <span style={{ fontSize:11, fontFamily:'monospace', color:'var(--stone)', flexShrink:0 }}>{sugCode}</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
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
