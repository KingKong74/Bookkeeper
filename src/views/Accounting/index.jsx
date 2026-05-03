/**
 * views/Accounting/index.jsx
 * Accounting section: Categories, AutoCatRules, Budgets
 * Journals and ChartOfAccounts live in their own files.
 */

export { Journals }       from './Journals';
export { ChartOfAccounts } from './ChartOfAccounts';

import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { createCategory, updateCategory, deleteCategory, createRule, updateRule, deleteRule } from '../../lib/supabase';
import { fmt, filterByDateRange } from '../../utils/helpers';
import { PeriodBar } from '../../components/ui/PeriodBar';


export function Categories() {
  const { cats, setCats, txns, setTxns, PALETTE, toast } = useApp();  // txns = alias for transactions
  const [editing, setEditing] = useState(null); // null = closed, 'new', or category.id
  const [form, setForm] = useState({ l: '', t: 'expense', ac: '', col: '' });

  function openNew() {
    setForm({ l: '', t: 'expense', ac: '', col: PALETTE[0] });
    setEditing('new');
  }
  function openEdit(cat) {
    setForm({ l: cat.l, t: cat.t, ac: cat.ac, col: cat.col });
    setEditing(cat.id);
  }
  function save() {
    if (!form.l.trim() || !form.ac.trim()) { alert('Fill in name and account group.'); return; }
    if (editing === 'new') {
      setCats(prev => [...prev, { id: `cat_${Date.now()}`, ...form }]);
      toast('Category created.');
    } else {
      setCats(prev => prev.map(c => c.id === editing ? { ...c, ...form } : c));
      toast('Category updated.');
    }
    setEditing(null);
  }
  function del(id) {
    if (txns.some(t => (t.cat === id || t.category_id === id)) && !confirm('Category is in use. Delete anyway?')) return;
    setCats(prev => prev.filter(c => c.id !== id));
    setTxns(prev => prev.map(t => t.cat === id ? { ...t, cat: null } : t));
    toast('Category deleted.');
  }

  const TYPE_CLASS = { income: 'coa-income', expense: 'coa-expense', asset: 'coa-asset', liability: 'coa-liability', equity: 'coa-equity' };

  return (
    <div>
      <div className="card">
        <div className="ch">
          <h3>Categories</h3>
          <p>{cats.length} total</p>
          <div className="ch-r"><button className="btn btn-a btn-sm" onClick={openNew}>+ New category</button></div>
        </div>
        <table>
          <thead><tr><th style={{ width: 36 }} /><th>Name</th><th>Type</th><th>Account group</th><th style={{ width: 90 }} /></tr></thead>
          <tbody>
            {cats.map(c => (
              <tr key={c.id}>
                <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c.col }} /></td>
                <td style={{ fontWeight: 500 }}>{c.l}</td>
                <td><span className={`coa-type ${TYPE_CLASS[c.t] || ''}`}>{c.t}</span></td>
                <td style={{ color: 'var(--stone)' }}>{c.ac}</td>
                <td>
                  <button className="btn btn-sm btn-ghost" style={{ marginRight: 4 }} onClick={() => openEdit(c)}>Edit</button>
                  <button className="btn btn-sm btn-reject" onClick={() => del(c.id)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {editing !== null && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editing === 'new' ? 'New category' : 'Edit category'}</h3>
              <button className="btn-ghost" style={{ padding: 0, fontSize: 16 }} onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field"><label>Name</label><input value={form.l} onChange={e => setForm(f => ({ ...f, l: e.target.value }))} placeholder="e.g. Groceries" /></div>
              <div className="field"><label>Type</label>
                <select value={form.t} onChange={e => setForm(f => ({ ...f, t: e.target.value }))}>
                  {['income','expense','asset','liability','equity'].map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div className="field"><label>Account group</label><input value={form.ac} onChange={e => setForm(f => ({ ...f, ac: e.target.value }))} placeholder="e.g. Living expenses" /></div>
              <div className="field">
                <label>Colour</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 0' }}>
                  {PALETTE.map(col => (
                    <span key={col} onClick={() => setForm(f => ({ ...f, col }))}
                      style={{ width: 26, height: 26, borderRadius: '50%', background: col, cursor: 'pointer', border: form.col === col ? '2px solid var(--ink)' : '2px solid transparent' }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-a" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AutoCatRules() {
  const { rules, setRules, cats, payees, toast } = useApp();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ keyword: '', catId: '', payee: '', amtExact: '', amtMin: '', amtMax: '', direction: '' });
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  function openNew()   { setForm({ keyword: '', catId: '', payee: '', amtExact: '', amtMin: '', amtMax: '', direction: '' }); setEditing('new'); }
  function openEdit(i) { setForm({ amtExact: '', amtMin: '', amtMax: '', direction: '', ...rules[i] }); setEditing(i); }

  function save() {
    if (!form.keyword.trim()) { toast('Keyword is required.'); return; }
    if (editing === 'new') {
      setRules(prev => [...prev, { id: Date.now(), ...form }]);
      toast('Rule saved.');
    } else {
      setRules(prev => prev.map((r, i) => i === editing ? { ...r, ...form } : r));
      toast('Rule updated.');
    }
    setEditing(null);
  }

  async function del(i) {
    const rule = rules[i];
    // Delete from DB if it has a real ID (not a local Date.now() temp id)
    if (rule.id && typeof rule.id === 'string') {
      try { await deleteRule(rule.id); } catch(e) { toast('Delete failed: ' + e.message); return; }
    }
    setRules(prev => prev.filter((_, j) => j !== i));
    toast('Rule deleted.');
  }

  // Drag-and-drop reorder
  function onDragStart(e, i) {
    setDragIdx(i);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.5';
  }
  function onDragEnd(e) {
    e.currentTarget.style.opacity = '';
    setDragOver(null);
  }
  function onDragOver(e, i) { e.preventDefault(); setDragOver(i); }
  function onDrop(e, i) {
    e.preventDefault();
    setDragOver(null);
    if (dragIdx === null || dragIdx === i) return;
    setRules(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(dragIdx, 1);
      arr.splice(i, 0, moved);
      return arr;
    });
    setDragIdx(null);
  }

  return (
    <div>
      <div className="card">
        <div className="ch">
          <h3>Auto-categorisation rules</h3>
          <p>{rules.length} rules · drag to reorder</p>
          <div className="ch-r"><button className="btn btn-a btn-sm" onClick={openNew}>+ New rule</button></div>
        </div>

        {/* Header */}
        <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 130px 130px 80px', gap:8, padding:'6px 12px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)' }}>
          {['','Keyword','Category','Payee',''].map((h,i) => (
            <span key={i} style={{ fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</span>
          ))}
        </div>

        {rules.map((r, i) => {
          const cat = cats.find(x => x.id === r.catId);
          const isOver = dragOver === i;
          return (
            <div
              key={r.id || i}
              draggable
              onDragStart={e => onDragStart(e, i)}
              onDragEnd={onDragEnd}
              onDragOver={e => onDragOver(e, i)}
              onDrop={e => onDrop(e, i)}
              style={{
                display:'grid', gridTemplateColumns:'28px 1fr 130px 130px 80px',
                gap:8, alignItems:'center', padding:'7px 12px',
                borderBottom: isOver ? '2px solid var(--a)' : '0.5px solid var(--bd)',
                background: isOver ? 'var(--al)' : 'transparent',
                cursor:'grab',
              }}
            >
              {/* Drag handle */}
              <span style={{ fontSize:12, color:'var(--stone)', opacity:0.5, userSelect:'none', textAlign:'center' }}>⠿</span>
              {/* Priority badge + keyword + amount conditions */}
              <span style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                <span style={{ fontSize:9, padding:'1px 4px', borderRadius:3, background:'var(--sand3)', color:'var(--stone)', fontWeight:600, flexShrink:0 }}>#{i+1}</span>
                <span style={{ fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>"{r.keyword}"</span>
                {r.amtExact && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:99, background:'var(--sand2)', color:'var(--stone)', flexShrink:0 }}>=\${r.amtExact}</span>}
                {!r.amtExact && r.amtMin && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:99, background:'var(--sand2)', color:'var(--stone)', flexShrink:0 }}>&gt;\${r.amtMin}</span>}
                {!r.amtExact && r.amtMax && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:99, background:'var(--sand2)', color:'var(--stone)', flexShrink:0 }}>&lt;\${r.amtMax}</span>}
                {r.direction === 'in'  && <span style={{ fontSize:10, padding:'1px 5px', borderRadius:99, background:'var(--gnb)', color:'var(--gn)', flexShrink:0 }}>in</span>}
                {r.direction === 'out' && <span style={{ fontSize:10, padding:'1px 5px', borderRadius:99, background:'var(--rdb)', color:'var(--rd)', flexShrink:0 }}>out</span>}
              </span>
              <span>
                {cat
                  ? <span className="cpill" style={{ background:`${cat.col}18`, color:cat.col, borderColor:`${cat.col}44`, fontSize:11 }}>
                      <span className="cdot" style={{ background:cat.col }} />{cat.l}
                    </span>
                  : <span style={{ color:'var(--stone)', fontSize:12 }}>—</span>
                }
              </span>
              <span style={{ color:'var(--stone2)', fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.payee || '—'}</span>
              <span style={{ display:'flex', gap:5 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => openEdit(i)}>Edit</button>
                <button className="btn btn-sm btn-reject" onClick={() => del(i)}>×</button>
              </span>
            </div>
          );
        })}
        {rules.length === 0 && <div style={{ padding:'20px 14px', fontSize:12, color:'var(--stone)' }}>No rules yet. Add one to start auto-categorising.</div>}
      </div>

      <div style={{ padding:'10px 14px', fontSize:12, color:'var(--stone)', background:'#FDFAF6', border:'0.5px solid var(--bd)', borderRadius:'var(--rr)', marginTop:8 }}>
        Rules run in order — #1 wins. Keywords match anywhere in the description (case-insensitive). Drag rows to change priority.
      </div>

      {/* Modal */}
      {editing !== null && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editing === 'new' ? 'New rule' : 'Edit rule'}</h3>
              <button className="btn-ghost" style={{ padding:0, fontSize:16 }} onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Keyword <span style={{ color:'var(--stone)', fontWeight:400 }}>(matched anywhere in description)</span></label>
                <input value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))} placeholder="e.g. PAYMENT TO GOODLIFE" />
                <p style={{ fontSize:11, color:'var(--stone)', marginTop:4 }}>Tip: use the full meaningful phrase, e.g. "PAYMENT TO GOODLIFE" not just "PAYMENT"</p>
              </div>
              <div className="field"><label>Assign category</label>
                <select value={form.catId} onChange={e => setForm(f => ({ ...f, catId: e.target.value }))}>
                  <option value="">— none —</option>
                  {cats.map(cat => <option key={cat.id} value={cat.id}>{cat.l}</option>)}
                </select>
              </div>
              <div className="field"><label>Assign payee</label>
                <input list="rule-payee-list" value={form.payee} onChange={e => setForm(f => ({ ...f, payee: e.target.value }))} placeholder="e.g. Goodlife Fitness" />
                <datalist id="rule-payee-list">{payees.map(p => <option key={p.id} value={p.name} />)}</datalist>
              </div>

              {/* Amount conditions */}
              <div style={{ borderTop:'0.5px solid var(--bd)', paddingTop:12, marginTop:4 }}>
                <div style={{ fontSize:11, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>
                  Amount conditions <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(optional — all must match)</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                  <div className="field" style={{ marginBottom:0 }}>
                    <label>Exact amount ($)</label>
                    <div style={{ position:'relative' }}>
                      <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--stone)', fontSize:12 }}>$</span>
                      <input type="number" min="0" step="0.01" value={form.amtExact} style={{ paddingLeft:20 }}
                        onChange={e => setForm(f => ({ ...f, amtExact: e.target.value, amtMin:'', amtMax:'' }))}
                        placeholder="17.49" />
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom:0 }}>
                    <label>Min amount ($)</label>
                    <div style={{ position:'relative' }}>
                      <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--stone)', fontSize:12 }}>$</span>
                      <input type="number" min="0" step="0.01" value={form.amtMin} style={{ paddingLeft:20 }}
                        onChange={e => setForm(f => ({ ...f, amtMin: e.target.value, amtExact:'' }))}
                        placeholder="100" disabled={!!form.amtExact} />
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom:0 }}>
                    <label>Max amount ($)</label>
                    <div style={{ position:'relative' }}>
                      <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--stone)', fontSize:12 }}>$</span>
                      <input type="number" min="0" step="0.01" value={form.amtMax} style={{ paddingLeft:20 }}
                        onChange={e => setForm(f => ({ ...f, amtMax: e.target.value, amtExact:'' }))}
                        placeholder="500" disabled={!!form.amtExact} />
                    </div>
                  </div>
                </div>
                <div className="field" style={{ marginTop:10, marginBottom:0 }}>
                  <label>Direction</label>
                  <div style={{ display:'flex', gap:8, marginTop:4 }}>
                    {[['','Any'],['in','Credits only (money in)'],['out','Debits only (money out)']].map(([v,l]) => (
                      <label key={v} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12.5, cursor:'pointer', fontWeight:400 }}>
                        <input type="radio" name="rule-direction" value={v} checked={form.direction===v} onChange={() => setForm(f => ({ ...f, direction:v }))} style={{ cursor:'pointer' }} />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-a" onClick={save}>Save rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Budgets() {
  const { txns, cats, catMap, budgets, setBudgets, dateFrom, dateTo, toast } = useApp();
  const ft = filterByDateRange(txns, dateFrom, dateTo);

  // Compute actual spend per expense category
  const actuals = {};
  ft.forEach(t => {
    const c = catMap[t.cat];
    if (!c || c.t !== 'expense') return;
    actuals[t.cat] = (actuals[t.cat] || 0) + Math.abs(t.amt);
  });

  const expenseCats = cats.filter(c => c.t === 'expense');
  const totalBudget = expenseCats.reduce((s, c) => s + (budgets[c.id] || 0), 0);
  const totalActual = expenseCats.reduce((s, c) => s + (actuals[c.id] || 0), 0);

  function updateBudget(id, val) {
    setBudgets(prev => ({ ...prev, [id]: parseFloat(val) || 0 }));
  }

  return (
    <div>
      <PeriodBar />
      <div className="metrics">
        <MetricCard label="Budgeted" value={fmt(totalBudget)} valueClass="va" />
        <MetricCard label="Actual"   value={fmt(totalActual)} valueClass="vn" />
        <MetricCard label="Variance" value={fmtSigned(totalBudget - totalActual)} valueClass={totalBudget >= totalActual ? 'vp' : 'vn'} />
        <MetricCard label="Used"     value={`${totalBudget > 0 ? Math.round(totalActual / totalBudget * 100) : 0}%`} valueClass="va" />
      </div>
      <div className="card">
        <div className="ch">
          <h3>Budget vs actual</h3>
          <div className="ch-r"><button className="btn btn-a btn-sm" onClick={() => toast('Budgets saved.')}>Save</button></div>
        </div>

        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 55px', borderBottom: '0.5px solid var(--bd)' }}>
          {['Category', 'Budget', 'Actual', 'Used'].map(h => (
            <span key={h} style={{ fontSize: 10, fontWeight: 500, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 10px' }}>{h}</span>
          ))}
        </div>

        {expenseCats.map(c => {
          const b = budgets[c.id] || 0;
          const a = actuals[c.id] || 0;
          const pct = b > 0 ? Math.round(a / b * 100) : 0;
          const over = a > b;
          return (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 55px', borderBottom: '0.5px solid var(--bd)', alignItems: 'center' }}>
              <span style={{ padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="cdot" style={{ background: c.col }} />{c.l}
                </span>
                <div style={{ height: 4, background: 'var(--sand3)', borderRadius: 2, width: '90%' }}>
                  <div style={{ height: 4, borderRadius: 2, background: over ? '#A32D2D' : c.col, width: `${Math.min(pct, 100)}%` }} />
                </div>
              </span>
              <span style={{ padding: '7px 10px', textAlign: 'right' }}>
                <input
                  type="number"
                  value={b}
                  onChange={e => updateBudget(c.id, e.target.value)}
                  style={{ width: 68, padding: '3px 6px', fontSize: 12, border: '0.5px solid var(--bd2)', borderRadius: 'var(--rr)', background: '#FDFAF6', textAlign: 'right', fontFamily: 'var(--font-sans)' }}
                />
              </span>
              <span style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums' }} className={over ? 'vn' : ''}>{a > 0 ? fmt(a) : '—'}</span>
              <span style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: pct > 100 ? '#A32D2D' : pct > 80 ? '#BA7517' : '#3B6D11' }}>{b > 0 ? `${pct}%` : '—'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
