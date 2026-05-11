/**
 * views/Accounting/ChartOfAccounts/COATable.jsx
 * Renders bank accounts section and typed account rows.
 */
import React from 'react';
import { fmt } from '../../../utils/helpers';
import { TYPE_LABELS, TYPE_COLOURS } from './coaData';

export function BankAccountsSection({ accounts, txns, bankBalances, search }) {
  const visible = (accounts||[]).filter(a=>a.is_active!==false&&(!search||(a.name||'').toLowerCase().includes(search.toLowerCase())));
  if (!visible.length) return null;
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, padding:'6px 12px', background:'#185FA518', borderLeft:'3px solid #185FA5', borderRadius:'0 var(--rr) var(--rr) 0' }}>
        <span style={{ fontSize:11, fontWeight:600, color:'#185FA5', textTransform:'uppercase', letterSpacing:'0.07em', flex:1 }}>Bank Accounts</span>
        <span style={{ fontSize:10, color:'#185FA5', fontStyle:'italic' }}>read-only · managed in Banking</span>
      </div>
      <div className="card" style={{ overflow:'hidden' }}>
        <table style={{ tableLayout:'fixed', width:'100%' }}>
          <colgroup><col style={{ width:56 }}/><col/><col style={{ width:100 }}/><col style={{ width:100 }}/><col style={{ width:110 }}/><col style={{ width:80 }}/></colgroup>
          <thead><tr><th style={{ color:'var(--stone)', fontSize:10 }}>Type</th><th>Account</th><th>Currency</th><th className="tr">Txns</th><th className="tr">Balance</th><th/></tr></thead>
          <tbody>
            {visible.map(a=>{
              const bal=bankBalances[a.id]||0, txnCnt=(txns||[]).filter(t=>t.account_id===a.id).length;
              const typeAbbr={checking:'CHK',savings:'SAV',credit_card:'CC',loan:'LN',investment:'INV'};
              return (<tr key={a.id} style={{ opacity:txnCnt===0?0.5:1 }}>
                <td style={{ fontFamily:'monospace', fontSize:10, color:'var(--stone)', fontWeight:600 }}>{typeAbbr[a.type]||a.type}</td>
                <td><span style={{ display:'flex', alignItems:'center', gap:6 }}><span style={{ width:9, height:9, borderRadius:'50%', background:a.colour||'#185FA5', flexShrink:0, display:'inline-block' }}/><span style={{ fontWeight:txnCnt>0?500:400 }}>{a.name}</span></span></td>
                <td style={{ color:'var(--stone)', fontSize:11.5 }}>{a.currency||'AUD'}</td>
                <td className="tr" style={{ color:'var(--stone)', fontSize:12 }}>{txnCnt>0?txnCnt:<span style={{ color:'var(--sand4)' }}>—</span>}</td>
                <td className={`tr ${bal>0?'vp':bal<0?'vn':''}`} style={{ fontSize:12, fontVariantNumeric:'tabular-nums' }}>{fmt(bal)}</td>
                <td><span style={{ fontSize:10, color:'var(--sand4)', padding:'2px 7px' }}>—</span></td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function COATypeSection({ type, cats, txns, catBalances, showInactive, showZero, search, collapsed, onToggleCollapse, onDrill, onEdit, onRequestDeactivate, onReactivate, onHardDelete, onCatDragStart, onCatDragEnd, onCatDrop }) {
  const allInType = (cats||[]).filter(c=>{
    if (c.t!==type) return false;
    if (!showInactive&&c.is_active===false) return false;
    if (search&&!(c.l||'').toLowerCase().includes(search.toLowerCase())&&!(c.ac||'').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const childrenOf = id=>allInType.filter(c=>c.parent_id===id).sort((a,b)=>(a.code||'').localeCompare(b.code||'',undefined,{numeric:true}));
  const parents = allInType.filter(c=>!c.parent_id).sort((a,b)=>{
    if(a.code&&b.code) return a.code.localeCompare(b.code,undefined,{numeric:true});
    if(a.code) return -1; if(b.code) return 1;
    return (a.sort_order||0)-(b.sort_order||0);
  });
  const parentRows = showZero?parents:parents.filter(p=>{ const ch=childrenOf(p.id); const tot=ch.length>0?ch.reduce((s,x)=>s+(catBalances[x.id]||0),0):catBalances[p.id]||0; return tot!==0||ch.length>0; });
  if (!parentRows.length) return null;
  const typeTotal = allInType.reduce((s,c)=>s+(catBalances[c.id]||0),0);
  const colour = TYPE_COLOURS[type];

  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, padding:'6px 12px', background:`${colour}18`, borderLeft:`3px solid ${colour}`, borderRadius:'0 var(--rr) var(--rr) 0' }}>
        <span style={{ fontSize:11, fontWeight:600, color:colour, textTransform:'uppercase', letterSpacing:'0.07em', flex:1 }}>{TYPE_LABELS[type]}</span>
        <span style={{ fontSize:11, fontVariantNumeric:'tabular-nums', color:colour }}>{fmt(typeTotal)}</span>
      </div>
      <div className="card" style={{ overflow:'hidden' }}>
        <table style={{ tableLayout:'fixed', width:'100%' }}>
          <colgroup><col style={{ width:64 }}/><col/><col style={{ width:150 }}/><col style={{ width:100 }}/><col style={{ width:110 }}/><col style={{ width:80 }}/></colgroup>
          <thead><tr><th style={{ color:'var(--stone)', fontFamily:'monospace' }}>Code</th><th>Account</th><th>Group</th><th className="tr">Txns</th><th className="tr">Balance</th><th/></tr></thead>
          <tbody>
            {parentRows.map(cat=>{
              const children=childrenOf(cat.id), hasChildren=children.length>0, isCollapsed=collapsed.has(cat.id);
              const activeChildren=children.filter(ch=>ch.is_active!==false);
              const childSum=activeChildren.reduce((s,ch)=>s+(catBalances[ch.id]||0),0);
              const bal=hasChildren?childSum:(catBalances[cat.id]||0);
              const txnCnt=hasChildren?activeChildren.reduce((s,ch)=>s+(txns||[]).filter(t=>t.cat===ch.id).length,0):(txns||[]).filter(t=>t.cat===cat.id).length;
              const canDeactivate=activeChildren.length===0;
              return (
                <React.Fragment key={cat.id}>
                  <tr style={{ opacity:cat.is_active===false?0.6:(txnCnt===0&&!hasChildren?0.45:1), background:hasChildren?'var(--sand)':undefined }}
                    onDragStart={e=>onCatDragStart(e,cat)} onDragEnd={onCatDragEnd} onDragOver={e=>e.preventDefault()} onDrop={e=>onCatDrop(e,cat)}>
                    <td style={{ fontFamily:'monospace', fontSize:11.5, color:'var(--stone)', fontWeight:600 }}>{cat.code||<span style={{ color:'var(--sand4)' }}>—</span>}</td>
                    <td style={{ cursor:hasChildren||txnCnt>0?'pointer':'default' }} onClick={()=>hasChildren?onToggleCollapse(cat.id):txnCnt>0&&onDrill(cat)}>
                      <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {hasChildren&&<span style={{ fontSize:9, color:'var(--stone)', width:10 }}>{isCollapsed?'▶':'▼'}</span>}
                        <span style={{ width:9, height:9, borderRadius:'50%', background:cat.col, flexShrink:0, display:'inline-block' }}/>
                        <span style={{ fontWeight:500, opacity:cat.is_active===false?0.5:1 }}>{cat.l}</span>
                        {cat.is_active===false&&<span style={{ fontSize:9, padding:'1px 5px', borderRadius:99, background:'var(--sand3)', color:'var(--stone)', fontWeight:500 }}>inactive</span>}
                        {hasChildren&&<span style={{ fontSize:9, color:'var(--stone)' }}>{children.length} sub</span>}
                        {!hasChildren&&txnCnt>0&&<span style={{ fontSize:10, color:'var(--a)' }}>View →</span>}
                      </span>
                    </td>
                    <td style={{ color:'var(--stone)', fontSize:11.5 }}>{cat.ac}</td>
                    <td className="tr" style={{ color:'var(--stone)', fontSize:12 }}>{txnCnt>0?txnCnt:<span style={{ color:'var(--sand4)' }}>—</span>}</td>
                    <td className={`tr ${bal>0?'vp':bal<0?'vn':''}`} style={{ fontSize:12, fontVariantNumeric:'tabular-nums', fontWeight:hasChildren?500:400 }}>{(txnCnt>0||hasChildren)?fmt(bal):<span style={{ color:'var(--sand4)' }}>$0.00</span>}</td>
                    <td><div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                      <button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px' }} onClick={()=>onEdit(cat)}>Edit</button>
                      {cat.is_active===false?(<div style={{ display:'flex', gap:3 }}><button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px', color:'var(--gn)' }} title="Reactivate" onClick={()=>onReactivate(cat.id)}>↺</button>{canDeactivate&&<button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px', color:'var(--rd)' }} title="Delete" onClick={()=>onHardDelete(cat)}>🗑</button>}</div>):canDeactivate?(<button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px', color:'var(--stone)' }} title="Set inactive" onClick={()=>onRequestDeactivate(cat)}>×</button>):(<span style={{ fontSize:10, color:'var(--sand4)', padding:'2px 7px' }} title="Remove sub-accounts first">—</span>)}
                    </div></td>
                  </tr>
                  {!isCollapsed&&children.map(ch=>{
                    const chBal=catBalances[ch.id]||0, chTxnCnt=(txns||[]).filter(t=>t.cat===ch.id).length;
                    return (<tr key={ch.id} style={{ background:'var(--sand)', opacity:ch.is_active===false?0.5:(chTxnCnt===0?0.45:1) }}>
                      <td style={{ fontFamily:'monospace', fontSize:11, color:'var(--stone)', paddingLeft:20 }}>{ch.code||'—'}</td>
                      <td style={{ cursor:chTxnCnt>0?'pointer':'default' }} onClick={()=>chTxnCnt>0&&onDrill(ch)}>
                        <span style={{ display:'flex', alignItems:'center', gap:6, paddingLeft:14 }}>
                          <span style={{ fontSize:9, color:'var(--stone2)' }}>└</span>
                          <span style={{ width:8, height:8, borderRadius:'50%', background:ch.col, flexShrink:0, display:'inline-block' }}/>
                          <span style={{ fontSize:12, opacity:ch.is_active===false?0.5:1 }}>{ch.l}</span>
                          {ch.is_active===false&&<span style={{ fontSize:9, padding:'1px 5px', borderRadius:99, background:'var(--sand3)', color:'var(--stone)' }}>inactive</span>}
                          {chTxnCnt>0&&<span style={{ fontSize:10, color:'var(--a)' }}>View →</span>}
                        </span>
                      </td>
                      <td style={{ color:'var(--stone)', fontSize:11 }}>{ch.ac}</td>
                      <td className="tr" style={{ color:'var(--stone)', fontSize:11 }}>{chTxnCnt>0?chTxnCnt:<span style={{ color:'var(--sand4)' }}>—</span>}</td>
                      <td className={`tr ${chBal>0?'vp':chBal<0?'vn':''}`} style={{ fontSize:11, fontVariantNumeric:'tabular-nums' }}>{chTxnCnt>0?fmt(chBal):<span style={{ color:'var(--sand4)' }}>$0.00</span>}</td>
                      <td><div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                        <button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px' }} onClick={()=>onEdit(ch)}>Edit</button>
                        {ch.is_active===false?(<div style={{ display:'flex', gap:3 }}><button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px', color:'var(--gn)' }} onClick={()=>onReactivate(ch.id)}>↺</button><button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px', color:'var(--rd)' }} onClick={()=>onHardDelete(ch)}>🗑</button></div>):(<button className="btn btn-sm" style={{ fontSize:10, padding:'2px 7px', color:'var(--stone)' }} onClick={()=>onRequestDeactivate(ch)}>×</button>)}
                      </div></td>
                    </tr>);
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
