/**
 * views/Accounting/ChartOfAccounts.jsx
 * Original styling restored + new features:
 *   - Master COA browser
 *   - Seed accounts modal (replace / add-additional, 3 templates)
 *   - Show zero-balance toggle
 *   - Account codes
 */

import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { createCategory, updateCategory, deleteCategory, deactivateCategory, reactivateCategory, updateTransaction,
         importFromMasterCOA, seedCategoriesForOrg, createCategoryWithCode, createReversalForCategory,
         postCategoryJournal } from '../../lib/supabase';
import { filterByDateRange, fmt } from '../../utils/helpers';

// ── COA templates — codes linked to master_coa ─────────────────────────────────
// code field maps to master_coa.code for reference. group maps to account_group.
const COA_PERSONAL = [
  { code:'110', label:'Cheque / Transaction Account', type:'asset',     group:'Current Assets',           colour:'#185FA5' },
  { code:'120', label:'Savings Account',               type:'asset',     group:'Current Assets',           colour:'#3B6D11' },
  { code:'200', label:'Investments',                   type:'asset',     group:'Investments',              colour:'#1D9E75' },
  { code:'201', label:'Shares & ETFs',                 type:'asset',     group:'Investments',              colour:'#0C447C' },
  { code:'220', label:'Superannuation',                type:'asset',     group:'Investments',              colour:'#085041' },
  { code:'310', label:'Motor Vehicle',                 type:'asset',     group:'Fixed Assets',             colour:'#185FA5' },
  { code:'400', label:'Credit Card',                   type:'liability', group:'Current Liabilities',      colour:'#A32D2D' },
  { code:'510', label:'Home Loan / Mortgage',          type:'liability', group:'Non-Current Liabilities',  colour:'#993C1D' },
  { code:'540', label:'HELP / HECS Debt',              type:'liability', group:'Non-Current Liabilities',  colour:'#7F77DD' },
  { code:'600', label:"Owner's Equity",                type:'equity',    group:'Equity',                   colour:'#534AB7' },
  { code:'620', label:'Drawings',                      type:'equity',    group:'Equity',                   colour:'#5F5E5A' },
  { code:'710', label:'Salary & Wages',                type:'income',    group:'Revenue',                  colour:'#3B6D11' },
  { code:'740', label:'Rental Income',                 type:'income',    group:'Revenue',                  colour:'#639922' },
  { code:'750', label:'Interest Received',             type:'income',    group:'Revenue',                  colour:'#1D9E75' },
  { code:'760', label:'Dividend Income',               type:'income',    group:'Revenue',                  colour:'#085041' },
  { code:'790', label:'Other Income',                  type:'income',    group:'Revenue',                  colour:'#888780' },
  { code:'801', label:'Rent / Mortgage',               type:'expense',   group:'Housing',                  colour:'#993C1D' },
  { code:'811', label:'Electricity',                   type:'expense',   group:'Utilities',                colour:'#854F0B' },
  { code:'814', label:'Internet',                      type:'expense',   group:'Utilities',                colour:'#185FA5' },
  { code:'815', label:'Mobile Phone',                  type:'expense',   group:'Utilities',                colour:'#0C447C' },
  { code:'820', label:'Groceries',                     type:'expense',   group:'Living Expenses',          colour:'#BA7517' },
  { code:'821', label:'Dining & Takeaway',             type:'expense',   group:'Living Expenses',          colour:'#D85A30' },
  { code:'831', label:'Fuel & Oil',                    type:'expense',   group:'Vehicle',                  colour:'#3B6D11' },
  { code:'832', label:'Registration & Insurance',      type:'expense',   group:'Vehicle',                  colour:'#0F6E56' },
  { code:'836', label:'Ride Share',                    type:'expense',   group:'Transport',                colour:'#0C447C' },
  { code:'843', label:'Gym & Fitness',                 type:'expense',   group:'Health',                   colour:'#1D9E75' },
  { code:'851', label:'Subscriptions',                 type:'expense',   group:'Entertainment',            colour:'#7F77DD' },
  { code:'855', label:'Travel & Holidays',             type:'expense',   group:'Entertainment',            colour:'#D4537E' },
  { code:'881', label:'Bank Fees & Charges',           type:'expense',   group:'Financial',                colour:'#5F5E5A' },
  { code:'885', label:'Health Insurance',              type:'expense',   group:'Insurance',                colour:'#534AB7' },
  { code:'891', label:'Income Tax',                    type:'expense',   group:'Tax',                      colour:'#A32D2D' },
  { code:'893', label:'Super Contributions',           type:'expense',   group:'Superannuation',           colour:'#3B6D11' },
  { code:'900', label:'Other Expenses',                type:'expense',   group:'Miscellaneous',            colour:'#888780' },
];

const COA_COMPANY = [
  { code:'110', label:'Bank – Operating',              type:'asset',     group:'Current Assets',           colour:'#185FA5' },
  { code:'120', label:'Bank – Savings',                type:'asset',     group:'Current Assets',           colour:'#0C447C' },
  { code:'101', label:'Petty Cash',                    type:'asset',     group:'Current Assets',           colour:'#3B6D11' },
  { code:'140', label:'Accounts Receivable',           type:'asset',     group:'Current Assets',           colour:'#1D9E75' },
  { code:'151', label:'GST Receivable',                type:'asset',     group:'Current Assets',           colour:'#639922' },
  { code:'310', label:'Motor Vehicle',                 type:'asset',     group:'Fixed Assets',             colour:'#185FA5' },
  { code:'320', label:'Office Equipment',              type:'asset',     group:'Fixed Assets',             colour:'#0C447C' },
  { code:'330', label:'Computer Equipment',            type:'asset',     group:'Fixed Assets',             colour:'#3B6D11' },
  { code:'390', label:'Accumulated Depreciation',      type:'asset',     group:'Fixed Assets',             colour:'#888780' },
  { code:'410', label:'Accounts Payable',              type:'liability', group:'Current Liabilities',      colour:'#A32D2D' },
  { code:'420', label:'GST Payable',                   type:'liability', group:'Current Liabilities',      colour:'#E24B4A' },
  { code:'421', label:'PAYG Withholding Payable',      type:'liability', group:'Current Liabilities',      colour:'#993C1D' },
  { code:'431', label:'Superannuation Payable',        type:'liability', group:'Current Liabilities',      colour:'#D85A30' },
  { code:'422', label:'Income Tax Payable',            type:'liability', group:'Current Liabilities',      colour:'#BA7517' },
  { code:'400', label:'Credit Card',                   type:'liability', group:'Current Liabilities',      colour:'#854F0B' },
  { code:'550', label:'Business Loan',                 type:'liability', group:'Non-Current Liabilities',  colour:'#633806' },
  { code:'630', label:'Share Capital',                 type:'equity',    group:'Equity',                   colour:'#534AB7' },
  { code:'610', label:'Retained Earnings',             type:'equity',    group:'Equity',                   colour:'#7F77DD' },
  { code:'620', label:'Drawings',                      type:'equity',    group:'Equity',                   colour:'#5F5E5A' },
  { code:'730', label:'Business Income',               type:'income',    group:'Revenue',                  colour:'#3B6D11' },
  { code:'720', label:'Freelance / Contract',          type:'income',    group:'Revenue',                  colour:'#1D9E75' },
  { code:'750', label:'Interest Received',             type:'income',    group:'Revenue',                  colour:'#639922' },
  { code:'790', label:'Other Income',                  type:'income',    group:'Revenue',                  colour:'#888780' },
  { code:'820', label:'Cost of Goods Sold',            type:'expense',   group:'Direct Costs',             colour:'#A32D2D' },
  { code:'710', label:'Wages & Salaries',              type:'expense',   group:'Employee Costs',           colour:'#185FA5' },
  { code:'893', label:'Superannuation Expense',        type:'expense',   group:'Employee Costs',           colour:'#0C447C' },
  { code:'801', label:'Rent Expense',                  type:'expense',   group:'Occupancy',                colour:'#993C1D' },
  { code:'810', label:'Utilities',                     type:'expense',   group:'Occupancy',                colour:'#854F0B' },
  { code:'831', label:'Motor Vehicle Expenses',        type:'expense',   group:'Vehicle',                  colour:'#185FA5' },
  { code:'815', label:'Telephone & Internet',          type:'expense',   group:'Communications',           colour:'#3B6D11' },
  { code:'885', label:'Insurance',                     type:'expense',   group:'Insurance',                colour:'#534AB7' },
  { code:'881', label:'Bank Charges',                  type:'expense',   group:'Financial',                colour:'#5F5E5A' },
  { code:'870', label:'Accounting & Legal',            type:'expense',   group:'Professional',             colour:'#444441' },
  { code:'851', label:'Subscriptions & Software',      type:'expense',   group:'Software',                 colour:'#7F77DD' },
  { code:'900', label:'Miscellaneous',                 type:'expense',   group:'Miscellaneous',            colour:'#888780' },
];

const COA_TRUST = [
  { code:'110', label:'Trust Bank Account',            type:'asset',     group:'Current Assets',           colour:'#185FA5' },
  { code:'120', label:'Distribution Account',          type:'asset',     group:'Current Assets',           colour:'#0C447C' },
  { code:'140', label:'Accounts Receivable',           type:'asset',     group:'Current Assets',           colour:'#1D9E75' },
  { code:'200', label:'Trust Investments',             type:'asset',     group:'Investments',              colour:'#3B6D11' },
  { code:'210', label:'Investment Property',           type:'asset',     group:'Investments',              colour:'#185FA5' },
  { code:'410', label:'Accounts Payable',              type:'liability', group:'Current Liabilities',      colour:'#A32D2D' },
  { code:'420', label:'GST Payable',                   type:'liability', group:'Current Liabilities',      colour:'#E24B4A' },
  { code:'460', label:'Distributions Payable',         type:'liability', group:'Current Liabilities',      colour:'#993C1D' },
  { code:'450', label:'Unpaid Present Entitlements',   type:'liability', group:'Current Liabilities',      colour:'#D85A30' },
  { code:'530', label:'Beneficiary Loan Account',      type:'liability', group:'Non-Current Liabilities',  colour:'#BA7517' },
  { code:'640', label:'Trust Corpus',                  type:'equity',    group:'Trust Equity',             colour:'#534AB7' },
  { code:'641', label:'Retained Trust Income',         type:'equity',    group:'Trust Equity',             colour:'#7F77DD' },
  { code:'642', label:'Settlor Contribution',          type:'equity',    group:'Trust Equity',             colour:'#444441' },
  { code:'760', label:'Trust Income – Dividends',      type:'income',    group:'Investment Income',        colour:'#3B6D11' },
  { code:'740', label:'Trust Income – Rent',           type:'income',    group:'Investment Income',        colour:'#1D9E75' },
  { code:'750', label:'Trust Income – Interest',       type:'income',    group:'Investment Income',        colour:'#639922' },
  { code:'770', label:'Capital Gains',                 type:'income',    group:'Capital',                  colour:'#085041' },
  { code:'790', label:'Other Trust Income',            type:'income',    group:'Revenue',                  colour:'#888780' },
  { code:'870', label:'Trustee Fees',                  type:'expense',   group:'Trust Costs',              colour:'#A32D2D' },
  { code:'873', label:'Accounting & Audit',            type:'expense',   group:'Professional',             colour:'#444441' },
  { code:'872', label:'Legal Fees',                    type:'expense',   group:'Professional',             colour:'#5F5E5A' },
  { code:'801', label:'Property Expenses',             type:'expense',   group:'Property',                 colour:'#993C1D' },
  { code:'881', label:'Bank Charges',                  type:'expense',   group:'Financial',                colour:'#888780' },
  { code:'900', label:'Miscellaneous',                 type:'expense',   group:'Miscellaneous',            colour:'#888780' },
];


const TYPE_ORDER   = ['asset','liability','equity','income','expense'];
const TYPE_LABELS  = { asset:'Assets', liability:'Liabilities', equity:'Equity', income:'Revenue', expense:'Expenses' };
const TYPE_COLOURS = { asset:'#185FA5', liability:'#A32D2D', equity:'#534AB7', income:'#3B6D11', expense:'#BA7517' };

// ── Drill panel ───────────────────────────────────────────────────────────────
function DrillPanel({ cat, txns, setTxns, catMap, cats, dateFrom, dateTo, onClose, onEdit, toast }) {
  const catTxns = filterByDateRange(txns, dateFrom, dateTo)
    .filter(t => t.cat === cat.id)
    .sort((a,b) => b.date.localeCompare(a.date));
  const total = catTxns.reduce((s,t) => s + t.amt, 0);

  const [editId,   setEditId]   = useState(null);
  const [editDesc, setEditDesc] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editCat,  setEditCat]  = useState('');
  const [selected, setSelected] = useState(new Set());
  const [bulkCat,  setBulkCat]  = useState('');

  function toggleSelect(id) {
    setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll() { setSelected(new Set(catTxns.map(t=>t.id))); }
  function clearSel()  { setSelected(new Set()); }

  async function bulkRecategorise() {
    if (!bulkCat || selected.size === 0) return;
    const ids = [...selected];
    await Promise.all(ids.map(id => updateTransaction(id, { category_id: bulkCat })));
    if (setTxns) setTxns(prev => prev.map(t => selected.has(t.id) ? { ...t, cat:bulkCat, category_id:bulkCat } : t));
    toast(`${ids.length} transactions re-categorised.`);
    clearSel(); setBulkCat('');
  }

  async function saveEdit(txn) {
    const updates = { description: editDesc, note: editNote || null };
    if (editCat && editCat !== txn.cat) updates.category_id = editCat;
    await updateTransaction(txn.id, updates);
    if (setTxns) setTxns(prev => prev.map(t => t.id === txn.id
      ? { ...t, desc:editDesc, description:editDesc, note:editNote||null, cat:editCat||t.cat, category_id:editCat||t.cat }
      : t
    ));
    toast(editCat && editCat !== txn.cat ? 'Transaction re-categorised.' : 'Transaction updated.');
    setEditId(null);
  }

  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:520, background:'#FDFAF6', boxShadow:'-4px 0 24px rgba(42,36,32,0.15)', zIndex:800, display:'flex', flexDirection:'column', borderLeft:'0.5px solid var(--bd2)' }}>
      <div style={{ padding:'14px 18px', borderBottom:'0.5px solid var(--bd)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ width:10, height:10, borderRadius:'50%', background:cat.col, flexShrink:0, display:'inline-block' }} />
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:500, fontSize:14 }}>{cat.code ? `${cat.code} · ${cat.l}` : cat.l}</div>
          <div style={{ fontSize:11, color:'var(--stone)', marginTop:1 }}>{cat.ac} · {cat.t}</div>
        </div>
        <button className="btn btn-sm" onClick={onEdit} style={{ marginRight:4 }}>Edit account</button>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--stone)', lineHeight:1, padding:0 }}>×</button>
      </div>

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

      {catTxns.length > 0 && (
        <div style={{ padding:'7px 18px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)', display:'flex', alignItems:'center', gap:10, flexShrink:0, flexWrap:'wrap' }}>
          <input type="checkbox" checked={selected.size===catTxns.length && catTxns.length>0}
            onChange={e => e.target.checked ? selectAll() : clearSel()} style={{ cursor:'pointer' }} />
          <span style={{ fontSize:11.5, color:'var(--stone)' }}>
            {selected.size > 0 ? `${selected.size} of ${catTxns.length} selected` : `${catTxns.length} transactions`}
          </span>
          {selected.size > 0 && (
            <>
              <select value={bulkCat} onChange={e=>setBulkCat(e.target.value)}
                style={{ fontSize:12, padding:'4px 8px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)', flex:1, minWidth:140 }}>
                <option value="">Move to account…</option>
                {['asset','liability','equity','income','expense'].map(type => {
                  const grp = (cats||[]).filter(c2=>c2.id!==cat.id&&c2.t===type&&c2.is_active!==false)
                    .sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999)||(a.l||'').localeCompare(b.l||''));
                  if(!grp.length) return null;
                  return <optgroup key={type} label={{asset:'Assets',liability:'Liabilities',equity:'Equity',income:'Revenue',expense:'Expenses'}[type]}>
                    {grp.map(c2=><option key={c2.id} value={c2.id}>{c2.code?`${c2.code} · `:''}{c2.l}</option>)}
                  </optgroup>;
                })}
              </select>
              <button className="btn btn-a btn-sm" onClick={bulkRecategorise} disabled={!bulkCat}>Move {selected.size}</button>
              <button className="btn btn-sm" onClick={clearSel} style={{ color:'var(--stone)' }}>Clear</button>
            </>
          )}
        </div>
      )}

      <div style={{ flex:1, overflowY:'auto' }}>
        {catTxns.length === 0 ? (
          <div style={{ padding:24, textAlign:'center', color:'var(--stone)', fontSize:12 }}>No transactions in current date range.</div>
        ) : catTxns.map(t => (
          <div key={t.id} style={{ borderBottom:'0.5px solid var(--bd)', padding:'10px 18px' }}>
            {editId === t.id ? (
              <div>
                <input value={editDesc} onChange={e=>setEditDesc(e.target.value)}
                  style={{ width:'100%', padding:'5px 8px', fontSize:12.5, border:'0.5px solid var(--a)', borderRadius:'var(--rr)', marginBottom:6, fontFamily:'var(--font-sans)' }} />
                <input value={editNote} onChange={e=>setEditNote(e.target.value)} placeholder="Note (optional)"
                  style={{ width:'100%', padding:'4px 8px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', marginBottom:6, fontFamily:'var(--font-sans)' }} />
                <div style={{ marginBottom:8 }}>
                  <label style={{ fontSize:11, color:'var(--stone)', fontWeight:500, display:'block', marginBottom:3 }}>Re-categorise to</label>
                  <select value={editCat} onChange={e=>setEditCat(e.target.value)}
                    style={{ width:'100%', padding:'5px 8px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)', color:'var(--ink)' }}>
                    <option value="">— Keep current ({cat.l}) —</option>
                    {['asset','liability','equity','income','expense'].map(type => {
                      const group = (cats||[]).filter(c2=>c2.id!==cat.id && c2.t===type).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
                      if (!group.length) return null;
                      return <optgroup key={type} label={{asset:'Assets',liability:'Liabilities',equity:'Equity',income:'Revenue',expense:'Expenses'}[type]}>
                        {group.map(c2=><option key={c2.id} value={c2.id}>{c2.code ? `${c2.code} · ` : ''}{c2.l}</option>)}
                      </optgroup>;
                    })}
                  </select>
                  {editCat && editCat !== t.cat && <div style={{ fontSize:10.5, color:'var(--a2)', marginTop:3 }}>↪ This transaction will move to the selected account</div>}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button className="btn btn-a btn-sm" onClick={()=>saveEdit(t)}>Save</button>
                  <button className="btn btn-sm" onClick={()=>setEditId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                <input type="checkbox" checked={selected.has(t.id)} onChange={()=>toggleSelect(t.id)}
                  onClick={e=>e.stopPropagation()} style={{ cursor:'pointer', marginTop:3, flexShrink:0 }} />
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
                  onClick={()=>{ setEditId(t.id); setEditDesc(t.desc); setEditNote(t.note||''); setEditCat(''); }}>
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

// ── Main component ────────────────────────────────────────────────────────────
export function ChartOfAccounts() {
  const { cats, setCats, txns, setTxns, accounts, org, toast, dateFrom, dateTo, PALETTE, masterCOA } = useApp();

  const [editingId,    setEditingId]    = useState(null);
  const [form,         setForm]         = useState({});
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [showZero,     setShowZero]     = useState(true);
  const [drillCat,     setDrillCat]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirm,setDeleteConfirm]= useState('');
  const [deleting,     setDeleting]     = useState(false);
  const [showSeedModal,setShowSeedModal]= useState(false);
  const [seedMode,     setSeedMode]     = useState(null);
  const [seedTemplate, setSeedTemplate] = useState(null);
  const [showInactiveAccts,setShowInactiveAccts] = useState(false);
  const [showMasterCOA,setShowMasterCOA]= useState(false);
  const [collapsed, setCollapsed] = useState(new Set());
  function toggleCollapse(id) { setCollapsed(p => { const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n; }); }
  const [hardDeleteTarget, setHardDeleteTarget] = useState(null);
  const [masterSearch, setMasterSearch] = useState('');
  const [masterSel,    setMasterSel]    = useState(new Set());
  const [importing,    setImporting]    = useState(false);
  const [showNullMaster, setShowNullMaster] = useState(false);

  const dragCatRef = useRef(null);

  // ── Drag-drop reorder (original) ──────────────────────────────────────────
  function onCatDragStart(e, cat) {
    dragCatRef.current = cat.id;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.4';
  }
  function onCatDragEnd(e)  { e.currentTarget.style.opacity = ''; }
  async function onCatDrop(e, targetCat) {
    e.preventDefault();
    const fromId = dragCatRef.current;
    dragCatRef.current = null;
    if (!fromId || fromId === targetCat.id) return;
    setCats(prev => {
      const sameType  = prev.filter(c => c.t === targetCat.t).sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
      const fromIdx   = sameType.findIndex(c => c.id === fromId);
      const toIdx     = sameType.findIndex(c => c.id === targetCat.id);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const reordered = [...sameType];
      const [moved]   = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      const updated   = reordered.map((c,i) => ({ ...c, sort_order:i }));
      updated.forEach(cat => updateCategory(cat.id, { sort_order:cat.sort_order }).catch(()=>{}));
      const updatedIds = new Set(updated.map(c => c.id));
      return prev.map(c => updatedIds.has(c.id) ? updated.find(u => u.id === c.id) : c);
    });
  }

  // ── Balances ─────────────────────────────────────────────────────────────
  const catBalances = useMemo(() => {
    const ft  = filterByDateRange(txns, dateFrom, dateTo);
    const map = {};
    ft.forEach(t => { if (!t.cat) return; map[t.cat] = (map[t.cat]||0) + (t.amt??0); });
    return map;
  }, [txns, dateFrom, dateTo]);

  // Bank account balances: opening_balance + all transactions on that account
  const bankBalances = useMemo(() => {
    const map = {};
    (accounts||[]).forEach(a => {
      const txnTotal = (txns||[]).filter(t=>t.account_id===a.id).reduce((s,t)=>s+(t.amt??0),0);
      map[a.id] = (a.opening_balance||0) + txnTotal;
    });
    return map;
  }, [accounts, txns]);

  // ── Filtered + grouped ───────────────────────────────────────────────────
  const grouped = useMemo(() => {
    let list = cats;
    if (!showInactiveAccts) list = list.filter(c => c.is_active === true || c.is_active == null);
    if (!showZero) list = list.filter(c => catBalances[c.id]);
    if (search)    list = list.filter(c => (c.l||'').toLowerCase().includes(search.toLowerCase()) || (c.ac||'').toLowerCase().includes(search.toLowerCase()));
    if (typeFilter) list = list.filter(c => c.t === typeFilter);
    const byType = {};
    TYPE_ORDER.forEach(t => { byType[t] = {}; });
    list.forEach(c => {
      if (!byType[c.t]) byType[c.t] = {};
      if (!byType[c.t][c.ac]) byType[c.t][c.ac] = [];
      byType[c.t][c.ac].push(c);
    });
    return byType;
  }, [cats, search, typeFilter, showZero, showInactiveAccts, catBalances]);

  // ── Master COA filtered ──────────────────────────────────────────────────
  const masterFiltered = useMemo(() => {
    const q = masterSearch.toLowerCase();
    const existingCodes = new Set((cats||[]).map(c => c.code).filter(Boolean));
    const existingLabels = new Set((cats||[]).map(c => (c.l||'').toLowerCase()));
    return (masterCOA||[]).filter(m => {
      // By default hide placeholder slots (no label/type). showNullMaster reveals them.
      if (!showNullMaster && (!m.label || !m.type)) return false;
      if (!q) return true;
      // Null rows just match on code
      if (!m.label) return m.code.includes(q);
      return m.code.includes(q) || m.label.toLowerCase().includes(q) || (m.group_name||'').toLowerCase().includes(q);
    }).map(m => ({ ...m, alreadyAdded: existingCodes.has(m.code) || (m.label && existingLabels.has(m.label.toLowerCase())) }));
  }, [masterCOA, masterSearch, showNullMaster, cats]);

  // ── Actions ──────────────────────────────────────────────────────────────
  function normalise(c) { return { ...c, l:c.label, t:c.type, col:c.colour, ac:c.account_group, code:c.code||null, parent_id:c.parent_id||null, is_active: c.is_active === false ? false : true }; }

  async function handleSeed() {
    if (!seedMode || !seedTemplate) return;
    setSaving(true);
    const templateMap = { personal:COA_PERSONAL, company:COA_COMPANY, trust:COA_TRUST };
    const template    = templateMap[seedTemplate] || [];
    try {
      if (seedMode === 'replace') {
        // Deactivate existing rather than deleting to preserve transaction links
        await Promise.all((cats||[]).map(c => deactivateCategory(c.id).catch(()=>{})));
        setCats(prev => prev.map(c => ({ ...c, is_active:false })));
      }
      const existing = seedMode === 'add' ? new Set(cats.filter(c=>c.is_active!==false).map(c=>c.code).filter(Boolean)) : new Set();
      let added = 0;
      for (const a of template) {
        if (existing.has(a.code)) continue;
        const created = await createCategoryWithCode(org.id, { label:a.label, type:a.type, account_group:a.group, colour:a.colour, code:a.code, sort_order:parseInt(a.code)||added });
        setCats(prev => [...prev, normalise(created)]);
        added++;
      }
      setShowSeedModal(false); setSeedMode(null); setSeedTemplate(null);
      toast(`${added} accounts ${seedMode==='replace'?'seeded':'added'}.`);
    } catch(e) { toast('Error: '+e.message); }
    setSaving(false);
  }

  async function handleImportMaster() {
    const toImport = (masterCOA||[]).filter(m => masterSel.has(m.id));
    if (!toImport.length) return;
    setImporting(true);
    try {
      const created = await importFromMasterCOA(org.id, toImport);
      setCats(prev => [...prev, ...created.map(normalise)]);
      setMasterSel(new Set()); setShowMasterCOA(false);
      toast(`${created.length} accounts added.`);
    } catch(e) { toast('Error: '+e.message); }
    setImporting(false);
  }

  async function save() {
    if (!form.label?.trim()) { toast('Name is required.'); return; }
    if (!form.code?.trim())  { toast('Account code is required (e.g. 820).'); return; }

    // ── Duplicate code check — applies to both new and updates ────────────
    const codeConflict = (cats||[]).find(x =>
      x.code === form.code.trim() && x.l && x.id !== editingId
    );
    if (codeConflict) { toast(`Code ${form.code} is already used by "${codeConflict.l}". Choose a different code.`); return; }

    // ── Type change guard for existing accounts ────────────────────────────
    if (editingId !== 'new') {
      const existing = (cats||[]).find(c => c.id === editingId);
      if (existing && existing.t !== form.type) {
        const txnCount = (txns||[]).filter(t => t.cat === editingId).length;
        const childIds = (cats||[]).filter(ch => ch.parent_id === editingId).map(ch => ch.id);
        const totalAffected = txnCount + (txns||[]).filter(t => childIds.includes(t.cat)).length;
        const msg = 'Change type from "' + existing.t + '" to "' + form.type + '"? ' + (totalAffected > 0 ? totalAffected + ' transactions and this account' : 'This account') + ' will be reclassified in all reports.';
        if (!window.confirm(msg)) { toast('Type change cancelled.'); return; }
      }
    }

    setSaving(true);
    try {
      const payload = { label:form.label.trim(), type:form.type, account_group:form.account_group?.trim()||TYPE_LABELS[form.type], colour:form.colour||PALETTE[cats.length%PALETTE.length], sort_order:form.sort_order??cats.length, code:form.code||null, parent_id:form.parent_id||null };
      if (editingId === 'new') {
        const created = form.code ? await createCategoryWithCode(org.id, { ...payload, sort_order: parseInt(form.code)||cats.length }) : await createCategory(org.id, payload);
        setCats(prev => [...prev, normalise(created)]);
        // If sub-account: move parent's transactions to this new child
        if (form.parent_id) {
          const parentTxns = (txns||[]).filter(t => t.cat === form.parent_id);
          if (parentTxns.length > 0) {
            await Promise.all(parentTxns.map(t => updateTransaction(t.id, { category_id: created.id })));
            setTxns(prev => (prev||[]).map(t => t.cat===form.parent_id ? { ...t, cat:created.id, category_id:created.id } : t));
            // Re-post journals using the new sub-account category (not the parent)
            const normCreated = normalise(created);
            const accts = (typeof accounts !== 'undefined' ? accounts : []);
            await Promise.all(parentTxns.map(t => {
              const acct = t.account_id ? accts.find(a=>a.id===t.account_id) : null;
              return postCategoryJournal(org.id, t, normCreated, acct).catch(()=>{});
            }));
            toast(`Account created. ${parentTxns.length} transaction${parentTxns.length>1?'s':''} moved and journals updated.`);
          } else { toast('Account created.'); }
        } else { toast('Account created.'); }
      } else {
        const existing = (cats||[]).find(cx => cx.id === editingId);
        const oldCode = existing?.code;
        const oldParentId = existing?.parent_id||null;
        const updated = await updateCategory(editingId, payload);
        const normUpdated = normalise(updated);
        setCats(prev => prev.map(x => x.id===editingId ? normUpdated : x));
        const newParentId = form.parent_id||null;
        if (newParentId !== oldParentId) {
          toast(newParentId ? 'Account moved under new parent. Transactions stay assigned.' : 'Account promoted to top-level.');
          setEditingId(null); setSaving(false); return;
        }

        // ── Sync sub-account codes when parent code changes ────────────────
        // e.g. parent code changes 831→840: sub 831/001 → 840/001
        if (oldCode && form.code && oldCode !== form.code.trim()) {
          const children = (cats||[]).filter(ch => ch.parent_id === editingId);
          if (children.length > 0) {
            await Promise.all(children.map(async ch => {
              const suffix = (ch.code||'').split('/')[1] || '';
              const newChildCode = suffix ? `${form.code.trim()}/${suffix}` : ch.code;
              if (newChildCode !== ch.code) {
                const updCh = await updateCategory(ch.id, { code: newChildCode }).catch(() => null);
                if (updCh) setCats(prev => prev.map(x => x.id===ch.id ? { ...x, code:newChildCode } : x));
              }
            }));
            toast('Account updated. Sub-account codes synced.');
          } else { toast('Account updated.'); }
        } else { toast('Account updated.'); }
      }
      setEditingId(null);
    } catch(e) { toast('Error: '+e.message); }
    setSaving(false);
  }

  async function handleDeactivate() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const childIds = (cats||[]).filter(ch=>ch.parent_id===deleteTarget.id).map(ch=>ch.id);
      const toDeactivate = [deleteTarget.id, ...childIds];
      const linked = (txns||[]).filter(t => toDeactivate.includes(t.cat));
      if (linked.length > 0) {
        await Promise.all(linked.map(t => updateTransaction(t.id, { category_id: null })));
        setTxns(prev => (prev||[]).map(t => toDeactivate.includes(t.cat) ? { ...t, cat:null } : t));
      }
      await Promise.all(toDeactivate.map(id => deactivateCategory(id)));
      // Create reversal journals for each deactivated account
      await Promise.all(toDeactivate.map(id => createReversalForCategory(org.id, id).catch(e=>console.warn('Reversal failed:', e.message))));
      setCats((cats||[]).map(c => toDeactivate.includes(c.id) ? { ...c, is_active:false } : c));
      setDeleteTarget(null); setDeleteConfirm('');
      const sub = childIds.length > 0 ? ` + ${childIds.length} sub-account${childIds.length>1?'s':''}` : '';
      toast(`Account${sub} set to inactive.${linked.length>0?` ${linked.length} transaction${linked.length>1?'s':''} unassigned.`:''}`);
    } catch(e) { toast('Error: '+e.message); }
    finally { setDeleting(false); }
  }

  async function handleReactivate(id) {
    try {
      await reactivateCategory(id);
      setCats(prev => prev.map(c => c.id===id ? { ...c, is_active:true } : c));
      toast('Account reactivated.');
    } catch(e) { toast('Error: '+e.message); }
  }

  // Hard delete: wipes label/type/group from the account row but keeps the code slot.
  // This is only available for inactive accounts (no transaction links).
  function handleHardDelete(cat) { setHardDeleteTarget(cat); }
  async function confirmHardDelete() {
    if (!hardDeleteTarget) return;
    try {
      // Delete children first (if any), then the account itself
      const children = (cats||[]).filter(ch=>ch.parent_id===hardDeleteTarget.id);
      await Promise.all(children.map(ch=>deleteCategory(ch.id)));
      await deleteCategory(hardDeleteTarget.id);
      const allIds = [hardDeleteTarget.id, ...children.map(c=>c.id)];
      setCats(prev => prev.filter(c => !allIds.includes(c.id)));
      if (drillCat && allIds.includes(drillCat.id)) setDrillCat(null);
      const childMsg = children.length>0 ? ` and ${children.length} sub-account${children.length>1?'s':''}` : '';
      toast(`"${hardDeleteTarget.l}"${childMsg} permanently deleted.`);
      setHardDeleteTarget(null);
    } catch(e) { toast('Error: '+e.message); }
  }

  function requestDelete(cat) {
    const txnCount = (txns||[]).filter(t => t.cat === cat.id).length;
    setDeleteTarget({ ...cat, inUse: txnCount > 0, txnCount });
    setDeleteConfirm('');
  }

  // TYPE_RANGES: maps account type → [lo, hi] numeric code range
  const TYPE_RANGES = { asset:[100,399], liability:[400,599], equity:[600,699], income:[700,799], expense:[800,998] };

  // Auto-suggest a code: given type + label, find alphabetical position among
  // existing accounts of that type, then pick the lowest unused code in the range
  // that fits that alphabetical slot.
  function suggestCode(type, label) {
    const [lo, hi] = TYPE_RANGES[type] || [800, 998];
    const used = new Set(
      (cats||[])
        .filter(c => c.t === type && c.code && !c.code.includes('/'))
        .map(c => parseInt(c.code))
        .filter(n => !isNaN(n) && n >= lo && n <= hi)
    );
    // Get all active accounts of this type, sorted alphabetically
    const peers = (cats||[])
      .filter(c => c.t === type && c.is_active !== false && c.code && !c.code.includes('/'))
      .sort((a, b) => (a.l||'').localeCompare(b.l||''));

    const newLabel = (label || '').trim().toLowerCase();
    if (!newLabel) {
      // No label yet — just pick first unused code in range
      for (let n = lo; n <= hi; n++) { if (!used.has(n)) return String(n); }
      return '';
    }

    // Find alphabetical insertion position
    const insertIdx = peers.findIndex(p => (p.l||'').toLowerCase() > newLabel);
    const insertPos = insertIdx === -1 ? peers.length : insertIdx;

    // Ideal: spread codes evenly. Simpler: pick unused code near the position.
    // Divide range into slots. Position 0 of N items → lo + 0*(range/N), etc.
    const rangeSize = hi - lo + 1;
    const totalPeers = peers.length + 1; // +1 for the new one
    const idealNum  = lo + Math.round((insertPos / totalPeers) * rangeSize);
    
    // Search outward from idealNum for an unused code
    for (let delta = 0; delta <= rangeSize; delta++) {
      if (!used.has(idealNum + delta) && idealNum + delta <= hi) return String(idealNum + delta);
      if (!used.has(idealNum - delta) && idealNum - delta >= lo) return String(idealNum - delta);
    }
    return '';
  }

  function openNew() {
    const code = suggestCode('expense', '');
    setForm({ label:'', type:'expense', account_group:'', colour:PALETTE[(cats||[]).length%PALETTE.length], code });
    setEditingId('new');
  }
  function openEdit(cat) { setForm({ label:cat.l, type:cat.t, account_group:cat.ac, colour:cat.col, sort_order:cat.sort_order, code:cat.code||'', parent_id:cat.parent_id||null }); setEditingId(cat.id); }
  function f(k,v)        { setForm(p => ({...p,[k]:v})); }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Sticky toolbar ── */}
      <div style={{ position:'sticky', top:-16, zIndex:100, background:'var(--sand)', borderBottom:'0.5px solid var(--bd)', padding:'10px 18px', marginTop:-16, marginLeft:-18, marginRight:-18, marginBottom:16, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', boxShadow:'0 2px 8px rgba(42,36,32,0.08)' }}>
        <input placeholder="Search accounts…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{ padding:'6px 10px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', color:'var(--ink)', fontFamily:'var(--font-sans)', width:200 }} />
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
          style={{ padding:'6px 10px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', color:'var(--ink)', fontFamily:'var(--font-sans)' }}>
          <option value="">All types</option>
          {TYPE_ORDER.map(t=><option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--stone)', cursor:'pointer' }}>
          <input type="checkbox" checked={showZero} onChange={e=>setShowZero(e.target.checked)} />
          Show zero
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--stone)', cursor:'pointer' }}>
          <input type="checkbox" checked={showInactiveAccts} onChange={e=>setShowInactiveAccts(e.target.checked)} />
          Show inactive
        </label>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button className="btn btn-sm" onClick={()=>setShowMasterCOA(true)}>Master COA</button>
          <button className="btn btn-sm" onClick={()=>setShowSeedModal(true)}>✦ Seed accounts</button>
          <button className="btn btn-a" onClick={openNew}>+ New account</button>
        </div>
      </div>

      {/* ── Bank accounts (read-only) ── */}
      {(!typeFilter || typeFilter==='asset') && (accounts||[]).filter(a=>a.is_active!==false).length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, padding:'6px 12px', background:'#185FA518', borderLeft:'3px solid #185FA5', borderRadius:'0 var(--rr) var(--rr) 0' }}>
            <span style={{ fontSize:11, fontWeight:600, color:'#185FA5', textTransform:'uppercase', letterSpacing:'0.07em', flex:1 }}>Bank Accounts</span>
            <span style={{ fontSize:10, color:'#185FA5', fontStyle:'italic' }}>read-only · managed in Banking</span>
          </div>
          <div className="card" style={{ overflow:'hidden' }}>
            <table style={{ tableLayout:'fixed', width:'100%' }}>
              <colgroup><col style={{ width:56 }} /><col /><col style={{ width:100 }} /><col style={{ width:100 }} /><col style={{ width:110 }} /><col style={{ width:80 }} /></colgroup>
              <thead><tr>
                <th style={{ color:'var(--stone)', fontSize:10 }}>Type</th>
                <th>Account</th><th>Currency</th>
                <th className="tr">Txns</th><th className="tr">Balance</th><th />
              </tr></thead>
              <tbody>
                {(accounts||[]).filter(a=>a.is_active!==false&&(!search||(a.name||'').toLowerCase().includes(search.toLowerCase()))).map(a => {
                  const bal    = bankBalances[a.id] || 0;
                  const txnCnt = (txns||[]).filter(t=>t.account_id===a.id).length;
                  return (
                    <tr key={a.id} style={{ opacity:txnCnt===0?0.5:1 }}>
                      <td style={{ fontFamily:'monospace', fontSize:10, color:'var(--stone)', fontWeight:600 }}>
                        {({checking:'CHK',savings:'SAV',credit_card:'CC',loan:'LN',investment:'INV'})[a.type]||a.type}
                      </td>
                      <td>
                        <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ width:9, height:9, borderRadius:'50%', background:a.colour||'#185FA5', flexShrink:0, display:'inline-block' }} />
                          <span style={{ fontWeight:txnCnt>0?500:400 }}>{a.name}</span>
                        </span>
                      </td>
                      <td style={{ color:'var(--stone)', fontSize:11.5 }}>{a.currency||'AUD'}</td>
                      <td className="tr" style={{ color:'var(--stone)', fontSize:12 }}>
                        {txnCnt>0 ? txnCnt : <span style={{ color:'var(--sand4)' }}>—</span>}
                      </td>
                      <td className={`tr ${bal>0?'vp':bal<0?'vn':''}`} style={{ fontSize:12, fontVariantNumeric:'tabular-nums' }}>{fmt(bal)}</td>
                      <td><span style={{ fontSize:10, color:'var(--sand4)', padding:'2px 7px' }}>—</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Account groups ── */}
      {TYPE_ORDER.filter(type => !typeFilter || typeFilter===type).map(type => {
        const allInType = (cats||[]).filter(c => {
          if (c.t !== type) return false;
          if (!showInactiveAccts && c.is_active === false) return false;
          if (search && !(c.l||'').toLowerCase().includes(search.toLowerCase()) && !(c.ac||'').toLowerCase().includes(search.toLowerCase())) return false;
          return true;
        });
        const childrenOf = id => allInType.filter(c => c.parent_id === id)
          .sort((a,b)=>(a.code||'').localeCompare(b.code||'',undefined,{numeric:true}));
        const parents = allInType.filter(c => !c.parent_id)
          .sort((a,b)=>{
            if(a.code&&b.code) return a.code.localeCompare(b.code,undefined,{numeric:true});
            if(a.code) return -1; if(b.code) return 1;
            return (a.sort_order||0)-(b.sort_order||0);
          });
        const parentRows = showZero ? parents : parents.filter(p => {
          const ch = childrenOf(p.id);
          const tot = ch.length>0 ? ch.reduce((s,x)=>s+(catBalances[x.id]||0),0) : catBalances[p.id]||0;
          return tot!==0 || ch.length>0;
        });
        if (parentRows.length === 0) return null;
        const typeTotal = allInType.reduce((s,c) => s+(catBalances[c.id]||0), 0);

        return (
          <div key={type} style={{ marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, padding:'6px 12px', background:TYPE_COLOURS[type]+'18', borderLeft:`3px solid ${TYPE_COLOURS[type]}`, borderRadius:'0 var(--rr) var(--rr) 0' }}>
              <span style={{ fontSize:11, fontWeight:600, color:TYPE_COLOURS[type], textTransform:'uppercase', letterSpacing:'0.07em', flex:1 }}>{TYPE_LABELS[type]}</span>
              <span style={{ fontSize:11, fontVariantNumeric:'tabular-nums', color:TYPE_COLOURS[type] }}>{fmt(typeTotal)}</span>
            </div>

            <div className="card" style={{ overflow:'hidden' }}>
              <table style={{ tableLayout:'fixed', width:'100%' }}>
                <colgroup>
                  <col style={{ width:64 }} />
                  <col />
                  <col style={{ width:150 }} />
                  <col style={{ width:100 }} />
                  <col style={{ width:110 }} />
                  <col style={{ width:80 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ color:'var(--stone)', fontFamily:'monospace' }}>Code</th>
                    <th>Account</th>
                    <th>Group</th>
                    <th className="tr">Txns</th>
                    <th className="tr">Balance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {parentRows.map(cat => {
                    const children    = childrenOf(cat.id);
                    const hasChildren = children.length > 0;
                    const isCollapsed = collapsed.has(cat.id);
                    const activeChildren = children.filter(ch=>ch.is_active!==false);
                    const hasActiveChildren = activeChildren.length > 0;
                    const childSum    = activeChildren.reduce((s,ch)=>s+(catBalances[ch.id]||0),0);
                    const bal         = hasChildren ? childSum : (catBalances[cat.id]||0);
                    const txnCnt      = hasChildren
                      ? activeChildren.reduce((s,ch)=>s+(txns||[]).filter(t=>t.cat===ch.id).length,0)
                      : (txns||[]).filter(t=>t.cat===cat.id).length;
                    const canDeactivate = activeChildren.length === 0;
                    return (
                      <React.Fragment key={cat.id}>
                        <tr
                          style={{ opacity:cat.is_active===false?0.6:(txnCnt===0&&!hasChildren?0.45:1), cursor:hasChildren?'default':'default',
                                   background:hasChildren?'var(--sand)':undefined }}>
                          <td style={{ fontFamily:'monospace', fontSize:11.5, color:'var(--stone)', fontWeight:600 }}>
                            {cat.code||<span style={{ color:'var(--sand4)' }}>—</span>}
                          </td>
                          <td style={{ cursor:hasChildren||txnCnt>0?'pointer':'default' }}
                            onClick={()=>hasChildren?toggleCollapse(cat.id):txnCnt>0&&setDrillCat(cat)}>
                            <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                              {hasChildren && <span style={{ fontSize:9, color:'var(--stone)', width:10 }}>{isCollapsed?'▶':'▼'}</span>}
                              <span style={{ width:9, height:9, borderRadius:'50%', background:cat.col, flexShrink:0, display:'inline-block' }} />
                              <span style={{ fontWeight:500, opacity:cat.is_active===false?0.5:1 }}>{cat.l}</span>
                              {cat.is_active===false && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:99, background:'var(--sand3)', color:'var(--stone)', fontWeight:500 }}>inactive</span>}
                              {hasChildren && <span style={{ fontSize:9, color:'var(--stone)' }}>{children.length} sub</span>}
                              {!hasChildren&&txnCnt>0 && <span style={{ fontSize:10, color:'var(--a)' }}>View →</span>}
                            </span>
                          </td>
                          <td style={{ color:'var(--stone)', fontSize:11.5 }}>{cat.ac}</td>
                          <td className="tr" style={{ color:'var(--stone)', fontSize:12 }}>
                            {txnCnt>0?txnCnt:<span style={{ color:'var(--sand4)' }}>—</span>}
                          </td>
                          <td className={`tr ${bal>0?'vp':bal<0?'vn':''}`} style={{ fontSize:12, fontVariantNumeric:'tabular-nums', fontWeight:hasChildren?500:400 }}>
                            {(txnCnt>0||hasChildren)?fmt(bal):<span style={{ color:'var(--sand4)' }}>$0.00</span>}
                          </td>
                          <td>
                            <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                              <button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px' }} onClick={()=>openEdit(cat)}>Edit</button>
                              {cat.is_active===false ? (
                                <div style={{ display:'flex', gap:3 }}>
                                  <button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px', color:'var(--gn)' }} title="Reactivate" onClick={()=>handleReactivate(cat.id)}>↺</button>
                                  {canDeactivate&&<button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px', color:'var(--rd)' }} title="Delete" onClick={()=>handleHardDelete(cat)}>🗑</button>}
                                </div>
                              ) : canDeactivate ? (
                                <button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px', color:'var(--stone)' }} title="Set inactive" onClick={()=>requestDelete(cat)}>×</button>
                              ) : (
                                <span style={{ fontSize:10, color:'var(--sand4)', padding:'2px 7px' }} title="Remove sub-accounts first">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {!isCollapsed && children.map(ch => {
                          const chBal    = catBalances[ch.id]||0;
                          const chTxnCnt = (txns||[]).filter(t=>t.cat===ch.id).length;
                          return (
                            <tr key={ch.id} style={{ background:'var(--sand)', opacity:ch.is_active===false?0.5:(chTxnCnt===0?0.45:1) }}>
                              <td style={{ fontFamily:'monospace', fontSize:11, color:'var(--stone)', paddingLeft:20 }}>{ch.code||'—'}</td>
                              <td style={{ cursor:chTxnCnt>0?'pointer':'default' }} onClick={()=>chTxnCnt>0&&setDrillCat(ch)}>
                                <span style={{ display:'flex', alignItems:'center', gap:6, paddingLeft:14 }}>
                                  <span style={{ fontSize:9, color:'var(--stone2)' }}>└</span>
                                  <span style={{ width:8, height:8, borderRadius:'50%', background:ch.col, flexShrink:0, display:'inline-block' }} />
                                  <span style={{ fontSize:12, opacity:ch.is_active===false?0.5:1 }}>{ch.l}</span>
                                  {ch.is_active===false&&<span style={{ fontSize:9, padding:'1px 5px', borderRadius:99, background:'var(--sand3)', color:'var(--stone)' }}>inactive</span>}
                                  {chTxnCnt>0&&<span style={{ fontSize:10, color:'var(--a)' }}>View →</span>}
                                </span>
                              </td>
                              <td style={{ color:'var(--stone)', fontSize:11 }}>{ch.ac}</td>
                              <td className="tr" style={{ color:'var(--stone)', fontSize:11 }}>{chTxnCnt>0?chTxnCnt:<span style={{ color:'var(--sand4)' }}>—</span>}</td>
                              <td className={`tr ${chBal>0?'vp':chBal<0?'vn':''}`} style={{ fontSize:11, fontVariantNumeric:'tabular-nums' }}>
                                {chTxnCnt>0?fmt(chBal):<span style={{ color:'var(--sand4)' }}>$0.00</span>}
                              </td>
                              <td>
                                <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                                  <button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px' }} onClick={()=>openEdit(ch)}>Edit</button>
                                  {ch.is_active===false ? (
                                    <div style={{ display:'flex', gap:3 }}>
                                      <button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px', color:'var(--gn)' }} onClick={()=>handleReactivate(ch.id)}>↺</button>
                                      <button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px', color:'var(--rd)' }} onClick={()=>handleHardDelete(ch)}>🗑</button>
                                    </div>
                                  ) : (
                                    <button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px', color:'var(--stone)' }} onClick={()=>requestDelete(ch)}>×</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
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
          <button className="btn btn-a" onClick={()=>setShowSeedModal(true)}>Seed chart of accounts</button>
        </div>
      )}

      {/* ── Drill panel ── */}
      {drillCat && (
        <DrillPanel cat={drillCat} txns={txns} setTxns={setTxns} catMap={{}} cats={cats}
          dateFrom={dateFrom} dateTo={dateTo}
          onClose={()=>setDrillCat(null)}
          onEdit={()=>{ openEdit(drillCat); setDrillCat(null); }}
          toast={toast} />
      )}

      {/* ── Seed modal ── */}
      {showSeedModal && (
        <div className="modal-bg" onMouseDown={e=>{if(e.target===e.currentTarget)setShowSeedModal(false);}}>
          <div className="modal" style={{ width:500 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <h3>Seed chart of accounts</h3>
              <button className="btn-ghost" onClick={()=>setShowSeedModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize:12.5, color:'var(--stone2)', marginBottom:14 }}>Load a standard set of accounts for your entity type.</p>
              <div style={{ fontSize:11, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>How to handle existing accounts</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
                {[['replace','Replace existing','Remove all current accounts first'],['add','Add additional','Keep existing, add new ones']].map(([mode,label,desc])=>(
                  <div key={mode} onClick={()=>setSeedMode(mode)}
                    style={{ padding:12, borderRadius:'var(--rr)', border:`1.5px solid ${seedMode===mode?'var(--a)':'var(--bd)'}`, background:seedMode===mode?'var(--ab)':'transparent', cursor:'pointer' }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{label}</div>
                    <div style={{ fontSize:11, color:'var(--stone)', marginTop:3 }}>{desc}</div>
                  </div>
                ))}
              </div>
              {seedMode==='replace' && (
                <div style={{ padding:'8px 12px', background:'var(--rdb)', borderRadius:'var(--rr)', fontSize:11.5, color:'var(--rd)', marginBottom:14 }}>
                  ⚠ Existing accounts will be deleted. Transactions will become unallocated.
                </div>
              )}
              <div style={{ fontSize:11, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Template</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {[['personal','👤 Personal / Household','Individuals & families',COA_PERSONAL.length],['company','🏢 Company / Business','Pty Ltd, sole trader',COA_COMPANY.length],['trust','⚖️ Trust','Family & unit trusts',COA_TRUST.length]].map(([id,label,desc,cnt])=>(
                  <div key={id} onClick={()=>setSeedTemplate(id)}
                    style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', borderRadius:'var(--rr)', border:`1.5px solid ${seedTemplate===id?'var(--a)':'var(--bd)'}`, background:seedTemplate===id?'var(--ab)':'transparent', cursor:'pointer' }}>
                    <div>
                      <div style={{ fontWeight:500, fontSize:13 }}>{label}</div>
                      <div style={{ fontSize:11, color:'var(--stone)', marginTop:2 }}>{desc}</div>
                    </div>
                    <span style={{ fontSize:11, color:'var(--stone)', flexShrink:0 }}>{cnt} accounts</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={()=>setShowSeedModal(false)}>Cancel</button>
              <button className="btn btn-a" disabled={!seedMode||!seedTemplate||saving} onClick={handleSeed}>
                {saving?'Seeding…':'Seed accounts'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Master COA browser ── */}
      {showMasterCOA && (
        <div className="modal-bg" onMouseDown={e=>{if(e.target===e.currentTarget){setShowMasterCOA(false);setMasterSel(new Set());}}}>
          <div className="modal" style={{ width:720, maxHeight:'90vh', display:'flex', flexDirection:'column' }} onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <h3>Master Chart of Accounts</h3>
              <button className="btn-ghost" onClick={()=>setShowMasterCOA(false)}>×</button>
            </div>
            <div style={{ padding:'10px 20px', borderBottom:'0.5px solid var(--bd)', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <input value={masterSearch} onChange={e=>setMasterSearch(e.target.value)}
                placeholder="Search by code, name or group…"
                style={{ flex:1, padding:'5px 10px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)' }} />
              <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--stone)', cursor:'pointer', flexShrink:0 }}>
                <input type="checkbox" checked={showNullMaster} onChange={e=>setShowNullMaster(e.target.checked)} />
                Show null slots
              </label>
              <span style={{ fontSize:12, color:'var(--stone)', flexShrink:0 }}>{masterSel.size} selected</span>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {TYPE_ORDER.map(type => {
                // Include null rows that fall in this type's code range
                const TYPE_RANGES_MAP = { asset:[100,399], liability:[400,599], equity:[600,699], income:[700,799], expense:[800,998] };
                const [lo, hi] = TYPE_RANGES_MAP[type] || [0,999];
                const rows = masterFiltered.filter(m => {
                  const n = parseInt(m.code);
                  if (m.type === type) return true;
                  // Null rows: assign to section by code range
                  if (!m.type && n >= lo && n <= hi) return true;
                  return false;
                }).sort((a,b) => parseInt(a.code)-parseInt(b.code));
                if (!rows.length) return null;
                const headerLabel = TYPE_LABELS[type];
                const headerColour = TYPE_COLOURS[type];
                return (
                  <div key={type}>
                    <div style={{ padding:'6px 20px 4px', background:'var(--sand)', position:'sticky', top:0, display:'flex', alignItems:'center', gap:6, borderBottom:'0.5px solid var(--bd)' }}>
                      <span style={{ width:8, height:8, borderRadius:2, background:headerColour }} />
                      <span style={{ fontSize:11, fontWeight:700, color:headerColour, textTransform:'uppercase', letterSpacing:'0.07em' }}>{headerLabel}</span>
                      <span style={{ fontSize:10, color:'var(--stone)' }}>({rows.length})</span>
                    </div>
                    {rows.map(m => {
                      const isNull = !m.label || !m.type;
                      if (isNull) {
                        // Null/placeholder slot — show code + "add new account" button
                        return (
                          <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 20px', borderBottom:'0.5px solid var(--bd)', opacity:0.5 }}>
                            <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:600, flex:'0 0 48px', color:'var(--stone)' }}>{m.code}</span>
                            <span style={{ flex:1, fontSize:11, color:'var(--stone)', fontStyle:'italic' }}>empty slot</span>
                            <button className="btn btn-sm" style={{ fontSize:10 }}
                              onClick={() => {
                                setShowMasterCOA(false);
                                setForm({ label:'', type:'expense', account_group:'', colour:'#888780', code:m.code, parent_id:null });
                                setEditingId('new');
                              }}>
                              + Add account
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div key={m.id}
                          onClick={()=>{ if(!m.alreadyAdded) setMasterSel(p=>{const n=new Set(p); n.has(m.id)?n.delete(m.id):n.add(m.id); return n;}); }}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 20px', borderBottom:'0.5px solid var(--bd)', opacity:m.alreadyAdded?0.4:1, cursor:m.alreadyAdded?'default':'pointer', background:masterSel.has(m.id)?'var(--ab)':'transparent' }}>
                          <input type="checkbox" checked={masterSel.has(m.id)} readOnly style={{ flexShrink:0, pointerEvents:'none' }} />
                          <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:600, flex:'0 0 48px', color:'var(--stone)' }}>{m.code}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:500, fontSize:12.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.label}</div>
                            {m.description && <div style={{ fontSize:11, color:'var(--stone)', marginTop:1 }}>{m.description}</div>}
                          </div>
                          <span style={{ fontSize:11, color:'var(--stone)', flex:'0 0 140px', textAlign:'right' }}>{m.group_name}</span>
                          {m.is_common && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:99, background:'var(--gnb)', color:'var(--gn)', fontWeight:600, marginLeft:4, flexShrink:0 }}>common</span>}
                          {m.alreadyAdded && <span style={{ fontSize:9, color:'var(--stone)', marginLeft:4, flexShrink:0 }}>added</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {masterFiltered.length === 0 && <div style={{ padding:32, textAlign:'center', color:'var(--stone)', fontSize:12 }}>No accounts match your search.</div>}
            </div>
            <div className="modal-foot" style={{ justifyContent:'space-between' }}>
              <button className="btn btn-sm"
                onClick={()=>{ const e=new Set(masterFiltered.filter(m=>!m.alreadyAdded).map(m=>m.id)); setMasterSel(p=>p.size===e.size?new Set():e); }}>
                {masterSel.size>0?'Deselect all':'Select all visible'}
              </button>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn" onClick={()=>{setShowMasterCOA(false);setMasterSel(new Set());}}>Cancel</button>
                <button className="btn btn-a" disabled={masterSel.size===0||importing} onClick={handleImportMaster}>
                  {importing?'Adding…':`Add ${masterSel.size} account${masterSel.size!==1?'s':''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div className="modal-bg" onClick={()=>setDeleteTarget(null)}>
          <div className="modal" style={{ width:420 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-head" style={{ background:'var(--al)', borderBottom:'0.5px solid var(--bd)' }}>
              <h3 style={{ color:'var(--a2)' }}>Set account inactive</h3>
              <button className="btn-ghost" style={{ padding:0, fontSize:16 }} onClick={()=>setDeleteTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize:13, marginBottom:12 }}>Set <strong>"{deleteTarget.l}"</strong> to inactive?</p>
              {deleteTarget.txnCount > 0 && (
                <div style={{ padding:'8px 12px', background:'var(--al)', borderRadius:'var(--rr)', fontSize:12, color:'var(--a2)', marginBottom:10 }}>
                  <strong>{deleteTarget.txnCount} transaction{deleteTarget.txnCount!==1?'s':''}</strong> will be unassigned.
                </div>
              )}
              <p style={{ fontSize:12, color:'var(--stone)', marginBottom:8 }}>
                The account will be hidden. You can reactivate it with ↺ or delete it permanently with 🗑.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={()=>setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-a" disabled={deleting} onClick={handleDeactivate}>
                {deleting?'Saving…':'Set inactive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hard delete modal ── */}
      {hardDeleteTarget && (
        <div className="modal-bg" onClick={()=>setHardDeleteTarget(null)}>
          <div className="modal" style={{ width:400 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-head" style={{ background:'var(--rdb)', borderBottom:'0.5px solid #f09595' }}>
              <h3 style={{ color:'var(--rd)' }}>Delete account</h3>
              <button className="btn-ghost" onClick={()=>setHardDeleteTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize:13 }}>Permanently delete <strong>"{hardDeleteTarget.l}"</strong> ({hardDeleteTarget.code})?</p>
              <p style={{ fontSize:12, color:'var(--stone)', marginTop:8 }}>This cannot be undone.</p>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={()=>setHardDeleteTarget(null)}>Cancel</button>
              <button className="btn" style={{ background:'var(--rd)', color:'#fff', borderColor:'var(--rd)' }} onClick={confirmHardDelete}>
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit / New modal ── */}
      {editingId !== null && (
        <div className="modal-bg" onClick={()=>setEditingId(null)}>
          <div className="modal" style={{ width:420 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editingId==='new'?'New account':'Edit account'}</h3>
              <button className="btn-ghost" style={{ padding:0, fontSize:16 }} onClick={()=>setEditingId(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display:'grid', gridTemplateColumns:'100px 1fr', gap:12, marginBottom:12 }}>
                <div className="field" style={{ marginBottom:0 }}>
                  <label>Code</label>
                  {form.parent_id ? (
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <span style={{ fontFamily:'monospace', fontSize:12.5, color:'var(--stone)', background:'var(--sand)', padding:'5px 8px', borderRadius:'var(--rr)', border:'0.5px solid var(--bd2)', flexShrink:0, whiteSpace:'nowrap' }}>
                        {(form.code||'').split('/')[0] || '???'}/
                      </span>
                      <input type="text"
                        value={(form.code||'').split('/')[1]||''}
                        onChange={e=>{
                          const prefix=(form.code||'').split('/')[0]||'';
                          const suffix=e.target.value.replace(/[^0-9]/g,'').slice(0,3);
                          f('code', suffix ? prefix+'/'+suffix : prefix);
                        }}
                        placeholder="001" maxLength={3}
                        style={{ fontFamily:'monospace', width:70 }} />
                    </div>
                  ) : (
                    <input type="text" value={form.code||''} 
                      onChange={e=>{
                        const val=e.target.value.replace(/[^0-9]/g,'').slice(0,3);
                        f('code', val);
                      }}
                      onBlur={e=>{
                        const val=(form.code||'').replace(/[^0-9]/g,'').slice(0,3);
                        if(val) f('code', val.padStart(3,'0'));
                      }}
                      placeholder="001" maxLength={3} style={{ fontFamily:'monospace', width:80 }} />
                  )}
                </div>
                <div className="field" style={{ marginBottom:0 }}>
                  <label>Account name</label>
                  <input type="text" value={form.label||''} onChange={e=>f('label',e.target.value)} placeholder="e.g. Motor Vehicle Expenses" />
                </div>
              </div>
              <div className="field">
                <label>Parent account <span style={{ fontWeight:400, color:'var(--stone)' }}>(optional)</span></label>
                <select value={form.parent_id||''} onChange={e=>{
                  const pid=e.target.value||null; f('parent_id',pid);
                  if (pid) {
                    const par=(cats||[]).find(p=>p.id===pid);
                    if (par && par.code) {
                      const cur=(form.code||'').replace(/.*\//,'');
                      f('code', par.code+'/'+cur.padStart(3,'0'));
                    }
                  } else if ((form.code||'').includes('/')) {
                    f('code',(form.code||'').split('/')[1]);
                  }
                }}>
                  <option value="">— Top-level (no parent) —</option>
                  {(cats||[]).filter(p=>p.id!==editingId&&!p.parent_id&&p.is_active!==false)
                    .sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999))
                    .map(p=><option key={p.id} value={p.id}>{p.code?p.code+'  ':''}{p.l}</option>)}
                </select>
                {form.parent_id && editingId!=='new' && (cats||[]).find(cx=>cx.id===editingId)?.parent_id!==form.parent_id && (
                  <div style={{ marginTop:4,fontSize:11,color:'var(--a2)',background:'var(--al)',padding:'4px 8px',borderRadius:'var(--rr)' }}>
                    ↪ Moving under new parent. Transactions stay assigned to this account.
                  </div>
                )}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="field">
                  <label>Type</label>
                  <select value={form.type||'expense'} onChange={e=>{
                    f('type',e.target.value);
                    if (editingId==='new' && !form.parent_id) f('code', suggestCode(e.target.value, form.label));
                  }}>
                    {TYPE_ORDER.map(t=><option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                  {editingId!=='new' && form.type !== (cats||[]).find(c=>c.id===editingId)?.t && (
                    <div style={{ marginTop:5, padding:'5px 8px', background:'var(--rdb)', borderRadius:'var(--rr)', fontSize:11, color:'var(--rd)', fontWeight:500 }}>
                      ⚠ Type change requires confirmation — will affect reports and journals.
                    </div>
                  )}
                </div>
                <div className="field">
                  <label>Group</label>
                  <input type="text" value={form.account_group||''} onChange={e=>f('account_group',e.target.value)} placeholder={TYPE_LABELS[form.type||'expense']} />
                </div>
              </div>
              <div className="field">
                <label>Colour</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, paddingTop:4 }}>
                  {(PALETTE||[]).map(col=>(
                    <span key={col} onClick={()=>f('colour',col)} style={{ width:22, height:22, borderRadius:'50%', background:col, cursor:'pointer', border:form.colour===col?'2.5px solid var(--ink)':'2px solid transparent' }} />
                  ))}
                </div>
              </div>
              {editingId !== 'new' && !form.parent_id && (
                <div style={{ borderTop:'0.5px solid var(--bd)', paddingTop:14, marginTop:4 }}>
                  <div style={{ fontSize:11, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Sub-accounts</div>
                  {(cats||[]).filter(c=>c.parent_id===editingId).length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      {(cats||[]).filter(c=>c.parent_id===editingId).sort((a,b)=>(a.code||'').localeCompare(b.code||'')).map(sub=>(
                        <div key={sub.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', fontSize:12 }}>
                          <span style={{ fontFamily:'monospace', color:'var(--stone)', flex:'0 0 56px' }}>{sub.code}</span>
                          <span style={{ flex:1 }}>{sub.l}</span>
                          <button className="btn btn-sm" style={{ fontSize:10 }} onClick={()=>{ setEditingId(null); openEdit(sub); }}>Edit</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button className="btn btn-sm" style={{ fontSize:11 }}
                    onClick={()=>{
                      const parent = (cats||[]).find(c=>c.id===editingId);
                      const children = (cats||[]).filter(c=>c.parent_id===editingId);
                      const maxN = children.reduce((m,c)=>Math.max(m,parseInt((c.code||'').split('/')[1]||'0')),0);
                      const nextCode = parent?.code ? `${parent.code}/${String(maxN+1).padStart(3,'0')}` : '';
                      setForm({ label:'', type:parent?.t||'expense', account_group:parent?.ac||'', colour:parent?.col||'#888780', code:nextCode, parent_id:editingId });
                      setEditingId('new');
                    }}>
                    + Add sub-account
                  </button>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={()=>setEditingId(null)}>Cancel</button>
              <button className="btn btn-a" onClick={save} disabled={saving}>{saving?'Saving…':'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
