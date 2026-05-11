/**
 * views/Reports/DrillPanel.jsx
 * Slide-out / pop-out transaction drill panel with inline re-categorisation.
 */
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { updateTransaction } from '../../lib/supabase';
import { postCategoryJournal } from '../../services/journalService';
import { filterByDateRange, fmt, dateRangeLabel } from '../../utils/helpers';

export function DrillPanel({ cat, txns, dateFrom, dateTo, onClose, subCatIds=[] }) {
  if (!cat) return null;
  const{catMap,org,accounts}=useApp();
  const [editTxnId, setEditTxnId] = useState(null);
  const [txnsLocal, setTxnsLocal] = useState(null);
  const [popout, setPopout] = useState(false);
  const allIds=new Set([cat.id,...subCatIds].filter(Boolean));
  const baseTxns=txnsLocal?txns.map(t=>{const ov=txnsLocal.find(x=>x.id===t.id);return ov||t;}):txns;
  const catTxns=filterByDateRange(baseTxns,dateFrom,dateTo).filter(t=>cat._isBankDrill ? t.account_id === cat.id : allIds.has(t.cat)).sort((a,b)=>b.date.localeCompare(a.date));
  const total=catTxns.reduce((s,t)=>s+t.amt,0);

  const header=(<div style={{ padding:'14px 18px', borderBottom:'0.5px solid var(--bd)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
    <span style={{ width:10, height:10, borderRadius:'50%', background:cat.col, flexShrink:0, display:'inline-block' }}/>
    <div style={{ flex:1 }}><div style={{ fontWeight:500, fontSize:14 }}>{cat.l}{subCatIds.length>0&&<span style={{ fontSize:11, fontWeight:400, color:'var(--stone)', marginLeft:8 }}>incl. {subCatIds.length} sub-account{subCatIds.length>1?'s':''}</span>}</div><div style={{ fontSize:11, color:'var(--stone)', marginTop:1 }}>{cat.ac} · {cat.t} · {dateRangeLabel(dateFrom,dateTo)}</div></div>
    <button onClick={()=>setPopout(v=>!v)} title={popout?'Dock to side':'Pop out to centre'} style={{ background:'none', border:'0.5px solid var(--bd2)', borderRadius:4, cursor:'pointer', fontSize:12, color:'var(--stone)', padding:'2px 8px', marginRight:4 }}>{popout?'⤡':'⤢'}</button>
    <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--stone)', lineHeight:1, padding:0 }}>×</button>
  </div>);

  const stats=(<div style={{ padding:'10px 18px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)', display:'flex', gap:20, flexShrink:0 }}>
    {[{label:'Transactions',val:catTxns.length},{label:'Total',val:(total>=0?'+':'')+fmt(total),cls:total>=0?'vp':'vn'},{label:'Average',val:catTxns.length>0?fmt(Math.abs(total/catTxns.length)):'—'}].map(m=><div key={m.label}><div style={{ fontSize:10, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:500 }}>{m.label}</div><div style={{ fontSize:16, fontWeight:500 }} className={m.cls||''}>{m.val}</div></div>)}
  </div>);

  const body=(<div style={{ flex:1, overflowY:'auto' }}>
    {catTxns.length===0?<div style={{ padding:24, textAlign:'center', color:'var(--stone)', fontSize:12 }}>No transactions in current date range.</div>:(
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr style={{ background:'var(--sand)', position:'sticky', top:0 }}>
          {['Date','Description','Amount'].map((h,i)=><th key={h} style={{ padding:'7px 18px', fontSize:11, fontWeight:500, color:'var(--stone)', textAlign:i===2?'right':'left', textTransform:'uppercase', letterSpacing:'0.04em' }}>{h}</th>)}
        </tr></thead>
        <tbody>{catTxns.map(t=>{const isEditing=editTxnId===t.id;return(
          <tr key={t.id} style={{ borderBottom:'0.5px solid var(--bd)', background:isEditing?'var(--al)':undefined, cursor:'pointer' }} onClick={()=>setEditTxnId(isEditing?null:t.id)}>
            <td style={{ padding:'8px 18px', fontSize:12, color:'var(--stone)', whiteSpace:'nowrap' }}>{t.date}</td>
            <td style={{ padding:'8px 10px', fontSize:12 }}>
              <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:popout?400:200 }}>{t.desc}</div>
              {t.payee&&<div style={{ fontSize:11, color:'var(--stone)' }}>{t.payee}</div>}
              {isEditing&&(<div style={{ marginTop:6, display:'flex', gap:6 }} onClick={e=>e.stopPropagation()}>
                <select defaultValue={t.cat||''} onChange={async e=>{const catId=e.target.value||null;setTxnsLocal(prev=>(prev||txns).map(x=>x.id===t.id?{...x,cat:catId,category_id:catId}:x));setEditTxnId(null);await updateTransaction(t.id,{category_id:catId});const acct=t.account_id?(accounts||[]).find(a=>a.id===t.account_id):null;const newCat=catId?catMap[catId]:null;postCategoryJournal(org?.id,t,newCat,acct).catch(()=>{});}} style={{ fontSize:11,padding:'3px 6px',border:'0.5px solid var(--bd2)',borderRadius:'var(--rr)',background:'var(--sand)',maxWidth:200 }}>
                  <option value="">— unassign —</option>
                  {Object.values(catMap).filter(c=>c.is_active!==false).sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999)).map(c=><option key={c.id} value={c.id}>{c.code?c.code+' ':''}{c.l}</option>)}
                </select>
                <button onClick={()=>setEditTxnId(null)} style={{ fontSize:11,padding:'3px 8px',border:'0.5px solid var(--bd2)',borderRadius:'var(--rr)',background:'var(--sand)',cursor:'pointer' }}>Cancel</button>
              </div>)}
            </td>
            <td style={{ padding:'8px 18px', fontSize:12, textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:500 }} className={t.amt>=0?'vp':'vn'}>{t.amt>=0?'+':''}{fmt(t.amt)}</td>
          </tr>
        );})}</tbody>
      </table>
    )}
  </div>);

  if(popout)return(<div style={{ position:'fixed', inset:0, background:'rgba(42,36,32,0.45)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={()=>setPopout(false)}><div style={{ background:'var(--sand)', borderRadius:12, boxShadow:'0 12px 40px rgba(42,36,32,0.25)', width:'min(90vw,800px)', maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden' }} onClick={e=>e.stopPropagation()}>{header}{stats}{body}</div></div>);
  return(<div style={{ position:'fixed', top:0, right:0, bottom:0, width:480, background:'var(--sand)', boxShadow:'-4px 0 24px rgba(42,36,32,0.15)', zIndex:800, display:'flex', flexDirection:'column', borderLeft:'0.5px solid var(--bd2)' }}>{header}{stats}{body}</div>);
}
