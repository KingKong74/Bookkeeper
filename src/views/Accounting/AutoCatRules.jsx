/**
 * views/Accounting/AutoCatRules.jsx
 * Auto-categorisation rules — priority-ordered keyword matching.
 */
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { createRule, updateRule, deleteRule } from '../../services/categoryService';

export function AutoCatRules() {
  const { rules, setRules, cats, org, payees, toast } = useApp();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ keyword:'', catId:'', payee:'', amtExact:'', amtMin:'', amtMax:'', direction:'' });
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  function openNew()   { setForm({ keyword:'', catId:'', payee:'', amtExact:'', amtMin:'', amtMax:'', direction:'' }); setEditing('new'); }
  function openEdit(i) { setForm({ amtExact:'', amtMin:'', amtMax:'', direction:'', ...rules[i] }); setEditing(i); }

  async function save() {
    if (!form.keyword.trim()) { toast('Keyword is required.'); return; }
    const basePayload = { keyword:form.keyword.trim().toLowerCase(), category_id:form.catId||null, payee_name:(form.payee||'').trim() };
    const extPayload  = { ...basePayload, amt_exact:form.amtExact?parseFloat(form.amtExact):null, amt_min:form.amtMin?parseFloat(form.amtMin):null, amt_max:form.amtMax?parseFloat(form.amtMax):null, direction:  form.direction || null };
    function norm(base,saved){return{...base,...saved,catId:saved.category_id||'',payee:saved.payee_name||'',keyword:saved.keyword,amtExact:saved.amt_exact!=null?String(saved.amt_exact):'',amtMin:saved.amt_min!=null?String(saved.amt_min):'',amtMax:saved.amt_max!=null?String(saved.amt_max):'',direction:saved.direction||''};}
    async function callDB(fn){try{return await fn(extPayload);}catch(err){const msg=String(err?.message||'');if(msg.includes('column')||msg.includes('400')||msg.includes('42703'))return await fn(basePayload);throw err;}}
    try{
      if(editing==='new'){const saved=await callDB(p=>createRule(org.id,{...p,sort_order:(rules||[]).length}));setRules(prev=>[...(prev||[]),norm({},saved)]);toast('Rule saved.');}
      else{const rule=rules[editing];const saved=await callDB(p=>updateRule(rule.id,p));setRules(prev=>prev.map((r,i)=>i===editing?norm(rule,saved):r));toast('Rule updated.');}
    }catch(e){toast('Could not save rule: '+e.message);return;}
    setEditing(null);
  }

  async function del(i){const rule=rules[i];if(rule.id&&typeof rule.id==='string'){try{await deleteRule(rule.id);}catch(e){toast('Delete failed: '+e.message);return;}}setRules(prev=>prev.filter((_,j)=>j!==i));toast('Rule deleted.');}
  function onDragStart(e,i){setDragIdx(i);e.dataTransfer.effectAllowed='move';e.currentTarget.style.opacity='0.5';}
  function onDragEnd(e){e.currentTarget.style.opacity='';setDragOver(null);}
  function onDragOver(e,i){e.preventDefault();setDragOver(i);}
  function onDrop(e,i){e.preventDefault();setDragOver(null);if(dragIdx===null||dragIdx===i)return;setRules(prev=>{const arr=[...prev];const[moved]=arr.splice(dragIdx,1);arr.splice(i,0,moved);return arr;});setDragIdx(null);}

  return (
    <div>
      <div className="card">
        <div className="ch"><h3>Auto-categorisation rules</h3><p>{rules.length} rules · drag to reorder</p><div className="ch-r"><button className="btn btn-a btn-sm" onClick={openNew}>+ New rule</button></div></div>
        <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 130px 130px 80px', gap:8, padding:'6px 12px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)' }}>
          {['','Keyword','Category','Payee',''].map((h,i)=><span key={i} style={{ fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</span>)}
        </div>
        {rules.map((r,i)=>{const cat=cats.find(x=>x.id===r.catId);const isOver=dragOver===i;return(
          <div key={r.id||i} draggable onDragStart={e=>onDragStart(e,i)} onDragEnd={onDragEnd} onDragOver={e=>onDragOver(e,i)} onDrop={e=>onDrop(e,i)} style={{ display:'grid', gridTemplateColumns:'28px 1fr 130px 130px 80px', gap:8, alignItems:'center', padding:'7px 12px', borderBottom:isOver?'2px solid var(--a)':'0.5px solid var(--bd)', background:isOver?'var(--al)':'transparent', cursor:'grab' }}>
            <span style={{ fontSize:12, color:'var(--stone)', opacity:0.5, userSelect:'none', textAlign:'center' }}>⠿</span>
            <span style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
              <span style={{ fontSize:9, padding:'1px 4px', borderRadius:3, background:'var(--sand3)', color:'var(--stone)', fontWeight:600, flexShrink:0 }}>#{i+1}</span>
              <span style={{ fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>"{r.keyword}"</span>
              {r.amtExact&&<span style={{ fontSize:10, padding:'1px 6px', borderRadius:99, background:'var(--sand2)', color:'var(--stone)', flexShrink:0 }}>=\${r.amtExact}</span>}
              {!r.amtExact&&r.amtMin&&<span style={{ fontSize:10, padding:'1px 6px', borderRadius:99, background:'var(--sand2)', color:'var(--stone)', flexShrink:0 }}>&gt;\${r.amtMin}</span>}
              {!r.amtExact&&r.amtMax&&<span style={{ fontSize:10, padding:'1px 6px', borderRadius:99, background:'var(--sand2)', color:'var(--stone)', flexShrink:0 }}>&lt;\${r.amtMax}</span>}
              {r.direction==='in'&&<span style={{ fontSize:10, padding:'1px 5px', borderRadius:99, background:'var(--gnb)', color:'var(--gn)', flexShrink:0 }}>in</span>}
              {r.direction==='out'&&<span style={{ fontSize:10, padding:'1px 5px', borderRadius:99, background:'var(--rdb)', color:'var(--rd)', flexShrink:0 }}>out</span>}
            </span>
            <span>{cat?<span className="cpill" style={{ background:`${cat.col}18`, color:cat.col, borderColor:`${cat.col}44`, fontSize:11 }}><span className="cdot" style={{ background:cat.col }}/>{cat.l}</span>:<span style={{ color:'var(--stone)', fontSize:12 }}>—</span>}</span>
            <span style={{ color:'var(--stone2)', fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.payee||'—'}</span>
            <span style={{ display:'flex', gap:5 }}><button className="btn btn-sm btn-ghost" onClick={()=>openEdit(i)}>Edit</button><button className="btn btn-sm btn-reject" onClick={()=>del(i)}>×</button></span>
          </div>
        );})}
        {rules.length===0&&<div style={{ padding:'20px 14px', fontSize:12, color:'var(--stone)' }}>No rules yet. Add one to start auto-categorising.</div>}
      </div>
      <div style={{ padding:'10px 14px', fontSize:12, color:'var(--stone)', background:'var(--bg-card)', border:'0.5px solid var(--bd)', borderRadius:'var(--rr)', marginTop:8 }}>Rules run in order — #1 wins. Keywords match anywhere in the description (case-insensitive). Drag rows to change priority.</div>

      {editing!==null&&(<div className="modal-bg" onClick={()=>setEditing(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>{editing==='new'?'New rule':'Edit rule'}</h3><button className="btn-ghost" style={{ padding:0, fontSize:16 }} onClick={()=>setEditing(null)}>×</button></div>
        <div className="modal-body">
          <div className="field"><label>Keyword <span style={{ color:'var(--stone)', fontWeight:400 }}>(matched anywhere in description)</span></label><input value={form.keyword} onChange={e=>setForm(f=>({...f,keyword:e.target.value}))} placeholder="e.g. PAYMENT TO GOODLIFE"/><p style={{ fontSize:11, color:'var(--stone)', marginTop:4 }}>Tip: use the full meaningful phrase, e.g. "PAYMENT TO GOODLIFE" not just "PAYMENT"</p></div>
          <div className="field"><label>Assign category</label><select value={form.catId} onChange={e=>setForm(f=>({...f,catId:e.target.value}))}><option value="">— none —</option>{cats.map(cat=><option key={cat.id} value={cat.id}>{cat.l}</option>)}</select></div>
          <div className="field"><label>Assign payee</label><input list="rule-payee-list" value={form.payee} onChange={e=>setForm(f=>({...f,payee:e.target.value}))} placeholder="e.g. Goodlife Fitness"/><datalist id="rule-payee-list">{payees.map(p=><option key={p.id} value={p.name}/>)}</datalist></div>
          <div style={{ borderTop:'0.5px solid var(--bd)', paddingTop:12, marginTop:4 }}>
            <div style={{ fontSize:11, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Amount conditions <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(optional)</span></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              {[['amtExact','Exact amount ($)',true],['amtMin','Min amount ($)',false],['amtMax','Max amount ($)',false]].map(([field,label,isExact])=>(
                <div key={field} className="field" style={{ marginBottom:0 }}><label>{label}</label><div style={{ position:'relative' }}><span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--stone)', fontSize:12 }}>$</span><input type="number" min="0" step="0.01" value={form[field]} style={{ paddingLeft:20 }} onChange={e=>setForm(f=>isExact?{...f,[field]:e.target.value,amtMin:'',amtMax:''}:{...f,[field]:e.target.value,amtExact:''})} placeholder={isExact?'17.49':field==='amtMin'?'100':'500'} disabled={!isExact&&!!form.amtExact}/></div></div>
              ))}
            </div>
            <div className="field" style={{ marginTop:10, marginBottom:0 }}><label>Direction</label><div style={{ display:'flex', gap:8, marginTop:4 }}>{[['','Any'],['in','Credits only (money in)'],['out','Debits only (money out)']].map(([v,l])=><label key={v} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12.5, cursor:'pointer', fontWeight:400 }}><input type="radio" name="rule-direction" value={v} checked={form.direction===v} onChange={()=>setForm(f=>({...f,direction:v}))} style={{ cursor:'pointer' }}/>{l}</label>)}</div></div>
          </div>
        </div>
        <div className="modal-foot"><button className="btn" onClick={()=>setEditing(null)}>Cancel</button><button className="btn btn-a" onClick={save}>Save rule</button></div>
      </div></div>)}
    </div>
  );
}
