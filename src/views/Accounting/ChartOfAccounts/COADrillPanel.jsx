/**
 * views/Accounting/ChartOfAccounts/COADrillPanel.jsx
 * Slide-out panel showing transactions for a selected account.
 */
import React, { useState } from 'react';
import { updateTransaction } from '../../../lib/supabase';
import { filterByDateRange, fmt } from '../../../utils/helpers';

const CAT_TYPE_ORDER  = ['asset','liability','equity','income','expense'];
const CAT_TYPE_LABELS = { asset:'Assets', liability:'Liabilities', equity:'Equity', income:'Revenue', expense:'Expenses' };

export function COADrillPanel({ cat, txns, setTxns, cats, dateFrom, dateTo, onClose, onEdit, toast }) {
  const catTxns = filterByDateRange(txns, dateFrom, dateTo)
    .filter(t => t.cat === cat.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = catTxns.reduce((s, t) => s + t.amt, 0);

  const [editId,   setEditId]   = useState(null);
  const [editDesc, setEditDesc] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editCat,  setEditCat]  = useState('');
  const [selected, setSelected] = useState(new Set());
  const [bulkCat,  setBulkCat]  = useState('');

  function toggleSelect(id) { setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function selectAll() { setSelected(new Set(catTxns.map(t => t.id))); }
  function clearSel()  { setSelected(new Set()); }

  async function bulkRecategorise() {
    if (!bulkCat || selected.size === 0) return;
    const ids = [...selected];
    await Promise.all(ids.map(id => updateTransaction(id, { category_id: bulkCat })));
    if (setTxns) setTxns(prev => prev.map(t => selected.has(t.id) ? { ...t, cat: bulkCat, category_id: bulkCat } : t));
    toast(`${ids.length} transactions re-categorised.`);
    clearSel(); setBulkCat('');
  }

  async function saveEdit(txn) {
    const updates = { description: editDesc, note: editNote || null };
    if (editCat && editCat !== txn.cat) updates.category_id = editCat;
    await updateTransaction(txn.id, updates);
    if (setTxns) setTxns(prev => prev.map(t => t.id === txn.id ? { ...t, desc: editDesc, description: editDesc, note: editNote || null, cat: editCat || t.cat, category_id: editCat || t.cat } : t));
    toast(editCat && editCat !== txn.cat ? 'Transaction re-categorised.' : 'Transaction updated.');
    setEditId(null);
  }

  const sortedCats = (type) => (cats || []).filter(c2 => c2.id !== cat.id && c2.t === type && c2.is_active !== false)
    .sort((a, b) => (parseInt(a.code) || 9999) - (parseInt(b.code) || 9999));

  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:520, background:'var(--sand)', boxShadow:'-4px 0 24px rgba(42,36,32,0.15)', zIndex:800, display:'flex', flexDirection:'column', borderLeft:'0.5px solid var(--bd2)' }}>
      {/* Header */}
      <div style={{ padding:'14px 18px', borderBottom:'0.5px solid var(--bd)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ width:10, height:10, borderRadius:'50%', background:cat.col, flexShrink:0, display:'inline-block' }} />
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:500, fontSize:14 }}>{cat.code ? `${cat.code} · ${cat.l}` : cat.l}</div>
          <div style={{ fontSize:11, color:'var(--stone)', marginTop:1 }}>{cat.ac} · {cat.t}</div>
        </div>
        <button className="btn btn-sm" onClick={onEdit} style={{ marginRight:4 }}>Edit account</button>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--stone)', lineHeight:1, padding:0 }}>×</button>
      </div>

      {/* Stats */}
      <div style={{ padding:'10px 18px', background:'var(--sand2)', borderBottom:'0.5px solid var(--bd)', display:'flex', gap:24, flexShrink:0 }}>
        {[{ label:'Transactions', val: catTxns.length }, { label:'Total', val:(total>=0?'+':'')+fmt(total), cls:total>=0?'vp':'vn' }, { label:'Average', val:catTxns.length>0?fmt(Math.abs(total/catTxns.length)):'—' }].map(m => (
          <div key={m.label}>
            <div style={{ fontSize:10, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:500 }}>{m.label}</div>
            <div style={{ fontSize:15, fontWeight:500 }} className={m.cls||''}>{m.val}</div>
          </div>
        ))}
      </div>

      {/* Bulk toolbar */}
      {catTxns.length > 0 && (
        <div style={{ padding:'7px 18px', background:'var(--sand2)', borderBottom:'0.5px solid var(--bd)', display:'flex', alignItems:'center', gap:10, flexShrink:0, flexWrap:'wrap' }}>
          <input type="checkbox" checked={selected.size === catTxns.length && catTxns.length > 0} onChange={e => e.target.checked ? selectAll() : clearSel()} style={{ cursor:'pointer' }} />
          <span style={{ fontSize:11.5, color:'var(--stone)' }}>{selected.size > 0 ? `${selected.size} of ${catTxns.length} selected` : `${catTxns.length} transactions`}</span>
          {selected.size > 0 && (
            <>
              <select value={bulkCat} onChange={e => setBulkCat(e.target.value)} style={{ fontSize:12, padding:'4px 8px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--sand)', fontFamily:'var(--font-sans)', flex:1, minWidth:140 }}>
                <option value="">Move to account…</option>
                {CAT_TYPE_ORDER.map(type => { const grp = sortedCats(type); if (!grp.length) return null; return <optgroup key={type} label={CAT_TYPE_LABELS[type]}>{grp.map(c2 => <option key={c2.id} value={c2.id}>{c2.code ? `${c2.code} · ` : ''}{c2.l}</option>)}</optgroup>; })}
              </select>
              <button className="btn btn-a btn-sm" onClick={bulkRecategorise} disabled={!bulkCat}>Move {selected.size}</button>
              <button className="btn btn-sm" onClick={clearSel}>Clear</button>
            </>
          )}
        </div>
      )}

      {/* Transaction list */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {catTxns.length === 0
          ? <div style={{ padding:24, textAlign:'center', color:'var(--stone)', fontSize:12 }}>No transactions in current date range.</div>
          : catTxns.map(t => (
            <div key={t.id} style={{ borderBottom:'0.5px solid var(--bd)', padding:'10px 18px' }}>
              {editId === t.id ? (
                <div>
                  <input value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ width:'100%', padding:'5px 8px', fontSize:12.5, border:'0.5px solid var(--a)', borderRadius:'var(--rr)', marginBottom:6, fontFamily:'var(--font-sans)' }} />
                  <input value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Note (optional)" style={{ width:'100%', padding:'4px 8px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', marginBottom:6, fontFamily:'var(--font-sans)' }} />
                  <div style={{ marginBottom:8 }}>
                    <label style={{ fontSize:11, color:'var(--stone)', fontWeight:500, display:'block', marginBottom:3 }}>Re-categorise to</label>
                    <select value={editCat} onChange={e => setEditCat(e.target.value)} style={{ width:'100%', padding:'5px 8px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--sand)', fontFamily:'var(--font-sans)', color:'var(--ink)' }}>
                      <option value="">— Keep current ({cat.l}) —</option>
                      {CAT_TYPE_ORDER.map(type => { const group = (cats||[]).filter(c2=>c2.id!==cat.id&&c2.t===type).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)); if (!group.length) return null; return <optgroup key={type} label={CAT_TYPE_LABELS[type]}>{group.map(c2=><option key={c2.id} value={c2.id}>{c2.code?`${c2.code} · `:''}{c2.l}</option>)}</optgroup>; })}
                    </select>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-a btn-sm" onClick={() => saveEdit(t)}>Save</button>
                    <button className="btn btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} onClick={e => e.stopPropagation()} style={{ cursor:'pointer', marginTop:3, flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
                      <span style={{ fontSize:12.5, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{t.desc}</span>
                      <span style={{ fontSize:13, fontWeight:500, flexShrink:0 }} className={t.amt>=0?'vp':'vn'}>{t.amt>=0?'+':''}{fmt(t.amt)}</span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--stone)', marginTop:2 }}>{t.date}{t.payee&&` · ${t.payee}`}{t.note&&` · 📝 ${t.note}`}</div>
                  </div>
                  <button className="btn-ghost" style={{ fontSize:11, color:'var(--stone)', padding:'2px 6px', flexShrink:0 }} onClick={() => { setEditId(t.id); setEditDesc(t.desc); setEditNote(t.note||''); setEditCat(''); }}>Edit</button>
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  );
}
