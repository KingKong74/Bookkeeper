/**
 * views/Accounting/Journals/GeneralLedger.jsx
 * GL view — consolidated account balances, expandable to individual lines.
 */
import React, { useState, useMemo } from 'react';
import { fmt } from '../../../utils/helpers';
import { consolidateLines } from './journalHelpers';

export function GeneralLedger({ journals, catMap, txns, accounts }) {
  const accountMap = useMemo(() => Object.fromEntries((accounts||[]).map(a=>[a.id,a])), [accounts]);
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState(new Set());
  function toggleAccount(key) { setExpanded(p=>{const n=new Set(p);n.has(key)?n.delete(key):n.add(key);return n;}); }

  const allLines = useMemo(()=>journals.filter(j=>j.status!=='void'&&(j.source==='auto_category'||j.source==='manual')).flatMap(j=>j.journal_lines||j.lines||[]),[journals]);
  const linesByAccount = useMemo(()=>{ const map={}; for(const l of allLines){const key=l.category_id?`cat:${l.category_id}`:l.bank_account_id?`bank:${l.bank_account_id}`:`name:${l.account_name||'—'}`;if(!map[key])map[key]=[];map[key].push(l);}return map;},[allLines]);
  const txnById = useMemo(()=>Object.fromEntries((txns||[]).map(t=>[t.id,t])),[txns]);
  const consolidated = useMemo(()=>consolidateLines(allLines,catMap,accountMap),[allLines,catMap,accountMap]);
  const filtered = (search.trim()?consolidated.filter(r=>r.account_name.toLowerCase().includes(search.toLowerCase())||(r.code||'').includes(search)):consolidated).filter(r=>!r.synthetic);
  const totalDR=filtered.reduce((s,r)=>s+r.debit,0), totalCR=filtered.reduce((s,r)=>s+r.credit,0);
  const balanced=Math.abs(totalDR-totalCR)<0.01;

  if (allLines.length===0) return (<div style={{ padding:24, textAlign:'center', color:'var(--stone)', fontSize:12 }}><div style={{ fontSize:28, marginBottom:8 }}>📒</div><p style={{ fontWeight:500, marginBottom:4 }}>General ledger is empty</p><p>Assign categories to transactions to populate the ledger.</p></div>);

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'0.5px solid var(--bd)', background:'var(--sand)' }}>
        <input placeholder="Search accounts…" value={search} onChange={e=>setSearch(e.target.value)} style={{ padding:'5px 10px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--sand)', fontFamily:'var(--font-sans)', width:220 }}/>
        <span style={{ fontSize:11, padding:'3px 10px', borderRadius:99, fontWeight:600, background:balanced?'var(--gnb)':'var(--rdb)', color:balanced?'var(--gn)':'var(--rd)' }}>{balanced?'✓ Balanced':`⚠ Off by ${fmt(Math.abs(totalDR-totalCR))}`}</span>
        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--stone)' }}>{filtered.length} accounts · {allLines.length} entries</span>
      </div>
      {filtered.map((r,idx)=>{
        const net=r.credit-r.debit, isExpand=expanded.has(r.key||r.account_name), acctLines=linesByAccount[r.key||r.account_name]||[], txnLines=acctLines.filter(l=>l.transaction_id), noTxnLines=acctLines.filter(l=>!l.transaction_id), canExpand=acctLines.length>0;
        return (
          <React.Fragment key={r.account_name}>
            <div onClick={()=>canExpand&&toggleAccount(r.key||r.account_name)} style={{ display:'grid', gridTemplateColumns:'28px 1fr 110px 110px 100px', padding:'7px 14px', borderBottom:r.synthetic?'0.5px dashed var(--bd2)':'0.5px solid var(--bd)', background:idx%2===0?'var(--sand)':'var(--sand2)', cursor:canExpand&&!r.synthetic?'pointer':'default', alignItems:'center', opacity:r.synthetic?0.7:1 }}>
              <span style={{ fontSize:11, color:'var(--stone)' }}>{canExpand?(isExpand?'▾':'▸'):''}</span>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                {r.code&&<span style={{ fontFamily:'monospace', fontSize:11, color:'var(--stone)', flexShrink:0 }}>{r.code}</span>}
                <span style={{ fontWeight:r.synthetic?600:500, fontSize:12.5 }}>{r.account_name}{r.synthetic&&<span style={{ fontSize:9, marginLeft:6, padding:'1px 5px', borderRadius:99, background:'var(--sand3)', color:'var(--stone)', fontWeight:500 }}>total</span>}</span>
              </span>
              <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12 }}>{r.debit>0.005?fmt(r.debit):<span style={{ color:'var(--sand4)' }}>—</span>}</span>
              <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12 }}>{r.credit>0.005?fmt(r.credit):<span style={{ color:'var(--sand4)' }}>—</span>}</span>
              <span className={net>0?'vp':net<0?'vn':''} style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12, fontWeight:500 }}>{net>0.005?'+'+fmt(net):net<-0.005?'-'+fmt(Math.abs(net)):'—'}</span>
            </div>
            {isExpand&&(<div style={{ background:'var(--sand2)', borderBottom:'0.5px solid var(--bd)' }}>
              <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 110px 110px 100px', padding:'4px 14px', borderBottom:'0.5px solid var(--bd)', background:'var(--sand3)' }}>
                <span/>{['Transaction','DR','CR','Date'].map((h,i)=><span key={h} style={{ fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:i>0?'right':'left' }}>{h}</span>)}
              </div>
              {(()=>{const grouped={};txnLines.forEach(l=>{if(!grouped[l.transaction_id])grouped[l.transaction_id]={orig:[],rev:[]};if(l.is_reversal)grouped[l.transaction_id].rev.push(l);else grouped[l.transaction_id].orig.push(l);});const ordered=[];Object.values(grouped).forEach(g=>{g.orig.forEach(l=>ordered.push({l,isRev:false}));g.rev.forEach(l=>ordered.push({l,isRev:true}));});return ordered.map(({l,isRev},li)=>{const txn=txnById[l.transaction_id];return(<div key={li} style={{ display:'grid', gridTemplateColumns:'28px 1fr 110px 110px 100px', padding:'5px 14px', borderBottom:'0.5px solid var(--bd)', background:isRev?'rgba(163,45,45,0.06)':li%2===0?'var(--sand)':'var(--sand2)' }}><span/><span style={{ fontSize:11.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:isRev?'var(--rd)':undefined, display:'flex', alignItems:'center', gap:6 }}>{isRev&&<span style={{ fontSize:9, padding:'1px 5px', borderRadius:99, background:'var(--rdb)', color:'var(--rd)', fontWeight:600, flexShrink:0 }}>REV</span>}{txn?.desc||l.account_name}{!isRev&&txn?.payee&&<span style={{ color:'var(--stone)', marginLeft:6, fontSize:10 }}>{txn.payee}</span>}</span><span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:11.5, color:isRev?'var(--rd)':undefined }}>{parseFloat(l.debit)>0.005?fmt(parseFloat(l.debit)):'—'}</span><span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:11.5, color:isRev?'var(--rd)':undefined }}>{parseFloat(l.credit)>0.005?fmt(parseFloat(l.credit)):'—'}</span><span style={{ textAlign:'right', fontSize:11, color:isRev?'var(--rd)':'var(--stone)' }}>{txn?.date||'—'}</span></div>);});})()}
              {noTxnLines.length>0&&<div style={{ padding:'4px 14px 4px 42px', fontSize:11, color:'var(--stone)', fontStyle:'italic' }}>+{noTxnLines.length} manual journal line{noTxnLines.length!==1?'s':''}</div>}
            </div>)}
          </React.Fragment>
        );
      })}
      <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 110px 110px 100px', padding:'8px 14px', borderTop:'1.5px solid var(--ink)', background:'var(--sand)', fontWeight:600 }}>
        <span/><span style={{ color:balanced?'var(--ink)':'var(--rd)' }}>Total</span><span/><span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:balanced?'var(--ink)':'var(--rd)' }}>{fmt(totalDR)}</span><span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:balanced?'var(--ink)':'var(--rd)' }}>{fmt(totalCR)}</span>
      </div>
    </div>
  );
}
