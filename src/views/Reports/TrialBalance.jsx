/**
 * views/Reports/TrialBalance.jsx
 * Trial Balance — DR/CR by account, journal-based with txn fallback.
 */
import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { PeriodBar } from '../../components/ui/PeriodBar';
import { BalanceAlert } from '../../components/ui/index';
import { fmt, filterByDateRange, buildTBFromJournals, isTBBalanced, dateRangeLabel } from '../../utils/helpers';
import { A4Paper, CompareBar, CompareHeader } from './reportComponents';
import { DrillPanel } from './DrillPanel';
import { getPriorDates, addSyntheticParents } from './reportHelpers';

export function TrialBalance() {
  const{txns,catMap,dateFrom,dateTo,journals,accounts}=useApp(); // accounts = bank accounts
  const[drill,setDrill]=useState(null);
  const[compare,setCompare]=useState('none');
  const priorDates=getPriorDates(compare,dateFrom,dateTo);
  const accountMap=useMemo(()=>Object.fromEntries((accounts||[]).map(a=>[a.id,a])),[accounts]);
  const hasJournals=(journals||[]).some(j=>(j.journal_lines||j.lines||[]).length>0);
  const journalAccts=useMemo(()=>buildTBFromJournals(journals||[],dateFrom,dateTo,catMap,accountMap),[journals,dateFrom,dateTo,catMap,accountMap]);
  const journalAcctsP=useMemo(()=>priorDates?buildTBFromJournals(journals||[],priorDates[0],priorDates[1],catMap,accountMap):[],[journals,priorDates,catMap,accountMap]);
  function txnToTB(transactions){const map={};transactions.forEach(t=>{const cat=catMap[t.cat];if(!cat)return;const k=`cat:${cat.id}`;if(!map[k])map[k]={ac:cat.l,t:cat.t,col:cat.col,id:cat.id,dr:0,cr:0,label:cat.l};if((t.amt||0)>0)map[k].cr+=t.amt;else map[k].dr+=Math.abs(t.amt||0);});return Object.values(map).filter(a=>a.dr>0||a.cr>0);}
  const ft=useMemo(()=>filterByDateRange(txns,dateFrom,dateTo),[txns,dateFrom,dateTo]);
  const ftP=useMemo(()=>priorDates?filterByDateRange(txns,priorDates[0],priorDates[1]):[],[txns,priorDates]);
  // Always use journalAccts for the TB — it includes bank account lines from double-entry.
  // Fall back to txnToTB only if there are genuinely zero journals at all.
  // Bank accounts with opening_date (manual setup) get seeded; Basiq accounts (no opening_date)
  // show only via journal-line activity to avoid double-counting ob = live balance.
  const bankOBRows = useMemo(() => {
    return (accounts || []).flatMap(acct => {
      if (!acct.opening_date) return []; // Basiq or no cutoff set — skip ob seeding
      const ob = parseFloat(acct.opening_balance) || 0;
      if (ob === 0) return [];
      const isLiab = acct.type === 'credit_card' || acct.type === 'loan';
      const net = isLiab ? ob : -ob; // liab = CR (+), asset = DR (-)
      return [{ key: `bank:${acct.id}`, label: acct.name + ' (opening)', type: isLiab ? 'liability' : 'asset',
        col: acct.colour || '#185FA5', dr: isLiab ? 0 : ob, cr: isLiab ? ob : 0,
        net, cat_id: null, code: null, parent_id: null }];
    });
  }, [accounts]);
  const accts=useMemo(()=>{
    const base = hasJournals ? journalAccts : txnToTB(ft);
    // Merge bankOBRows — only add if not already in base
    const baseKeys = new Set(base.map(r => r.key));
    const extra = bankOBRows.filter(r => !baseKeys.has(r.key));
    return addSyntheticParents([...base, ...extra], catMap);
  },[hasJournals,journalAccts,ft,catMap,bankOBRows]);
  const acctsp=useMemo(()=>addSyntheticParents(hasJournals?journalAcctsP:(priorDates?txnToTB(ftP):[]),catMap),[hasJournals,journalAcctsP,ftP,priorDates,catMap]);
  const acctsTB=accts.filter(a=>!a.parent_id);
  const balanced=isTBBalanced(accts.filter(a=>!a.synthetic));
  const priorLabel=priorDates?dateRangeLabel(priorDates[0],priorDates[1]):'';
  const priorByKey=Object.fromEntries(acctsp.map(a=>[a.cat_id||a.label||a.ac,a]));
  const totalDR=acctsTB.reduce((s,a)=>s+(Math.abs(a.net)>0.005&&a.net<0?Math.abs(a.net):0),0);
  const totalCR=acctsTB.reduce((s,a)=>s+(Math.abs(a.net)>0.005&&a.net>0?a.net:0),0);
  const cols=compare!=='none'?'70px 1fr 90px 110px 110px 110px 110px':'70px 1fr 90px 110px 110px';
  return(
    <div>
      <PeriodBar/>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}>
        {hasJournals?<span style={{ fontSize:11, padding:'3px 10px', borderRadius:99, fontWeight:600, background:balanced?'var(--gnb)':'var(--rdb)', color:balanced?'var(--gn)':'var(--rd)' }}>{balanced?'✓ Balanced — DR = CR':`⚠ Imbalanced by ${fmt(Math.abs(totalDR-totalCR))}`}</span>:<div style={{ fontSize:12, color:'var(--stone)', padding:'6px 10px', background:'var(--al)', borderRadius:'var(--rr)', border:'0.5px solid var(--bd)' }}>💡 Categorise transactions to generate journal entries and populate the trial balance.</div>}
      </div>
      <CompareBar compare={compare} setCompare={setCompare}/>
      <BalanceAlert balanced={balanced} okText="Trial balance is balanced." warnText="Trial balance out of balance."/>
      <A4Paper title="Trial Balance" wide={compare!=='none'} subtitle={dateRangeLabel(dateFrom,dateTo)}>
        <div style={{ padding:'20px 0 0' }}>
          {compare!=='none'&&<CompareHeader labelA={dateRangeLabel(dateFrom,dateTo)} labelB={priorLabel}/>}
          <div style={{ display:'grid', gridTemplateColumns:cols, padding:'6px 16px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd2)' }}>
            {(compare!=='none'?['Code','Account','Type','Debit','Credit','DR (prior)','CR (prior)']:['Code','Account','Type','Debit','Credit']).map((h,i)=><span key={h} style={{ fontSize:10, fontWeight:500, color:i>2?'var(--stone2)':'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:i>1?'right':'left' }}>{h}</span>)}
          </div>
          {!hasJournals&&accts.length>0&&<div style={{ padding:'8px 32px', fontSize:11, color:'var(--stone)', background:'var(--al)', borderBottom:'0.5px solid var(--bd)' }}>Showing transaction totals. Post journals for a double-entry trial balance.</div>}
          {acctsTB.length===0&&<div style={{ padding:'24px 32px', color:'var(--stone)', fontSize:12 }}>No transactions with categories in range.</div>}
          {acctsTB.map((a,i)=>{const matchedCat=a.cat_id?catMap[a.cat_id]:Object.values(catMap).find(c=>c.l===(a.label||a.ac));const isSub=!!a.parent_id;const pEntry=priorByKey[a.cat_id||a.label||a.ac];return(
            <div key={a.label||a.ac||i} style={{ display:'grid', gridTemplateColumns:cols, padding:'6px 16px', borderBottom:'0.5px solid var(--bd)', fontSize:isSub?12:12.5, cursor:matchedCat?'pointer':'default', background:isSub?'var(--sand)':undefined }} onClick={()=>{if(!matchedCat)return;const subIds=accts.filter(r=>r.parent_id===a.cat_id).map(r=>r.cat_id).filter(Boolean);setDrill({...matchedCat,_subIds:subIds});}} onMouseEnter={e=>{if(matchedCat)e.currentTarget.style.background='var(--al)';}} onMouseLeave={e=>{e.currentTarget.style.background=isSub?'var(--sand)':'';}}>
              <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--stone2)', display:'flex', alignItems:'center' }}>{a.code?(isSub&&a.code.includes('/')?'/'+a.code.split('/')[1]:a.code):'—'}</span>
              <span style={{ display:'flex', alignItems:'center', gap:5, paddingLeft:isSub?12:0 }}>{isSub&&<span style={{ fontSize:7, color:'var(--stone2)', opacity:0.6 }}>◆</span>}<span style={{ fontWeight:a.synthetic?600:400, color:isSub?'var(--stone)':'var(--ink)' }}>{a.label||a.ac}</span>{matchedCat&&<span style={{ fontSize:10, color:'var(--stone)', opacity:0.5 }}>↗</span>}</span>
              <span style={{ textAlign:'right', fontSize:11, color:'var(--stone)', textTransform:'capitalize' }}>{a.type||'—'}</span>
              <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{a.net<-0.005?fmt(Math.abs(a.net)):'—'}</span>
              <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{a.net>0.005?fmt(a.net):'—'}</span>
              {compare!=='none'&&(()=>{const pNet=pEntry?.net??0;return<><span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--stone2)' }}>{pNet<-0.005?fmt(Math.abs(pNet)):'—'}</span><span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--stone2)' }}>{pNet>0.005?fmt(pNet):'—'}</span></>;})()}
            </div>
          );})}
          <div style={{ display:'grid', gridTemplateColumns:cols, padding:'8px 16px', background:'var(--sand)', borderTop:'1.5px solid var(--ink)', fontWeight:600, fontSize:12.5 }}>
            <span/><span style={{ color:balanced?'var(--ink)':'var(--rd)' }}>Total</span><span/>
            <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:balanced?'var(--ink)':'var(--rd)' }}>{fmt(totalDR)}</span>
            <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:balanced?'var(--ink)':'var(--rd)' }}>{fmt(totalCR)}</span>
            {compare!=='none'&&<><span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--stone2)' }}>{fmt(Math.abs(acctsp.filter(a=>a.net<0).reduce((s,a)=>s+a.net,0)))}</span><span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--stone2)' }}>{fmt(acctsp.filter(a=>a.net>0).reduce((s,a)=>s+a.net,0))}</span></>}
          </div>
          <div style={{ height:24 }}/>
        </div>
      </A4Paper>
      {drill&&<DrillPanel cat={drill} txns={txns} dateFrom={dateFrom} dateTo={dateTo} subCatIds={drill?._subIds||[]} onClose={()=>setDrill(null)}/>}
    </div>
  );
}
