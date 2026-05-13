/**
 * views/Accounting/Journals/index.jsx
 * Journals page orchestrator — tabs, entry form, post/void.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { createJournalEntry, updateJournalEntry } from '../../../lib/supabase';
import { fetchJournals } from '../../../services/journalService';
import { fmt } from '../../../utils/helpers';
import { GeneralLedger } from './GeneralLedger';
import { JournalList }   from './JournalList';

const BLANK = { ac:'', dr:'', cr:'' };
function newForm() { return { date:new Date().toISOString().slice(0,10), desc:'', ref:'', lines:[{...BLANK}] }; }

export function Journals() {
  const { cats, journals, setJournals, txns, accounts, org, toast } = useApp();

  // Refresh journals every time this view is mounted (so changes from other tabs show)
  // Refresh every time this view mounts — empty deps means "on every mount"
  // org?.id dep was wrong: fires only when org changes, not when tab is clicked
  useEffect(() => {
    if (!org?.id) return;
    fetchJournals(org.id).then(setJournals).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab,     setTab]     = useState('ledger');
  const [form,    setForm]    = useState(newForm());
  const [editing, setEditing] = useState(null);
  const [lineErrs,setLineErrs]= useState({});
  const [notice,  setNotice]  = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [showForm,setShowForm]= useState(false);

  const catMap = Object.fromEntries((cats||[]).map(c=>[c.id,c]));
  const totalDr=form.lines.reduce((s,l)=>s+(parseFloat(l.dr)||0),0);
  const totalCr=form.lines.reduce((s,l)=>s+(parseFloat(l.cr)||0),0);
  const balanced=Math.abs(totalDr-totalCr)<0.01&&totalDr>0;

  function setMsg(type,msg){setNotice({type,msg});if(type==='ok')setTimeout(()=>setNotice(null),3000);}
  function updLine(i,field,val){setForm(f=>({...f,lines:f.lines.map((l,j)=>j===i?{...l,[field]:val}:l)}));}
  function addLine(){setForm(f=>({...f,lines:[...f.lines,{...BLANK}]}));}
  function delLine(i){if(form.lines.length>1)setForm(f=>({...f,lines:f.lines.filter((_,j)=>j!==i)}));}
  function loadForEdit(j){const lines=j.journal_lines||j.lines||[];setForm({date:j.date,desc:j.description||j.desc||'',ref:j.ref||'',lines:lines.map(l=>({ac:l.account_name||l.ac||'',dr:l.debit||l.dr||'',cr:l.credit||l.cr||''}))});setEditing(j.id);setShowForm(true);setNotice(null);setLineErrs({});}

  async function postEntry(){
    const errs={};form.lines.forEach((l,i)=>{if(!l.ac)errs[i]=true;});
    if(Object.keys(errs).length){setLineErrs(errs);setMsg('err','All lines need an account name.');return;}
    if(!balanced){setMsg('err','Journal is not balanced — debits must equal credits.');return;}
    setSaving(true);setLineErrs({});
    try{
      const lines=form.lines.map((l,i)=>({account_name:l.ac,debit:parseFloat(l.dr)||0,credit:parseFloat(l.cr)||0,sort_order:i}));
      if(editing){await updateJournalEntry(editing,{date:form.date,description:form.desc,ref:form.ref||null},lines);setJournals(prev=>prev.map(j=>j.id===editing?{...j,date:form.date,description:form.desc,desc:form.desc,ref:form.ref,journal_lines:lines,lines}:j));setMsg('ok','Journal updated.');}
      else{const entry=await createJournalEntry(org.id,{date:form.date,description:form.desc,ref:form.ref||null,lines});setJournals(prev=>[{...entry,journal_lines:lines,lines},...prev]);setMsg('ok','Journal posted.');}
      setForm(newForm());setEditing(null);setShowForm(false);
    }catch(e){setMsg('err',e.message);}finally{setSaving(false);}
  }

  async function voidJournal(j){
    const reason=window.prompt('Reason for voiding this entry:');if(reason===null)return;
    try{await updateJournalEntry(j.id,{status:'void',void_reason:reason||'Voided by user'},null);setJournals(prev=>prev.map(x=>x.id===j.id?{...x,status:'void',void_reason:reason}:x));toast('Journal entry voided.');}
    catch(e){toast('Error: '+e.message);}
  }

  const activeJournals   = useMemo(()=>journals.filter(j=>j.status!=='void'),[journals]);
  const reversalJournals = useMemo(()=>journals.filter(j=>j.source==='reversal'),[journals]);

  return (
    <div>
      <div style={{ display:'flex', borderBottom:'0.5px solid var(--bd)', marginBottom:16 }}>
        {[['ledger','📒 General Ledger'],['entries','📋 Journal Entries']].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:'9px 16px', border:'none', background:'none', cursor:'pointer', fontSize:12.5, fontFamily:'var(--font-sans)', color:tab===t?'var(--ink)':'var(--stone)', fontWeight:tab===t?500:400, borderBottom:tab===t?'2px solid var(--a)':'2px solid transparent', marginBottom:-1 }}>{l}</button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8, paddingBottom:8 }}>
          <button className="btn btn-a btn-sm" onClick={()=>{setForm(newForm());setEditing(null);setShowForm(v=>!v);setNotice(null);}}>{showForm?'Cancel':'+ New journal entry'}</button>
        </div>
      </div>

      {showForm&&(<div className="card" style={{ marginBottom:16 }}>
        <div className="ch"><h3>{editing?'Edit journal entry':'New journal entry'}</h3>{notice&&<span style={{ fontSize:12, padding:'3px 10px', borderRadius:99, background:notice.type==='ok'?'var(--gnb)':'var(--rdb)', color:notice.type==='ok'?'var(--gn)':'var(--rd)', fontWeight:500 }}>{notice.msg}</span>}</div>
        <div style={{ padding:'12px 14px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'140px 1fr 120px', gap:10, marginBottom:12 }}>
            <div className="field" style={{ marginBottom:0 }}><label>Date</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
            <div className="field" style={{ marginBottom:0 }}><label>Description</label><input type="text" value={form.desc} placeholder="e.g. Loan repayment" onChange={e=>setForm(f=>({...f,desc:e.target.value}))}/></div>
            <div className="field" style={{ marginBottom:0 }}><label>Ref</label><input type="text" value={form.ref} placeholder="INV-001" onChange={e=>setForm(f=>({...f,ref:e.target.value}))}/></div>
          </div>
          <div style={{ border:'0.5px solid var(--bd)', borderRadius:'var(--rr)', overflow:'hidden', marginBottom:8 }}>
            <div style={{ display:'grid', gridTemplateColumns:'36px 1fr 100px 100px 28px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)' }}>
              {['#','Account','Debit','Credit',''].map((h,i)=><div key={i} style={{ padding:'5px 8px', fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:i>1?'right':'left' }}>{h}</div>)}
            </div>
            {form.lines.map((l,i)=>(
              <div key={i} style={{ display:'grid', gridTemplateColumns:'36px 1fr 100px 100px 28px', borderBottom:i<form.lines.length-1?'0.5px solid var(--bd)':'none', background:lineErrs[i]?'rgba(163,45,45,0.04)':i%2===0?'var(--sand)':'var(--sand2)' }}>
                <div style={{ padding:'6px 8px', fontSize:11, color:'var(--stone)', display:'flex', alignItems:'center' }}>{i+1}</div>
                <div style={{ padding:'4px 6px' }}>
                  <input list={`acct-list-${i}`} value={l.ac} onChange={e=>updLine(i,'ac',e.target.value)} placeholder="Account name" style={{ width:'100%', padding:'4px 6px', fontSize:12, border:lineErrs[i]?'0.5px solid var(--rd)':'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--sand)', fontFamily:'var(--font-sans)' }}/>
                  <datalist id={`acct-list-${i}`}>{(cats||[]).filter(x=>x.is_active!==false).sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999)).map(a=><option key={a.id} value={a.code?`${a.code} · ${a.l}`:a.l}/>)}</datalist>
                </div>
                {['dr','cr'].map(field=>(
                  <div key={field} style={{ padding:'4px 6px' }}><input type="number" step="0.01" min="0" value={l[field]} onChange={e=>updLine(i,field,e.target.value)} placeholder="0.00" style={{ width:'100%', padding:'4px 6px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--sand)', textAlign:'right', fontFamily:'var(--font-sans)', fontVariantNumeric:'tabular-nums' }}/></div>
                ))}
                <div style={{ padding:'4px', display:'flex', alignItems:'center', justifyContent:'center' }}><button onClick={()=>delLine(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--stone)', fontSize:15, padding:0, opacity:form.lines.length===1?0.3:1 }} disabled={form.lines.length===1}>×</button></div>
              </div>
            ))}
          </div>
          <button className="btn btn-sm" onClick={addLine} style={{ marginBottom:12 }}>+ Add line</button>
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', background:'var(--sand)', borderRadius:'var(--rr)', marginBottom:12 }}>
            <span style={{ fontSize:12 }}>DR: <strong style={{ fontVariantNumeric:'tabular-nums' }}>{fmt(totalDr)}</strong></span>
            <span style={{ fontSize:12 }}>CR: <strong style={{ fontVariantNumeric:'tabular-nums' }}>{fmt(totalCr)}</strong></span>
            <span style={{ fontSize:12, marginLeft:'auto', padding:'2px 10px', borderRadius:99, fontWeight:600, background:balanced?'var(--gnb)':'var(--rdb)', color:balanced?'var(--gn)':'var(--rd)' }}>{balanced?'✓ Balanced':`Off by ${fmt(Math.abs(totalDr-totalCr))}`}</span>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-a" onClick={postEntry} disabled={saving||!balanced}>{saving?'Saving…':editing?'Update entry':'Post entry'}</button>
            <button className="btn" onClick={()=>{setForm(newForm());setEditing(null);setShowForm(false);setNotice(null);}}>Cancel</button>
          </div>
        </div>
      </div>)}

      {tab==='ledger'&&(<div className="card" style={{ overflow:'hidden' }}><div className="ch"><h3>General Ledger</h3><p>Consolidated account balances across all journal entries</p></div><GeneralLedger journals={activeJournals} catMap={catMap} txns={txns} accounts={accounts}/></div>)}
      {tab==='entries'&&(<div>
        <div className="card" style={{ marginBottom:12 }}>
          <div className="ch"><h3>Journal entries</h3><p>{activeJournals.filter(j=>j.source!=='reversal').length} active · {journals.filter(j=>j.status==='void').length} voided</p></div>
          <JournalList journals={activeJournals.filter(j=>j.source!=='reversal')} onEdit={loadForEdit} onVoid={voidJournal} catMap={catMap}/>
        </div>
        {reversalJournals.length>0&&(<div className="card"><div className="ch" style={{ background:'var(--rdb)' }}><h3 style={{ color:'var(--rd)' }}>↩ Reversals</h3><p style={{ color:'var(--rd)', opacity:0.8 }}>{reversalJournals.length} reversal{reversalJournals.length!==1?'s':''}</p></div><JournalList journals={reversalJournals} onEdit={()=>{}} onVoid={voidJournal} catMap={catMap}/></div>)}
      </div>)}
    </div>
  );
}
