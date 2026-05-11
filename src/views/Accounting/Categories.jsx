/**
 * views/Accounting/Categories.jsx
 * Simple category management — label, type, group, colour.
 */
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export function Categories() {
  const { cats, setCats, txns, setTxns, PALETTE, toast } = useApp();
  const [editing, setEditing] = useState(null);
  const [form,    setForm]    = useState({ l:'', t:'expense', ac:'', col:'' });
  function openNew()  { setForm({ l:'', t:'expense', ac:'', col:PALETTE[0] }); setEditing('new'); }
  function openEdit(cat) { setForm({ l:cat.l, t:cat.t, ac:cat.ac, col:cat.col }); setEditing(cat.id); }
  function save() {
    if (!form.l.trim()||!form.ac.trim()) { alert('Fill in name and account group.'); return; }
    if (editing==='new') { setCats(prev=>[...prev,{id:`cat_${Date.now()}`,...form}]); toast('Category created.'); }
    else { setCats(prev=>prev.map(c=>c.id===editing?{...c,...form}:c)); toast('Category updated.'); }
    setEditing(null);
  }
  function del(id) {
    if (txns.some(t=>(t.cat===id||t.category_id===id))&&!confirm('Category is in use. Delete anyway?')) return;
    setCats(prev=>prev.filter(c=>c.id!==id)); setTxns(prev=>prev.map(t=>t.cat===id?{...t,cat:null}:t)); toast('Category deleted.');
  }
  const TYPE_CLASS={income:'coa-income',expense:'coa-expense',asset:'coa-asset',liability:'coa-liability',equity:'coa-equity'};
  return (
    <div>
      <div className="card"><div className="ch"><h3>Categories</h3><p>{cats.length} total</p><div className="ch-r"><button className="btn btn-a btn-sm" onClick={openNew}>+ New category</button></div></div>
        <table><thead><tr><th style={{ width:36 }}/><th>Name</th><th>Type</th><th>Account group</th><th style={{ width:90 }}/></tr></thead>
        <tbody>{cats.map(c=>(<tr key={c.id}><td><span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:c.col }}/></td><td style={{ fontWeight:500 }}>{c.l}</td><td><span className={`coa-type ${TYPE_CLASS[c.t]||''}`}>{c.t}</span></td><td style={{ color:'var(--stone)' }}>{c.ac}</td><td><button className="btn btn-sm btn-ghost" style={{ marginRight:4 }} onClick={()=>openEdit(c)}>Edit</button><button className="btn btn-sm btn-reject" onClick={()=>del(c.id)}>×</button></td></tr>))}</tbody>
        </table>
      </div>
      {editing!==null&&(<div className="modal-bg" onClick={()=>setEditing(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>{editing==='new'?'New category':'Edit category'}</h3><button className="btn-ghost" style={{ padding:0, fontSize:16 }} onClick={()=>setEditing(null)}>×</button></div>
        <div className="modal-body">
          <div className="field"><label>Name</label><input value={form.l} onChange={e=>setForm(f=>({...f,l:e.target.value}))} placeholder="e.g. Groceries"/></div>
          <div className="field"><label>Type</label><select value={form.t} onChange={e=>setForm(f=>({...f,t:e.target.value}))}>{['income','expense','asset','liability','equity'].map(t=><option key={t} value={t}>{t[0].toUpperCase()+t.slice(1)}</option>)}</select></div>
          <div className="field"><label>Account group</label><input value={form.ac} onChange={e=>setForm(f=>({...f,ac:e.target.value}))} placeholder="e.g. Living expenses"/></div>
          <div className="field"><label>Colour</label><div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'4px 0' }}>{PALETTE.map(col=>(<span key={col} onClick={()=>setForm(f=>({...f,col}))} style={{ width:26, height:26, borderRadius:'50%', background:col, cursor:'pointer', border:form.col===col?'2px solid var(--ink)':'2px solid transparent' }}/>))}</div></div>
        </div>
        <div className="modal-foot"><button className="btn" onClick={()=>setEditing(null)}>Cancel</button><button className="btn btn-a" onClick={save}>Save</button></div>
      </div></div>)}
    </div>
  );
}
