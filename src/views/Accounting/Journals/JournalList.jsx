/**
 * views/Accounting/Journals/JournalList.jsx
 * Journal entries list with expandable DR/CR lines.
 */
import React, { useState } from 'react';
import { fmt } from '../../../utils/helpers';

export function JournalList({ journals, onEdit, onVoid, catMap }) {
  const [expanded, setExpanded] = useState(new Set());
  const toggle = id=>setExpanded(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  if (journals.length===0) return <div style={{ padding:'20px 14px', fontSize:12, color:'var(--stone)' }}>No entries posted yet.</div>;
  return journals.map(j=>{
    const rawLines=j.journal_lines||j.lines||[], isAutoLedger=j.source==='auto_category', isVoid=j.status==='void', isExpanded=expanded.has(j.id);
    const nonRevLines=rawLines.filter(l=>!l.is_reversal);
    const totalDR=nonRevLines.reduce((s,l)=>s+(parseFloat(l.debit||l.dr)||0),0);
    const totalCR=nonRevLines.reduce((s,l)=>s+(parseFloat(l.credit||l.cr)||0),0);
    return (
      <div key={j.id} style={{ borderBottom:'0.5px solid var(--bd)', opacity:isVoid?0.5:1 }}>
        <div style={{ padding:'11px 16px', display:'flex', alignItems:'center', gap:10, cursor:'pointer' }} onClick={()=>toggle(j.id)}>
          <span style={{ fontSize:13, color:'var(--stone)', flexShrink:0 }}>{isExpanded?'▾':'▸'}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontWeight:500, fontSize:12.5 }}>{j.description||j.desc}</span>
              {j.ref&&<span style={{ fontSize:10, color:'var(--stone)', background:'var(--sand2)', padding:'1px 7px', borderRadius:99 }}>{j.ref}</span>}
              {isAutoLedger&&<span style={{ fontSize:10, background:'var(--al)', color:'var(--a2)', padding:'1px 7px', borderRadius:99, fontWeight:500 }}>Auto</span>}
              {isVoid&&<span style={{ fontSize:10, background:'var(--rdb)', color:'var(--rd)', padding:'1px 7px', borderRadius:99, fontWeight:500 }}>VOID</span>}
            </div>
            <div style={{ fontSize:11, color:'var(--stone)', marginTop:1 }}>{j.date}{isAutoLedger&&(()=>{const oc=rawLines.filter(l=>!l.is_reversal).length,rc=rawLines.filter(l=>!!l.is_reversal).length;return ` · ${oc} entries${rc>0?` · ${rc} reversal${rc>1?'s':''}`:''}`;})()} {j.void_reason&&` · ${j.void_reason}`}</div>
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}><div style={{ fontSize:11.5, fontVariantNumeric:'tabular-nums', fontWeight:500 }}>{fmt(totalDR)}</div><div style={{ fontSize:10, color:'var(--stone)' }}>DR / CR</div></div>
          {!isVoid&&(<div style={{ display:'flex', gap:4, flexShrink:0 }} onClick={e=>e.stopPropagation()}>
            {!isAutoLedger&&<button className="btn btn-sm" style={{ fontSize:10 }} onClick={()=>onEdit(j)}>Edit</button>}
            {!isAutoLedger&&<button className="btn btn-sm" style={{ fontSize:10, color:'var(--rd)' }} onClick={()=>onVoid(j)}>Void</button>}
          </div>)}
        </div>
        {isExpanded&&(<div style={{ margin:'0 16px 12px', border:'0.5px solid var(--bd)', borderRadius:'var(--rr)', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', background:'var(--sand)' }}>
            {['Account','Debit','Credit'].map((h,i)=><div key={i} style={{ padding:'4px 10px', fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:i>0?'right':'left' }}>{h}</div>)}
          </div>
          {(()=>{
            const accMap={};
            rawLines.forEach(l=>{const isRev=!!l.is_reversal,cat=l.category_id&&catMap?catMap[l.category_id]:null,key=l.category_id?`cat:${l.category_id}`:l.bank_account_id?`bank:${l.bank_account_id}`:`name:${l.account_name||'—'}`,name=cat?(cat.code?`${cat.code} · ${cat.l}`:cat.l):(l.account_name||'—');if(!accMap[key])accMap[key]={name,code:cat?.code||null,origDR:0,origCR:0,revDR:0,revCR:0};if(isRev){accMap[key].revDR+=parseFloat(l.debit||l.dr)||0;accMap[key].revCR+=parseFloat(l.credit||l.cr)||0;}else{accMap[key].origDR+=parseFloat(l.debit||l.dr)||0;accMap[key].origCR+=parseFloat(l.credit||l.cr)||0;}});
            const rows=[];
            Object.values(accMap).sort((a,b)=>(parseInt((a.code||'').replace(/\/.*$/,''))||9999)-(parseInt((b.code||'').replace(/\/.*$/,''))||9999)).forEach((r,ai)=>{
              const bg=ai%2===0?'var(--sand)':'var(--sand2)';
              const row=(key,label,indent,dr,cr,isRev)=><div key={key} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', borderTop:'0.5px solid var(--bd)', background:isRev?'rgba(163,45,45,0.06)':bg, alignItems:'center' }}><div style={{ padding:`5px 10px${indent?' 5px 28px':''}`, fontSize:12.5, color:isRev?'var(--rd)':'var(--ink)', display:'flex', alignItems:'center', gap:6 }}>{isRev&&<span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, background:'var(--rd)', color:'#fff', fontWeight:700, flexShrink:0 }}>REV</span>}{label}</div><div style={{ padding:'5px 10px', fontSize:12.5, textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:dr>0.005?500:400, color:isRev?'var(--rd)':dr>0.005?'var(--ink)':'var(--stone)' }}>{dr>0.005?fmt(dr):'—'}</div><div style={{ padding:'5px 10px', fontSize:12.5, textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:cr>0.005?500:400, color:isRev?'var(--rd)':cr>0.005?'var(--ink)':'var(--stone)' }}>{cr>0.005?fmt(cr):'—'}</div></div>;
              if(r.origDR>0.005) rows.push(row(`${ai}od`,r.name,false,r.origDR,0,false));
              if(r.origCR>0.005) rows.push(row(`${ai}oc`,r.name,true,0,r.origCR,false));
              if(r.revDR>0.005)  rows.push(row(`${ai}rd`,r.name,false,r.revDR,0,true));
              if(r.revCR>0.005)  rows.push(row(`${ai}rc`,r.name,true,0,r.revCR,true));
            });
            return rows;
          })()}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', borderTop:'0.5px solid var(--bd2)', background:'var(--sand)' }}>
            <div style={{ padding:'5px 10px', fontSize:12, fontWeight:500 }}>Total</div>
            <div style={{ padding:'5px 10px', fontSize:12, fontWeight:500, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(totalDR)}</div>
            <div style={{ padding:'5px 10px', fontSize:12, fontWeight:500, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(totalCR)}</div>
          </div>
        </div>)}
      </div>
    );
  });
}
