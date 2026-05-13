/**
 * views/Reports/ProfitAndLoss.jsx
 * Profit & Loss report with comparison and sub-account grouping.
 */
import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { PeriodBar } from '../../components/ui/PeriodBar';
import { MetricCard } from '../../components/ui/index';
import { fmt, fmtReport, fmtSigned, filterByDateRange, buildPLFromJournals, dateRangeLabel } from '../../utils/helpers';
import { A4Paper, CompareBar, CompareHeader, StHead, StRow, StGroupTotal, StTotal, StGrand, MonoContext } from './reportComponents';
import { DrillPanel } from './DrillPanel';
import { getPriorDates, addPLParents, subCodeLabel } from './reportHelpers';

export function ProfitAndLoss() {
  const{txns,catMap,dateFrom,dateTo,journals,accounts}=useApp();
  const[drill,setDrill]=useState(null);
  const[compare,setCompare]=useState('none');
  const[mono,setMono]=useState(false);
  const priorDates=getPriorDates(compare,dateFrom,dateTo);
  const accountMap=useMemo(()=>Object.fromEntries((accounts||[]).map(a=>[a.id,a])),[accounts]);
  const hasJournals=(journals||[]).some(j=>(j.journal_lines||j.lines||[]).some(l=>l.category_id));
  const rawPL=useMemo(()=>buildPLFromJournals(journals||[],dateFrom,dateTo,catMap,accountMap),[journals,dateFrom,dateTo,catMap,accountMap]);
  const rawPLP=useMemo(()=>priorDates?buildPLFromJournals(journals||[],priorDates[0],priorDates[1],catMap,accountMap):null,[journals,priorDates,catMap,accountMap]);
  const pl=rawPL?{...rawPL,incomeLines:addPLParents(rawPL.incomeLines,catMap),expenseLines:addPLParents(rawPL.expenseLines,catMap)}:rawPL;
  const plP=rawPLP?{...rawPLP,incomeLines:addPLParents(rawPLP.incomeLines,catMap),expenseLines:addPLParents(rawPLP.expenseLines,catMap)}:rawPLP;
  const ft=useMemo(()=>filterByDateRange(txns,dateFrom,dateTo),[txns,dateFrom,dateTo]);
  const ftP=useMemo(()=>priorDates?filterByDateRange(txns,priorDates[0],priorDates[1]):[],[txns,priorDates]);
  function buildByCat(transactions){const byCat={};transactions.forEach(t=>{const c=catMap[t.cat];if(!c)return;if(c.t==='income'&&t.amt<=0)return;if(c.t==='expense'&&t.amt>=0)return;if(!byCat[c.id])byCat[c.id]={...c,total:0};byCat[c.id].total+=t.amt;});return byCat;}
  const byCat=useMemo(()=>buildByCat(ft),[ft]);
  const byCatP=useMemo(()=>compare!=='none'?buildByCat(ftP):{},[ftP,compare]);
  const incomeLines=hasJournals?pl.incomeLines:Object.values(byCat).filter(c=>c.t==='income');
  const expenseLines=hasJournals?pl.expenseLines:Object.values(byCat).filter(c=>c.t==='expense');
  const totalIncome=hasJournals?pl.totalIncome:Object.values(byCat).filter(c=>c.t==='income').reduce((s,c)=>s+c.total,0);
  const totalExpense=hasJournals?pl.totalExpense:Math.abs(Object.values(byCat).filter(c=>c.t==='expense').reduce((s,c)=>s+c.total,0));
  const netProfit=hasJournals?pl.netProfit:totalIncome-totalExpense;
  const totalIncomeP=hasJournals?(plP?.totalIncome??0):Object.values(byCatP).filter(c=>c.t==='income').reduce((s,c)=>s+c.total,0);
  const totalExpenseP=hasJournals?(plP?.totalExpense??0):Math.abs(Object.values(byCatP).filter(c=>c.t==='expense').reduce((s,c)=>s+c.total,0));
  const netProfitP=hasJournals?(plP?.netProfit??0):totalIncomeP-totalExpenseP;
  const priorLabel=priorDates?dateRangeLabel(priorDates[0],priorDates[1]):'';
  function renderLines(lines,isExpense){if(!lines?.length)return<StRow label={`No ${isExpense?'expenses':'income'} in period`} value="" indent/>;const lineIds=new Set(lines.map(x=>x.id));const parents=lines.filter(x=>!x.parent_id||!lineIds.has(x.parent_id));const childrenOf=id=>lines.filter(x=>x.parent_id===id);return parents.flatMap(c=>{const kids=childrenOf(c.id),hasKids=kids.length>0;const getVal=item=>hasJournals?(isExpense?item.dr-item.cr:item.cr-item.dr):(isExpense?Math.abs(item.total):item.total);const val=fmtReport(getVal(c));const priorC=hasJournals?(isExpense?plP?.expenseLines:plP?.incomeLines)?.find(x=>x.id===c.id):byCatP[c.id];const valB=compare!=='none'?(priorC?fmt(getVal(priorC)):'—'):undefined;const vcls=(v)=>isExpense?(v>=0?'vn':'vp'):(v>=0?'vp':'vn');const kidsTotal=kids.reduce((s,ch)=>s+getVal(ch),0),ownVal=c.synthetic?0:getVal(c),groupTotal=hasKids?ownVal+kidsTotal:null;const groupTotalB=hasKids&&compare!=='none'?(()=>{const pKids=kids.reduce((s,ch)=>{const p=hasJournals?(isExpense?plP?.expenseLines:plP?.incomeLines)?.find(x=>x.id===ch.id):byCatP[ch.id];return s+(p?getVal(p):0);},0);const pOwn=c.synthetic?0:(priorC?getVal(priorC):0);return fmt(pOwn+pKids);})():undefined;const lbl=c.code?`${subCodeLabel(c.code,!!c.parent_id)||c.code}  ${c.l}`:c.l;return[hasKids?<StRow key={c.id} label={c.code?`${c.code}  ${c.l}`:c.l} value="" indent isParentHeader/>:<StRow key={c.id} label={lbl} value={val} valueB={valB} indent clickable onClick={()=>setDrill(c)} valueClass={vcls(getVal(c))}/>,
    ...kids.map(ch=>{const cv=fmtReport(getVal(ch));const pch=hasJournals?(isExpense?plP?.expenseLines:plP?.incomeLines)?.find(x=>x.id===ch.id):byCatP[ch.id];const cvB=compare!=='none'?(pch?fmt(getVal(pch)):'—'):undefined;const sub=ch.code?.includes('/')?`/${ch.code.split('/')[1]}  ${ch.l}`:ch.l;return<StRow key={ch.id} label={sub} value={cv} valueB={cvB} sub clickable onClick={()=>setDrill(ch)} valueClass={vcls(getVal(c))}/>;}),
    hasKids&&<StGroupTotal key={c.id+'-total'} label={c.l} value={fmt(groupTotal)} valueB={groupTotalB} valueClass={vcls(getVal(c))}/>,].filter(Boolean);});}
  return(
    <MonoContext.Provider value={mono}>
      <div>
        <PeriodBar/>
        <div className="metrics">
          <MetricCard label="Total income" value={fmtReport(totalIncome)} valueClass={totalIncome>=0?'vp':'vn'}/>
          <MetricCard label="Total expenses" value={fmtReport(totalExpense)} valueClass={totalExpense>=0?'vn':'vp'}/>
          <MetricCard label="Net profit / (loss)" value={fmtReport(netProfit)} valueClass={netProfit>=0?'vp':'vn'}/>
          <MetricCard label="Expense ratio" value={`${totalIncome>0?Math.round(Math.abs(totalExpense)/totalIncome*100):0}%`} valueClass="va"/>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', padding:'4px 12px 0', gap:6 }}>
          <button onClick={() => setMono(m => !m)} style={{ fontSize:11, padding:'3px 10px', borderRadius:'var(--rr)', border:'0.5px solid var(--bd2)', background: mono ? 'var(--sand3)' : 'transparent', color:'var(--stone2)', cursor:'pointer', fontFamily:'var(--font-sans)' }}>
            {mono ? '◑ Colour off' : '◐ Colour on'}
          </button>
        </div>
        <CompareBar compare={compare} setCompare={setCompare}/>
        <A4Paper title="Profit & Loss" wide={compare!=='none'} subtitle={dateRangeLabel(dateFrom,dateTo)}>
          <div style={{ padding:'20px 0 0' }}>
            {compare!=='none'&&<CompareHeader labelA={dateRangeLabel(dateFrom,dateTo)} labelB={priorLabel}/>}
            <StHead>Income</StHead>{renderLines(incomeLines,false)}
            <StTotal label="Total Income" value={fmtReport(totalIncome)} valueB={compare!=='none'?fmtReport(totalIncomeP):undefined} valueClass={totalIncome>=0?'vp':'vn'}/>
            <div style={{ height:8 }}/><StHead>Expenses</StHead>{renderLines(expenseLines,true)}
            <StTotal label="Total Expenses" value={fmtReport(totalExpense)} valueB={compare!=='none'?fmtReport(totalExpenseP):undefined} valueClass={totalExpense>=0?'vn':'vp'}/>
            <StGrand label="Net Profit / (Loss)" value={fmtReport(netProfit)} valueClass={netProfit>=0?'vp':'vn'}/>
            {compare!=='none'&&<div style={{ padding:'6px 32px', fontSize:12, color:'var(--stone)', borderTop:'0.5px solid var(--bd)', background:'var(--sand)' }}>Prior period net: <span className={netProfitP>=0?'vp':'vn'} style={{ fontWeight:500 }}>{fmt(netProfitP)}</span>{' · '}Variance: <span className={(netProfit-netProfitP)>=0?'vp':'vn'} style={{ fontWeight:500 }}>{fmtSigned(netProfit-netProfitP)}</span></div>}
            <div style={{ height:24 }}/>
          </div>
        </A4Paper>
        {drill&&<DrillPanel cat={drill} txns={txns} dateFrom={dateFrom} dateTo={dateTo} onClose={()=>setDrill(null)}/>}
      </div>
    </MonoContext.Provider>
  );
}
