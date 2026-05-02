/**
 * views/Accounting/ChartOfAccounts.jsx
 * Full Chart of Accounts:
 * - Sticky toolbar (search, seed, + new account)
 * - All accounts including zero-balance with toggle
 * - Drill-through: click account → side panel with transactions + editable detail
 * - Three COA seed options
 */

import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { createCategory, updateCategory, deleteCategory, updateTransaction } from '../../lib/supabase';
import { filterByDateRange, fmt } from '../../utils/helpers';

// ── COA templates ─────────────────────────────────────────────────────────────
const COA_PERSONAL = [
  { label:'Bank Account 1',        type:'asset',     group:'Current Assets',      colour:'#185FA5' },
  { label:'Bank Account 2',        type:'asset',     group:'Current Assets',      colour:'#0C447C' },
  { label:'Savings Account',       type:'asset',     group:'Current Assets',      colour:'#3B6D11' },
  { label:'Investment Account',    type:'asset',     group:'Investments',         colour:'#1D9E75' },
  { label:'Motor Vehicle',         type:'asset',     group:'Fixed Assets',        colour:'#185FA5' },
  { label:'Office Equipment',      type:'asset',     group:'Fixed Assets',        colour:'#0C447C' },
  { label:'Credit Card',           type:'liability', group:'Current Liabilities', colour:'#A32D2D' },
  { label:'Personal Loan',         type:'liability', group:'Current Liabilities', colour:'#E24B4A' },
  { label:'HELP / HECS Debt',      type:'liability', group:'Current Liabilities', colour:'#993C1D' },
  { label:'Owner Equity',          type:'equity',    group:'Equity',              colour:'#534AB7' },
  { label:'Drawings',              type:'equity',    group:'Equity',              colour:'#5F5E5A' },
  { label:'Salary',                type:'income',    group:'Revenue',             colour:'#3B6D11' },
  { label:'Interest Received',     type:'income',    group:'Revenue',             colour:'#1D9E75' },
  { label:'Other Income',          type:'income',    group:'Revenue',             colour:'#888780' },
  { label:'Groceries',             type:'expense',   group:'Living Expenses',     colour:'#BA7517' },
  { label:'Utilities',             type:'expense',   group:'Housing',             colour:'#854F0B' },
  { label:'Rent / Mortgage',       type:'expense',   group:'Housing',             colour:'#993C1D' },
  { label:'Internet & Phone',      type:'expense',   group:'Communications',      colour:'#185FA5' },
  { label:'Transport',             type:'expense',   group:'Transport',           colour:'#0C447C' },
  { label:'Fuel',                  type:'expense',   group:'Vehicle',             colour:'#3B6D11' },
  { label:'Health & Medical',      type:'expense',   group:'Health',              colour:'#0F6E56' },
  { label:'Gym & Fitness',         type:'expense',   group:'Health',              colour:'#1D9E75' },
  { label:'Dining & Café',         type:'expense',   group:'Entertainment',       colour:'#D85A30' },
  { label:'Entertainment',         type:'expense',   group:'Entertainment',       colour:'#7F77DD' },
  { label:'Subscriptions',         type:'expense',   group:'Entertainment',       colour:'#D4537E' },
  { label:'Insurance',             type:'expense',   group:'Insurance',           colour:'#534AB7' },
  { label:'Bank Fees',             type:'expense',   group:'Financial',           colour:'#5F5E5A' },
  { label:'Education',             type:'expense',   group:'Education',           colour:'#185FA5' },
  { label:'Super Contributions',   type:'expense',   group:'Superannuation',      colour:'#3B6D11' },
  { label:'Income Tax',            type:'expense',   group:'Tax',                 colour:'#A32D2D' },
  { label:'Miscellaneous',         type:'expense',   group:'Miscellaneous',       colour:'#888780' },
];

const COA_COMPANY = [
  { label:'Bank – Operating',          type:'asset',     group:'Current Assets',       colour:'#185FA5' },
  { label:'Bank – Savings',            type:'asset',     group:'Current Assets',       colour:'#0C447C' },
  { label:'Petty Cash',                type:'asset',     group:'Current Assets',       colour:'#3B6D11' },
  { label:'Accounts Receivable',       type:'asset',     group:'Current Assets',       colour:'#1D9E75' },
  { label:'GST Receivable',            type:'asset',     group:'Current Assets',       colour:'#639922' },
  { label:'Motor Vehicle',             type:'asset',     group:'Fixed Assets',         colour:'#185FA5' },
  { label:'Office Equipment',          type:'asset',     group:'Fixed Assets',         colour:'#0C447C' },
  { label:'Computer Equipment',        type:'asset',     group:'Fixed Assets',         colour:'#3B6D11' },
  { label:'Accumulated Depreciation',  type:'asset',     group:'Fixed Assets',         colour:'#888780' },
  { label:'Accounts Payable',          type:'liability', group:'Current Liabilities',  colour:'#A32D2D' },
  { label:'GST Payable',               type:'liability', group:'Current Liabilities',  colour:'#E24B4A' },
  { label:'PAYG Withholding',          type:'liability', group:'Current Liabilities',  colour:'#993C1D' },
  { label:'Superannuation Payable',    type:'liability', group:'Current Liabilities',  colour:'#D85A30' },
  { label:'Income Tax Payable',        type:'liability', group:'Current Liabilities',  colour:'#BA7517' },
  { label:'Credit Card',               type:'liability', group:'Current Liabilities',  colour:'#854F0B' },
  { label:'Business Loan',             type:'liability', group:'Long-term Liabilities',colour:'#633806' },
  { label:'Share Capital',             type:'equity',    group:'Equity',               colour:'#534AB7' },
  { label:'Retained Earnings',         type:'equity',    group:'Equity',               colour:'#7F77DD' },
  { label:'Drawings',                  type:'equity',    group:'Equity',               colour:'#5F5E5A' },
  { label:'Sales Revenue',             type:'income',    group:'Revenue',              colour:'#3B6D11' },
  { label:'Service Revenue',           type:'income',    group:'Revenue',              colour:'#1D9E75' },
  { label:'Interest Income',           type:'income',    group:'Revenue',              colour:'#639922' },
  { label:'Other Income',              type:'income',    group:'Revenue',              colour:'#888780' },
  { label:'Cost of Goods Sold',        type:'expense',   group:'Cost of Sales',        colour:'#A32D2D' },
  { label:'Wages & Salaries',          type:'expense',   group:'Employee Costs',       colour:'#185FA5' },
  { label:'Superannuation Expense',    type:'expense',   group:'Employee Costs',       colour:'#0C447C' },
  { label:'Rent Expense',              type:'expense',   group:'Occupancy',            colour:'#993C1D' },
  { label:'Utilities',                 type:'expense',   group:'Occupancy',            colour:'#854F0B' },
  { label:'Motor Vehicle Expenses',    type:'expense',   group:'Vehicle',              colour:'#185FA5' },
  { label:'Telephone & Internet',      type:'expense',   group:'Communications',       colour:'#3B6D11' },
  { label:'Insurance',                 type:'expense',   group:'Insurance',            colour:'#534AB7' },
  { label:'Depreciation',              type:'expense',   group:'Depreciation',         colour:'#888780' },
  { label:'Bank Charges',              type:'expense',   group:'Financial',            colour:'#5F5E5A' },
  { label:'Accounting & Legal',        type:'expense',   group:'Professional',         colour:'#444441' },
  { label:'Advertising & Marketing',   type:'expense',   group:'Marketing',            colour:'#D4537E' },
  { label:'Subscriptions & Software',  type:'expense',   group:'Software',             colour:'#7F77DD' },
  { label:'Office Supplies',           type:'expense',   group:'Office',               colour:'#BA7517' },
  { label:'Miscellaneous',             type:'expense',   group:'Miscellaneous',        colour:'#888780' },
];

const COA_TRUST = [
  { label:'Trust Bank Account',        type:'asset',     group:'Current Assets',    colour:'#185FA5' },
  { label:'Distribution Account',      type:'asset',     group:'Current Assets',    colour:'#0C447C' },
  { label:'Accounts Receivable',       type:'asset',     group:'Current Assets',    colour:'#1D9E75' },
  { label:'Trust Investments',         type:'asset',     group:'Investments',       colour:'#3B6D11' },
  { label:'Property – Trust Assets',   type:'asset',     group:'Fixed Assets',      colour:'#185FA5' },
  { label:'Accounts Payable',          type:'liability', group:'Current Liabilities',colour:'#A32D2D' },
  { label:'GST Payable',               type:'liability', group:'Current Liabilities',colour:'#E24B4A' },
  { label:'Distributions Payable',     type:'liability', group:'Current Liabilities',colour:'#993C1D' },
  { label:'Unpaid Present Entitlements',type:'liability',group:'Current Liabilities',colour:'#D85A30' },
  { label:'Beneficiary Loan Account',  type:'liability', group:'Long-term Liabilities',colour:'#BA7517' },
  { label:'Trust Corpus',              type:'equity',    group:'Trust Equity',      colour:'#534AB7' },
  { label:'Retained Trust Income',     type:'equity',    group:'Trust Equity',      colour:'#7F77DD' },
  { label:'Settlor Contribution',      type:'equity',    group:'Trust Equity',      colour:'#444441' },
  { label:'Trust Income – Dividends',  type:'income',    group:'Investment Income', colour:'#3B6D11' },
  { label:'Trust Income – Rent',       type:'income',    group:'Investment Income', colour:'#1D9E75' },
  { label:'Trust Income – Interest',   type:'income',    group:'Investment Income', colour:'#639922' },
  { label:'Capital Gains',             type:'income',    group:'Capital',           colour:'#085041' },
  { label:'Other Trust Income',        type:'income',    group:'Revenue',           colour:'#888780' },
  { label:'Trustee Fees',              type:'expense',   group:'Trust Costs',       colour:'#A32D2D' },
  { label:'Accounting & Audit',        type:'expense',   group:'Professional',      colour:'#444441' },
  { label:'Legal Fees',                type:'expense',   group:'Professional',      colour:'#5F5E5A' },
  { label:'Property Expenses',         type:'expense',   group:'Property',          colour:'#993C1D' },
  { label:'Investment Expenses',       type:'expense',   group:'Investments',       colour:'#185FA5' },
  { label:'Bank Charges',              type:'expense',   group:'Financial',         colour:'#888780' },
  { label:'Miscellaneous',             type:'expense',   group:'Miscellaneous',     colour:'#888780' },
];

const COA_MAP = { personal: COA_PERSONAL, company: COA_COMPANY, trust: COA_TRUST };

const TYPE_ORDER  = ['asset','liability','equity','income','expense'];
const TYPE_LABELS = { asset:'Assets', liability:'Liabilities', equity:'Equity', income:'Revenue', expense:'Expenses' };
const TYPE_COLOURS = { asset:'#185FA5', liability:'#A32D2D', equity:'#534AB7', income:'#3B6D11', expense:'#BA7517' };

// ── Drill panel ───────────────────────────────────────────────────────────────
function DrillPanel({ cat, txns, setTxns, catMap, cats, dateFrom, dateTo, onClose, toast }) {
  const catTxns = filterByDateRange(txns, dateFrom, dateTo)
    .filter(t => t.cat === cat.id)
    .sort((a,b) => b.date.localeCompare(a.date));
  const total = catTxns.reduce((s,t) => s + t.amt, 0);

  const [editId,    setEditId]    = useState(null);
  const [editDesc,  setEditDesc]  = useState('');
  const [editNote,  setEditNote]  = useState('');

  async function saveEdit(txn) {
    await updateTransaction(txn.id, { description: editDesc, note: editNote || null });
    // Update local state so the panel refreshes without reload
    if (setTxns) {
      setTxns(prev => prev.map(t => t.id === txn.id
        ? { ...t, desc: editDesc, description: editDesc, note: editNote || null }
        : t
      ));
    }
    toast('Transaction updated.');
    setEditId(null);
  }

  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:520, background:'#FDFAF6', boxShadow:'-4px 0 24px rgba(42,36,32,0.15)', zIndex:800, display:'flex', flexDirection:'column', borderLeft:'0.5px solid var(--bd2)' }}>
      {/* Header */}
      <div style={{ padding:'14px 18px', borderBottom:'0.5px solid var(--bd)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ width:10, height:10, borderRadius:'50%', background:cat.col, flexShrink:0, display:'inline-block' }} />
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:500, fontSize:14 }}>{cat.l}</div>
          <div style={{ fontSize:11, color:'var(--stone)', marginTop:1 }}>{cat.ac} · {cat.t}</div>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--stone)', lineHeight:1, padding:0 }}>×</button>
      </div>

      {/* Stats */}
      <div style={{ padding:'10px 18px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)', display:'flex', gap:24, flexShrink:0 }}>
        {[
          { label:'Transactions', val: catTxns.length },
          { label:'Total',        val: (total>=0?'+':'')+fmt(total), cls: total>=0?'vp':'vn' },
          { label:'Average',      val: catTxns.length>0 ? fmt(Math.abs(total/catTxns.length)) : '—' },
        ].map(m => (
          <div key={m.label}>
            <div style={{ fontSize:10, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:500 }}>{m.label}</div>
            <div style={{ fontSize:15, fontWeight:500 }} className={m.cls||''}>{m.val}</div>
          </div>
        ))}
      </div>

      {/* Transaction list */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {catTxns.length === 0 ? (
          <div style={{ padding:24, textAlign:'center', color:'var(--stone)', fontSize:12 }}>No transactions in current date range.</div>
        ) : catTxns.map(t => (
          <div key={t.id} style={{ borderBottom:'0.5px solid var(--bd)', padding:'10px 18px' }}>
            {editId === t.id ? (
              // ── Inline edit ──────────────────────────────────────────────
              <div>
                <input value={editDesc} onChange={e=>setEditDesc(e.target.value)}
                  style={{ width:'100%', padding:'5px 8px', fontSize:12.5, border:'0.5px solid var(--a)', borderRadius:'var(--rr)', marginBottom:6, fontFamily:'var(--font-sans)' }} />
                <input value={editNote} onChange={e=>setEditNote(e.target.value)} placeholder="Note (optional)"
                  style={{ width:'100%', padding:'4px 8px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', marginBottom:8, fontFamily:'var(--font-sans)' }} />
                <div style={{ display:'flex', gap:6 }}>
                  <button className="btn btn-a btn-sm" onClick={()=>saveEdit(t)}>Save</button>
                  <button className="btn btn-sm" onClick={()=>setEditId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              // ── Read view ─────────────────────────────────────────────────
              <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
                    <span style={{ fontSize:12.5, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{t.desc}</span>
                    <span style={{ fontSize:13, fontWeight:500, flexShrink:0 }} className={t.amt>=0?'vp':'vn'}>{t.amt>=0?'+':''}{fmt(t.amt)}</span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--stone)', marginTop:2 }}>
                    {t.date}{t.payee && ` · ${t.payee}`}{t.note && ` · 📝 ${t.note}`}
                  </div>
                </div>
                <button className="btn-ghost" style={{ fontSize:11, color:'var(--stone)', padding:'2px 6px', flexShrink:0 }}
                  onClick={()=>{ setEditId(t.id); setEditDesc(t.desc); setEditNote(t.note||''); }}>
                  Edit
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ChartOfAccounts() {
  const { cats, setCats, txns, setTxns, org, toast, dateFrom, dateTo, PALETTE } = useApp();

  const [editingId,   setEditingId]   = useState(null);
  const [form,        setForm]        = useState({});
  const [saving,      setSaving]      = useState(false);
  const [search,      setSearch]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState('');
  const [showSeedDD,  setShowSeedDD]  = useState(false);
  const [drillCat,    setDrillCat]    = useState(null);
  const [deleteTarget,setDeleteTarget]= useState(null);
  const [deleteConfirm,setDeleteConfirm]=useState('');
  const [deleting,    setDeleting]    = useState(false);
  const seedDDRef  = useRef(null);
  const dragCatRef = useRef(null);   // id of category being dragged

  // Drag-and-drop reorder within a type group
  function onCatDragStart(e, cat) {
    dragCatRef.current = cat.id;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.4';
  }
  function onCatDragEnd(e) {
    e.currentTarget.style.opacity = '';
  }
  async function onCatDrop(e, targetCat) {
    e.preventDefault();
    const fromId = dragCatRef.current;
    dragCatRef.current = null;
    if (!fromId || fromId === targetCat.id) return;

    // Reorder within same type only
    setCats(prev => {
      const sameType = prev.filter(c => c.t === targetCat.t).sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
      const fromIdx  = sameType.findIndex(c => c.id === fromId);
      const toIdx    = sameType.findIndex(c => c.id === targetCat.id);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const reordered = [...sameType];
      const [moved]   = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      // Assign new sort_orders
      const updated = reordered.map((c,i) => ({ ...c, sort_order: i }));
      // Persist in background
      updated.forEach(cat => updateCategory(cat.id, { sort_order: cat.sort_order }).catch(()=>{}));
      // Replace those items in full list
      const updatedIds = new Set(updated.map(c => c.id));
      return prev.map(c => updatedIds.has(c.id) ? updated.find(u => u.id === c.id) : c);
    });
  }

  // Close seed DD on outside click
  React.useEffect(() => {
    function down(e) { if (seedDDRef.current && !seedDDRef.current.contains(e.target)) setShowSeedDD(false); }
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);

  // Category balances
  const catBalances = useMemo(() => {
    const ft  = filterByDateRange(txns, dateFrom, dateTo);
    const map = {};
    ft.forEach(t => { if (!t.cat) return; map[t.cat] = (map[t.cat]||0) + (t.amt??0); });
    return map;
  }, [txns, dateFrom, dateTo]);

  // Filtered + grouped
  const grouped = useMemo(() => {
    let list = cats;
    if (search)     list = list.filter(c => c.l.toLowerCase().includes(search.toLowerCase()) || c.ac.toLowerCase().includes(search.toLowerCase()));
    if (typeFilter) list = list.filter(c => c.t === typeFilter);
    const byType = {};
    TYPE_ORDER.forEach(t => { byType[t] = {}; });
    list.forEach(c => {
      if (!byType[c.t]) byType[c.t] = {};
      if (!byType[c.t][c.ac]) byType[c.t][c.ac] = [];
      byType[c.t][c.ac].push(c);
    });
    return byType;
  }, [cats, search, typeFilter]);

  // Seed COA
  async function seedCOA(type) {
    setShowSeedDD(false);
    const template = COA_MAP[type]; if (!template) return;
    const existing = new Set(cats.map(c => c.l.toLowerCase()));
    const toAdd    = template.filter(a => !existing.has(a.label.toLowerCase()));
    if (toAdd.length === 0) { toast('All standard accounts already exist.'); return; }
    let added = 0;
    for (const a of toAdd) {
      try {
        const created = await createCategory(org.id, { label:a.label, type:a.type, account_group:a.group, colour:a.colour, sort_order:cats.length+added });
        setCats(prev => [...prev, normalise(created)]);
        added++;
      } catch(e) { console.error(e); }
    }
    toast(`${added} accounts seeded.`);
  }

  function normalise(c) { return { ...c, l:c.label, t:c.type, col:c.colour, ac:c.account_group }; }

  async function save() {
    if (!form.label?.trim()) { toast('Name is required.'); return; }
    if (!form.type)          { toast('Type is required.'); return; }
    setSaving(true);
    try {
      const payload = { label:form.label.trim(), type:form.type, account_group:form.account_group?.trim()||TYPE_LABELS[form.type], colour:form.colour||PALETTE[cats.length%PALETTE.length], sort_order:form.sort_order??cats.length };
      if (editingId==='new') {
        const c = await createCategory(org.id, payload);
        setCats(prev => [...prev, normalise(c)]);
        toast('Account created.');
      } else {
        const c = await updateCategory(editingId, payload);
        setCats(prev => prev.map(x => x.id===editingId ? normalise(c) : x));
        toast('Account updated.');
      }
      setEditingId(null);
    } catch(e) { toast('Error: '+e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.inUse && deleteConfirm !== deleteTarget.l) return;
    setDeleting(true);
    try {
      await deleteCategory(deleteTarget.id);
      setCats(prev => prev.filter(c => c.id !== deleteTarget.id));
      toast('Account deleted.');
    } catch(e) { toast('Error: '+e.message); }
    finally { setDeleting(false); setDeleteTarget(null); setDeleteConfirm(''); }
  }

  function requestDelete(cat) {
    const inUse = txns.some(t => t.cat === cat.id);
    setDeleteTarget({ ...cat, inUse, txnCount: txns.filter(t => t.cat === cat.id).length });
    setDeleteConfirm('');
  }

  function openNew()    { setForm({ label:'', type:'expense', account_group:'', colour:PALETTE[cats.length%PALETTE.length] }); setEditingId('new'); }
  function openEdit(cat){ setForm({ label:cat.l, type:cat.t, account_group:cat.ac, colour:cat.col, sort_order:cat.sort_order }); setEditingId(cat.id); }
  function f(k,v)       { setForm(p => ({...p,[k]:v})); }

  return (
    <div>
      {/* ── Sticky toolbar ── */}
      <div style={{ position:'sticky', top:-1, zIndex:100, background:'var(--sand)', borderBottom:'0.5px solid var(--bd)', padding:'10px 0', marginTop:-1, marginBottom:16, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', boxShadow:'0 2px 8px rgba(42,36,32,0.08)' }}>
        <input
          placeholder="Search accounts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding:'6px 10px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', color:'var(--ink)', fontFamily:'var(--font-sans)', width:200 }}
        />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding:'6px 10px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', color:'var(--ink)', fontFamily:'var(--font-sans)' }}>
          <option value="">All types</option>
          {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          {/* Seed dropdown */}
          <div style={{ position:'relative' }} ref={seedDDRef}>
            <button className="btn btn-sm" onClick={() => setShowSeedDD(v=>!v)}>✦ Seed COA ▾</button>
            {showSeedDD && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, background:'#FDFAF6', border:'0.5px solid var(--bd2)', borderRadius:'var(--rl)', minWidth:180, zIndex:200, boxShadow:'0 6px 20px rgba(42,36,32,0.14)', overflow:'hidden' }}>
                {[
                  { key:'personal', label:'👤 Personal COA',  sub:'30+ personal accounts' },
                  { key:'company',  label:'🏢 Company COA',   sub:'35+ business accounts' },
                  { key:'trust',    label:'⚖️ Trust COA',     sub:'25 trust accounts' },
                ].map(opt => (
                  <div key={opt.key} onClick={() => seedCOA(opt.key)}
                    style={{ padding:'9px 14px', cursor:'pointer', borderBottom:'0.5px solid var(--bd)' }}
                    onMouseEnter={e => e.currentTarget.style.background='var(--sand)'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <div style={{ fontSize:12.5, fontWeight:500 }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:'var(--stone)', marginTop:1 }}>{opt.sub}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-a" onClick={openNew}>+ New account</button>
        </div>
      </div>

      {/* ── Account groups ── */}
      {TYPE_ORDER.filter(type => !typeFilter || typeFilter===type).map(type => {
        const allInType = cats.filter(c => c.t===type && (!search || c.l.toLowerCase().includes(search.toLowerCase()) || c.ac.toLowerCase().includes(search.toLowerCase())));
        if (allInType.length === 0) return null;
        const typeTotal = allInType.reduce((s,c) => s+(catBalances[c.id]||0), 0);

        return (
          <div key={type} style={{ marginBottom:16 }}>
            {/* Section header */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, padding:'6px 12px', background:TYPE_COLOURS[type]+'18', borderLeft:`3px solid ${TYPE_COLOURS[type]}`, borderRadius:'0 var(--rr) var(--rr) 0' }}>
              <span style={{ fontSize:11, fontWeight:600, color:TYPE_COLOURS[type], textTransform:'uppercase', letterSpacing:'0.07em', flex:1 }}>{TYPE_LABELS[type]}</span>
              <span style={{ fontSize:11, fontVariantNumeric:'tabular-nums', color:TYPE_COLOURS[type] }}>{fmt(typeTotal)}</span>
            </div>

            <div className="card" style={{ overflow:'hidden' }}>
              <table style={{ tableLayout:'fixed', width:'100%' }}>
                <colgroup>
                  <col />                            {/* Account name */}
                  <col style={{ width:150 }} />      {/* Group */}
                  <col style={{ width:100 }} />      {/* Txn count */}
                  <col style={{ width:110 }} />      {/* Balance */}
                  <col style={{ width:80 }} />       {/* Actions */}
                </colgroup>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Group</th>
                    <th className="tr">Txns</th>
                    <th className="tr">Balance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {allInType.sort((a,b) => (a.sort_order||0)-(b.sort_order||0)).map(cat => {
                    const bal    = catBalances[cat.id] || 0;
                    const txnCnt = txns.filter(t => t.cat === cat.id).length;
                    return (
                      <tr key={cat.id}
                        draggable
                        onDragStart={e => onCatDragStart(e, cat)}
                        onDragEnd={onCatDragEnd}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => onCatDrop(e, cat)}
                        style={{ opacity: txnCnt===0 ? 0.55 : 1, cursor:'grab' }}>
                        {/* Account name — clickable if has transactions */}
                        <td style={{ cursor: txnCnt>0 ? 'pointer' : 'default' }}
                          onClick={() => txnCnt>0 && setDrillCat(cat)}>
                          <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ width:9, height:9, borderRadius:'50%', background:cat.col, flexShrink:0, display:'inline-block' }} />
                            <span style={{ fontWeight: txnCnt>0 ? 500 : 400 }}>{cat.l}</span>
                            {txnCnt>0 && <span style={{ fontSize:10, color:'var(--a)', marginLeft:2 }}>View →</span>}
                          </span>
                        </td>
                        <td style={{ color:'var(--stone)', fontSize:11.5 }}>{cat.ac}</td>
                        <td className="tr" style={{ color:'var(--stone)', fontSize:12 }}>
                          {txnCnt>0 ? txnCnt : <span style={{ color:'var(--sand4)' }}>—</span>}
                        </td>
                        <td className={`tr ${bal>0?'vp':bal<0?'vn':''}`} style={{ fontSize:12, fontVariantNumeric:'tabular-nums' }}>
                          {txnCnt>0 ? fmt(bal) : <span style={{ color:'var(--sand4)' }}>$0.00</span>}
                        </td>
                        <td>
                          <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                            <button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px' }} onClick={() => openEdit(cat)}>Edit</button>
                            <button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px', color:'var(--stone)' }} onClick={() => requestDelete(cat)}>×</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {cats.length === 0 && (
        <div className="card" style={{ textAlign:'center', padding:40 }}>
          <p style={{ fontWeight:500, marginBottom:8 }}>No accounts yet</p>
          <button className="btn btn-a" onClick={() => seedCOA('personal')}>Seed personal chart of accounts</button>
        </div>
      )}

      {/* ── Drill panel ── */}
      {drillCat && (
        <DrillPanel
          cat={drillCat}
          txns={txns}
          setTxns={setTxns}
          catMap={{}}
          cats={cats}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onClose={() => setDrillCat(null)}
          toast={toast}
        />
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div className="modal-bg" onClick={() => setDeleteTarget(null)}>
          <div className="modal" style={{ width:420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head" style={{ background:'var(--rdb)', borderBottom:'0.5px solid #f09595' }}>
              <h3 style={{ color:'var(--rd)' }}>⚠ Delete account</h3>
              <button className="btn-ghost" style={{ padding:0, fontSize:16 }} onClick={() => setDeleteTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize:13, marginBottom:12 }}>Delete <strong>"{deleteTarget.l}"</strong>?</p>
              {deleteTarget.inUse ? (
                <>
                  <div style={{ padding:'10px 12px', background:'var(--rdb)', borderRadius:'var(--rr)', fontSize:12, color:'var(--rd)', marginBottom:14 }}>
                    <strong>{deleteTarget.txnCount} transaction{deleteTarget.txnCount!==1?'s':''}</strong> linked — they will become unallocated.
                  </div>
                  <div className="field">
                    <label style={{ color:'var(--rd)' }}>Type account name to confirm: <strong>"{deleteTarget.l}"</strong></label>
                    <input autoFocus type="text" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder={deleteTarget.l}
                      style={{ borderColor: deleteConfirm && deleteConfirm!==deleteTarget.l ? 'var(--rd)' : '' }} />
                  </div>
                </>
              ) : (
                <p style={{ fontSize:12, color:'var(--stone)', marginBottom:12 }}>No transactions linked — safe to delete.</p>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn" style={{ background:'var(--rd)', color:'#fff', borderColor:'var(--rd)' }}
                disabled={(deleteTarget.inUse && deleteConfirm!==deleteTarget.l) || deleting}
                onClick={handleDelete}>
                {deleting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit / New modal ── */}
      {editingId !== null && (
        <div className="modal-bg" onClick={() => setEditingId(null)}>
          <div className="modal" style={{ width:420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editingId==='new' ? 'New account' : 'Edit account'}</h3>
              <button className="btn-ghost" style={{ padding:0, fontSize:16 }} onClick={() => setEditingId(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Account name</label>
                <input type="text" value={form.label||''} onChange={e => f('label',e.target.value)} placeholder="e.g. Motor Vehicle Expenses" />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="field">
                  <label>Type</label>
                  <select value={form.type||'expense'} onChange={e => f('type',e.target.value)}>
                    {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Group</label>
                  <input type="text" value={form.account_group||''} onChange={e => f('account_group',e.target.value)} placeholder={TYPE_LABELS[form.type||'expense']} />
                </div>
              </div>
              <div className="field">
                <label>Colour</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, paddingTop:4 }}>
                  {PALETTE.map(col => (
                    <span key={col} onClick={() => f('colour',col)} style={{ width:22, height:22, borderRadius:'50%', background:col, cursor:'pointer', border:form.colour===col?'2.5px solid var(--ink)':'2px solid transparent' }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setEditingId(null)}>Cancel</button>
              <button className="btn btn-a" onClick={save} disabled={saving}>{saving?'Saving…':'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
