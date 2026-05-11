/**
 * views/Accounting/Budgets.jsx
 * Monthly budget targets vs actual spend per expense category.
 */
import React from 'react';
import { useApp } from '../../context/AppContext';
import { fmt, fmtSigned, filterByDateRange } from '../../utils/helpers';
import { MetricCard } from '../../components/ui/index';
import { PeriodBar } from '../../components/ui/PeriodBar';

export function Budgets() {
  const { txns, cats, catMap, budgets, setBudgets, org, dateFrom, dateTo, toast } = useApp();
  const [saving, setSaving] = React.useState(false);
  const [localBudgets, setLocalBudgets] = React.useState(()=>Array.isArray(budgets)?Object.fromEntries(budgets.map(b=>[b.category_id,b.monthly_amount||0])):budgets||{});
  React.useEffect(()=>{if(Array.isArray(budgets))setLocalBudgets(Object.fromEntries(budgets.map(b=>[b.category_id,b.monthly_amount||0])));else if(budgets&&typeof budgets==='object')setLocalBudgets(budgets);},[budgets]);
  const ft=filterByDateRange(txns,dateFrom,dateTo);
  const actuals={};ft.forEach(t=>{const c=catMap[t.cat];if(!c||c.t!=='expense')return;actuals[t.cat]=(actuals[t.cat]||0)+Math.abs(t.amt);});
  const expenseCats=cats.filter(c=>c.t==='expense');
  const totalBudget=expenseCats.reduce((s,c)=>s+(localBudgets[c.id]||0),0);
  const totalActual=expenseCats.reduce((s,c)=>s+(actuals[c.id]||0),0);
  function updateBudget(id,val){setLocalBudgets(prev=>({...prev,[id]:parseFloat(val)||0}));}
  async function saveBudgets(){setSaving(true);try{const{upsertBudget}=await import('../../lib/supabase');const fyStart=dateFrom?dateFrom.slice(0,7):new Date().toISOString().slice(0,7);const entries=Object.entries(localBudgets).filter(([,v])=>v>0);await Promise.all(entries.map(([catId,amt])=>upsertBudget(org.id,catId,fyStart,amt)));setBudgets(Array.isArray(budgets)?entries.map(([category_id,monthly_amount])=>({category_id,monthly_amount})):localBudgets);toast('Budgets saved.');}catch(e){toast('Error saving budgets: '+e.message);}finally{setSaving(false);}}
  return (
    <div>
      <PeriodBar/>
      <div className="metrics">
        <MetricCard label="Budgeted" value={fmt(totalBudget)} valueClass="va"/>
        <MetricCard label="Actual"   value={fmt(totalActual)} valueClass="vn"/>
        <MetricCard label="Variance" value={fmtSigned(totalBudget-totalActual)} valueClass={totalBudget>=totalActual?'vp':'vn'}/>
        <MetricCard label="Used"     value={`${totalBudget>0?Math.round(totalActual/totalBudget*100):0}%`} valueClass="va"/>
      </div>
      <div className="card">
        <div className="ch"><h3>Budget vs actual</h3><div className="ch-r"><button className="btn btn-a btn-sm" onClick={saveBudgets} disabled={saving}>{saving?'Saving…':'Save budgets'}</button></div></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 90px 80px 55px', borderBottom:'0.5px solid var(--bd)' }}>
          {['Category','Budget','Actual','Used'].map(h=><span key={h} style={{ fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', padding:'6px 10px' }}>{h}</span>)}
        </div>
        {expenseCats.map(c=>{const b=localBudgets[c.id]||0,a=actuals[c.id]||0,pct=b>0?Math.round(a/b*100):0,over=a>b;return(
          <div key={c.id} style={{ display:'grid', gridTemplateColumns:'1fr 90px 80px 55px', borderBottom:'0.5px solid var(--bd)', alignItems:'center' }}>
            <span style={{ padding:'7px 10px', display:'flex', flexDirection:'column', gap:3 }}>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}><span className="cdot" style={{ background:c.col }}/>{c.l}</span>
              <div style={{ height:4, background:'var(--sand3)', borderRadius:2, width:'90%' }}><div style={{ height:4, borderRadius:2, background:over?'var(--rd)':c.col, width:`${Math.min(pct,100)}%` }}/></div>
            </span>
            <span style={{ padding:'7px 10px', textAlign:'right' }}><input type="number" value={b} onChange={e=>updateBudget(c.id,e.target.value)} style={{ width:68, padding:'3px 6px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--bg-card)', textAlign:'right', fontFamily:'var(--font-sans)' }}/></span>
            <span style={{ padding:'7px 10px', textAlign:'right', fontSize:12, fontVariantNumeric:'tabular-nums' }} className={over?'vn':''}>{a>0?fmt(a):'—'}</span>
            <span style={{ padding:'7px 10px', textAlign:'right', fontSize:12, fontWeight:500, color:pct>100?'var(--rd)':pct>80?'var(--a)':'var(--gn)' }}>{b>0?`${pct}%`:'—'}</span>
          </div>
        );})}
      </div>
    </div>
  );
}
