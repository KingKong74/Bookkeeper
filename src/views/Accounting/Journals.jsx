/**
 * views/Accounting/Journals.jsx
 * -----------------------------------------------
 * Two views:
 *   General Ledger — consolidated account balances from all auto-cat journals
 *   Journal Entries — individual posted entries (manual + auto ledger)
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { createJournalEntry, updateJournalEntry } from '../../lib/supabase';
import { fmt } from '../../utils/helpers';

const BLANK_LINE = { ac:'', dr:'', cr:'' };
function newForm() {
  return { date: new Date().toISOString().slice(0,10), desc:'', ref:'', lines:[{...BLANK_LINE}] };
}

// ── Consolidate journal lines by account name ─────────────────────────────────
// Given an array of raw journal lines, sum DR and CR per account_name.
// Returns sorted rows: highest total first.
function consolidateLines(lines) {
  const map = {};
  for (const l of lines) {
    const name = l.account_name || l.ac || '—';
    if (!map[name]) map[name] = { account_name: name, debit: 0, credit: 0 };
    map[name].debit  += parseFloat(l.debit  || l.dr  || 0);
    map[name].credit += parseFloat(l.credit || l.cr  || 0);
  }
  return Object.values(map)
    .filter(r => r.debit > 0.005 || r.credit > 0.005)
    .sort((a,b) => (b.debit + b.credit) - (a.debit + a.credit));
}

// ── General Ledger view ───────────────────────────────────────────────────────
function GeneralLedger({ journals, catMap, txns }) {
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState(new Set());

  function toggleAccount(name) {
    setExpanded(p => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }

  // All raw lines from all active journals
  const allLines = useMemo(() =>
    journals.filter(j => j.status !== 'void')
             .flatMap(j => (j.journal_lines || j.lines || [])),
    [journals]
  );

  // Build a map: account_name → array of raw lines (each line has transaction_id)
  const linesByAccount = useMemo(() => {
    const map = {};
    for (const l of allLines) {
      const name = l.account_name || l.ac || '—';
      if (!map[name]) map[name] = [];
      map[name].push(l);
    }
    return map;
  }, [allLines]);

  // Build txn lookup for quick access when expanding
  const txnById = useMemo(() => Object.fromEntries((txns||[]).map(t=>[t.id,t])), [txns]);

  const consolidated = useMemo(() => consolidateLines(allLines), [allLines]);

  const filtered = search.trim()
    ? consolidated.filter(r => r.account_name.toLowerCase().includes(search.toLowerCase()))
    : consolidated;

  const totalDR = filtered.reduce((s,r) => s+r.debit, 0);
  const totalCR = filtered.reduce((s,r) => s+r.credit, 0);
  const balanced = Math.abs(totalDR - totalCR) < 0.01;

  if (allLines.length === 0) {
    return (
      <div style={{ padding:24, textAlign:'center', color:'var(--stone)', fontSize:12 }}>
        <div style={{ fontSize:28, marginBottom:8 }}>📒</div>
        <p style={{ fontWeight:500, marginBottom:4 }}>General ledger is empty</p>
        <p>Assign categories to transactions to populate the ledger.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Search + balance badge */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'0.5px solid var(--bd)', background:'var(--sand)' }}>
        <input
          placeholder="Search accounts…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding:'5px 10px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)', width:220 }}
        />
        <span style={{ fontSize:11, padding:'3px 10px', borderRadius:99, fontWeight:600,
          background: balanced ? 'var(--gnb)' : 'var(--rdb)',
          color:      balanced ? 'var(--gn)'  : 'var(--rd)' }}>
          {balanced ? '✓ Balanced' : `⚠ Off by ${fmt(Math.abs(totalDR - totalCR))}`}
        </span>
        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--stone)' }}>
          {filtered.length} accounts · {allLines.length} entries
        </span>
      </div>

      {/* Account rows — click to expand transactions */}
      {filtered.map((r, idx) => {
        const net      = r.credit - r.debit;
        const isExpand = expanded.has(r.account_name);
        const acctLines = linesByAccount[r.account_name] || [];
        // Get unique transactions for this account (by transaction_id)
        const txnLines = acctLines.filter(l => l.transaction_id);
        const noTxnLines = acctLines.filter(l => !l.transaction_id);
        const canExpand = acctLines.length > 0;

        return (
          <React.Fragment key={r.account_name}>
            {/* Account summary row */}
            <div
              onClick={() => canExpand && toggleAccount(r.account_name)}
              style={{ display:'grid', gridTemplateColumns:'28px 1fr 110px 110px 100px', padding:'7px 14px',
                borderBottom:'0.5px solid var(--bd)', background:idx%2===0?'#FDFAF6':'var(--sand)',
                cursor:canExpand?'pointer':'default', alignItems:'center' }}
              onMouseEnter={e => { if(canExpand) e.currentTarget.style.background='var(--al)'; }}
              onMouseLeave={e => { e.currentTarget.style.background=idx%2===0?'#FDFAF6':'var(--sand)'; }}
            >
              <span style={{ fontSize:11, color:'var(--stone)' }}>{canExpand ? (isExpand?'▾':'▸') : ''}</span>
              <span style={{ fontWeight:500, fontSize:12.5 }}>{r.account_name}</span>
              <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12 }}>
                {r.debit > 0.005 ? fmt(r.debit) : <span style={{ color:'var(--sand4)' }}>—</span>}
              </span>
              <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12 }}>
                {r.credit > 0.005 ? fmt(r.credit) : <span style={{ color:'var(--sand4)' }}>—</span>}
              </span>
              <span className={net > 0 ? 'vp' : net < 0 ? 'vn' : ''} style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12, fontWeight:500 }}>
                {net > 0.005 ? '+'+fmt(net) : net < -0.005 ? '-'+fmt(Math.abs(net)) : '—'}
              </span>
            </div>

            {/* Expanded: individual transactions */}
            {isExpand && (
              <div style={{ background:'var(--sand)', borderBottom:'0.5px solid var(--bd)' }}>
                {/* Sub-header */}
                <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 110px 110px 100px', padding:'4px 14px',
                  borderBottom:'0.5px solid var(--bd)', background:'var(--sand2)' }}>
                  <span/>
                  <span style={{ fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Transaction</span>
                  <span style={{ fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'right' }}>DR</span>
                  <span style={{ fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'right' }}>CR</span>
                  <span style={{ fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'right' }}>Date</span>
                </div>
                {txnLines.map((l, li) => {
                  const txn = txnById[l.transaction_id];
                  return (
                    <div key={li} style={{ display:'grid', gridTemplateColumns:'28px 1fr 110px 110px 100px',
                      padding:'5px 14px', borderBottom:'0.5px solid var(--bd)',
                      background:li%2===0?'var(--sand)':'#FDFAF6' }}>
                      <span/>
                      <span style={{ fontSize:11.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {txn?.desc || l.account_name}
                        {txn?.payee && <span style={{ color:'var(--stone)', marginLeft:6, fontSize:10 }}>{txn.payee}</span>}
                      </span>
                      <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:11.5 }}>
                        {parseFloat(l.debit) > 0.005 ? fmt(parseFloat(l.debit)) : '—'}
                      </span>
                      <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:11.5 }}>
                        {parseFloat(l.credit) > 0.005 ? fmt(parseFloat(l.credit)) : '—'}
                      </span>
                      <span style={{ textAlign:'right', fontSize:11, color:'var(--stone)' }}>{txn?.date || '—'}</span>
                    </div>
                  );
                })}
                {noTxnLines.length > 0 && (
                  <div style={{ padding:'4px 14px 4px 42px', fontSize:11, color:'var(--stone)', fontStyle:'italic' }}>
                    +{noTxnLines.length} manual journal line{noTxnLines.length!==1?'s':''}
                  </div>
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Totals footer */}
      <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 110px 110px 100px', padding:'8px 14px',
        borderTop:'1.5px solid var(--ink)', background:'var(--sand)', fontWeight:600 }}>
        <span/>
        <span>Total</span>
        <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:balanced?'var(--ink)':'var(--rd)' }}>{fmt(totalDR)}</span>
        <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:balanced?'var(--ink)':'var(--rd)' }}>{fmt(totalCR)}</span>
        <span/>
      </div>
    </div>
  );
}

// ── Journal entry list ────────────────────────────────────────────────────────
function JournalList({ journals, onEdit, onVoid }) {
  const [expanded, setExpanded] = useState(new Set());

  const toggle = id => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (journals.length === 0) {
    return <div style={{ padding:'20px 14px', fontSize:12, color:'var(--stone)' }}>No entries posted yet.</div>;
  }

  return journals.map(j => {
    const rawLines   = (j.journal_lines || j.lines || []);
    const isAutoLedger = j.source === 'auto_category';
    // For the auto ledger, consolidate lines for display; show count
    const displayLines = isAutoLedger ? consolidateLines(rawLines) : rawLines;
    const isExpanded   = expanded.has(j.id);
    const isVoid       = j.status === 'void';
    const totalDR      = rawLines.reduce((s,l)=>s+(parseFloat(l.debit||l.dr)||0),0);
    const totalCR      = rawLines.reduce((s,l)=>s+(parseFloat(l.credit||l.cr)||0),0);

    return (
      <div key={j.id} style={{ borderBottom:'0.5px solid var(--bd)', opacity:isVoid?0.5:1 }}>
        {/* Entry header — always visible */}
        <div style={{ padding:'11px 16px', display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}
          onClick={() => toggle(j.id)}>
          <span style={{ fontSize:13, color:'var(--stone)', flexShrink:0 }}>{isExpanded ? '▾' : '▸'}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontWeight:500, fontSize:12.5 }}>{j.description || j.desc}</span>
              {j.ref && <span style={{ fontSize:10, color:'var(--stone)', background:'var(--sand2)', padding:'1px 7px', borderRadius:99 }}>{j.ref}</span>}
              {isAutoLedger && <span style={{ fontSize:10, background:'var(--al)', color:'var(--a2)', padding:'1px 7px', borderRadius:99, fontWeight:500 }}>Auto</span>}
              {isVoid && <span style={{ fontSize:10, background:'var(--rdb)', color:'var(--rd)', padding:'1px 7px', borderRadius:99, fontWeight:500 }}>VOID</span>}
            </div>
            <div style={{ fontSize:11, color:'var(--stone)', marginTop:1 }}>
              {j.date}
              {isAutoLedger && ` · ${rawLines.length} entries · ${displayLines.length} accounts`}
              {j.void_reason && ` · ${j.void_reason}`}
            </div>
          </div>
          {/* Summary amounts */}
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontSize:11.5, fontVariantNumeric:'tabular-nums', fontWeight:500 }}>{fmt(totalDR)}</div>
            <div style={{ fontSize:10, color:'var(--stone)' }}>DR / CR</div>
          </div>
          {!isVoid && (
            <div style={{ display:'flex', gap:4, flexShrink:0 }} onClick={e => e.stopPropagation()}>
              {!isAutoLedger && <button className="btn btn-sm" style={{ fontSize:10 }} onClick={() => onEdit(j)}>Edit</button>}
              {!isAutoLedger && <button className="btn btn-sm" style={{ fontSize:10, color:'var(--rd)' }} onClick={() => onVoid(j)}>Void</button>}
            </div>
          )}
        </div>

        {/* Expanded lines */}
        {isExpanded && (
          <div style={{ margin:'0 16px 12px', border:'0.5px solid var(--bd)', borderRadius:'var(--rr)', overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', background:'var(--sand)' }}>
              {['Account','Debit','Credit'].map((h,i) => (
                <div key={i} style={{ padding:'4px 10px', fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:i>0?'right':'left' }}>{h}</div>
              ))}
            </div>
            {displayLines.map((l, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', borderTop:'0.5px solid var(--bd)', background:i%2===0?'#FDFAF6':'var(--sand)' }}>
                <div style={{ padding:'5px 10px', fontSize:12 }}>{l.account_name || l.ac || '—'}</div>
                <div style={{ padding:'5px 10px', fontSize:12, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>
                  {parseFloat(l.debit||l.dr) > 0.005 ? fmt(parseFloat(l.debit||l.dr)) : '—'}
                </div>
                <div style={{ padding:'5px 10px', fontSize:12, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>
                  {parseFloat(l.credit||l.cr) > 0.005 ? fmt(parseFloat(l.credit||l.cr)) : '—'}
                </div>
              </div>
            ))}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', borderTop:'0.5px solid var(--bd2)', background:'var(--sand)' }}>
              <div style={{ padding:'5px 10px', fontSize:12, fontWeight:500 }}>Total</div>
              <div style={{ padding:'5px 10px', fontSize:12, fontWeight:500, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(totalDR)}</div>
              <div style={{ padding:'5px 10px', fontSize:12, fontWeight:500, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(totalCR)}</div>
            </div>
          </div>
        )}
      </div>
    );
  });
}

// ── Main Journals component ───────────────────────────────────────────────────
export function Journals() {
  const { cats, journals, setJournals, accounts, txns, org, toast } = useApp();
  const [tab,     setTab]     = useState('ledger'); // 'ledger' | 'entries'
  const [form,    setForm]    = useState(newForm());
  const [editing, setEditing] = useState(null);
  const [lineErrs,setLineErrs]= useState({});
  const [notice,  setNotice]  = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [showForm,setShowForm]= useState(false);

  const catMap       = Object.fromEntries((cats||[]).map(c=>[c.id,c]));
  const accountOptions = [...new Set((cats||[]).map(c => c.ac))].sort();

  const totalDr  = form.lines.reduce((s,l) => s + (parseFloat(l.dr)||0), 0);
  const totalCr  = form.lines.reduce((s,l) => s + (parseFloat(l.cr)||0), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01 && totalDr > 0;

  function setMsg(type, msg) {
    setNotice({ type, msg });
    if (type === 'ok') setTimeout(() => setNotice(null), 3000);
  }
  function updLine(i, field, val) {
    setForm(f => ({ ...f, lines: f.lines.map((l,j) => j===i ? {...l,[field]:val} : l) }));
  }
  function addLine()    { setForm(f => ({ ...f, lines: [...f.lines, {...BLANK_LINE}] })); }
  function delLine(i)   { if (form.lines.length > 1) setForm(f => ({ ...f, lines: f.lines.filter((_,j) => j!==i) })); }

  function loadForEdit(j) {
    const lines = (j.journal_lines || j.lines || []);
    setForm({
      date:  j.date, desc:  j.description||j.desc||'', ref: j.ref||'',
      lines: lines.map(l => ({ ac: l.account_name||l.ac||'', dr: l.debit||l.dr||'', cr: l.credit||l.cr||'' })),
    });
    setEditing(j.id); setShowForm(true); setNotice(null); setLineErrs({});
  }

  async function postEntry() {
    const errs = {};
    form.lines.forEach((l,i) => { if (!l.ac) errs[i] = true; });
    if (Object.keys(errs).length) { setLineErrs(errs); setMsg('err','All lines need an account name.'); return; }
    if (!balanced) { setMsg('err','Journal is not balanced — debits must equal credits.'); return; }
    setSaving(true); setLineErrs({});
    try {
      const lines = form.lines.map((l,i) => ({
        account_name: l.ac, debit: parseFloat(l.dr)||0, credit: parseFloat(l.cr)||0, sort_order: i,
      }));
      if (editing) {
        await updateJournalEntry(editing, { date:form.date, description:form.desc, ref:form.ref||null }, lines);
        setJournals(prev => prev.map(j => j.id===editing
          ? { ...j, date:form.date, description:form.desc, desc:form.desc, ref:form.ref, journal_lines:lines, lines }
          : j));
        setMsg('ok','Journal updated.');
      } else {
        const entry = await createJournalEntry(org.id, { date:form.date, description:form.desc, ref:form.ref||null, lines });
        setJournals(prev => [{ ...entry, journal_lines:lines, lines }, ...prev]);
        setMsg('ok','Journal posted.');
      }
      setForm(newForm()); setEditing(null); setShowForm(false);
    } catch(e) { setMsg('err', e.message); }
    finally { setSaving(false); }
  }

  async function voidJournal(j) {
    const reason = window.prompt('Reason for voiding this entry:');
    if (reason === null) return;
    try {
      await updateJournalEntry(j.id, { status:'void', void_reason: reason || 'Voided by user' }, null);
      setJournals(prev => prev.map(x => x.id===j.id ? { ...x, status:'void', void_reason:reason } : x));
      toast('Journal entry voided.');
    } catch(e) { toast('Error: '+e.message); }
  }

  const activeJournals = useMemo(() => journals.filter(j=>j.status!=='void'), [journals]);
  const manualJournals = useMemo(() => journals.filter(j=>j.source!=='auto_category'), [journals]);

  return (
    <div>
      {/* ── Tabs ── */}
      <div style={{ display:'flex', borderBottom:'0.5px solid var(--bd)', marginBottom:16 }}>
        {[['ledger','📒 General Ledger'],['entries','📋 Journal Entries']].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{ padding:'9px 16px', border:'none', background:'none', cursor:'pointer', fontSize:12.5, fontFamily:'var(--font-sans)',
              color:tab===t?'var(--ink)':'var(--stone)', fontWeight:tab===t?500:400,
              borderBottom:tab===t?'2px solid var(--a)':'2px solid transparent', marginBottom:-1 }}>
            {l}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8, paddingBottom:8 }}>
          <button className="btn btn-a btn-sm" onClick={()=>{ setForm(newForm()); setEditing(null); setShowForm(v=>!v); setNotice(null); }}>
            {showForm ? 'Cancel' : '+ New journal entry'}
          </button>
        </div>
      </div>

      {/* ── New / Edit form ── */}
      {showForm && (
        <div className="card" style={{ marginBottom:16 }}>
          <div className="ch">
            <h3>{editing ? 'Edit journal entry' : 'New journal entry'}</h3>
            {notice && (
              <span style={{ fontSize:12, padding:'3px 10px', borderRadius:99,
                background:notice.type==='ok'?'var(--gnb)':'var(--rdb)',
                color:notice.type==='ok'?'var(--gn)':'var(--rd)', fontWeight:500 }}>
                {notice.msg}
              </span>
            )}
          </div>
          <div style={{ padding:'12px 14px' }}>
            {/* Header row */}
            <div style={{ display:'grid', gridTemplateColumns:'140px 1fr 120px', gap:10, marginBottom:12 }}>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Date</label>
                <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} />
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Description</label>
                <input type="text" value={form.desc} placeholder="e.g. Loan repayment" onChange={e=>setForm(f=>({...f,desc:e.target.value}))} />
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Ref</label>
                <input type="text" value={form.ref} placeholder="INV-001" onChange={e=>setForm(f=>({...f,ref:e.target.value}))} />
              </div>
            </div>

            {/* Lines */}
            <div style={{ border:'0.5px solid var(--bd)', borderRadius:'var(--rr)', overflow:'hidden', marginBottom:8 }}>
              <div style={{ display:'grid', gridTemplateColumns:'36px 1fr 100px 100px 28px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)' }}>
                {['#','Account','Debit','Credit',''].map((h,i)=>(
                  <div key={i} style={{ padding:'5px 8px', fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:i>1?'right':'left' }}>{h}</div>
                ))}
              </div>
              {form.lines.map((l,i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'36px 1fr 100px 100px 28px', borderBottom:i<form.lines.length-1?'0.5px solid var(--bd)':'none', background:lineErrs[i]?'rgba(163,45,45,0.04)':i%2===0?'#FDFAF6':'var(--sand)' }}>
                  <div style={{ padding:'6px 8px', fontSize:11, color:'var(--stone)', display:'flex', alignItems:'center' }}>{i+1}</div>
                  <div style={{ padding:'4px 6px' }}>
                    <input list={`acct-list-${i}`} value={l.ac} onChange={e=>updLine(i,'ac',e.target.value)} placeholder="Account name"
                      style={{ width:'100%', padding:'4px 6px', fontSize:12, border:lineErrs[i]?'0.5px solid var(--rd)':'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)' }} />
                    <datalist id={`acct-list-${i}`}>{accountOptions.map(a=><option key={a} value={a}/>)}</datalist>
                  </div>
                  {['dr','cr'].map(field=>(
                    <div key={field} style={{ padding:'4px 6px' }}>
                      <input type="number" step="0.01" min="0" value={l[field]} onChange={e=>updLine(i,field,e.target.value)} placeholder="0.00"
                        style={{ width:'100%', padding:'4px 6px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', textAlign:'right', fontFamily:'var(--font-sans)', fontVariantNumeric:'tabular-nums' }} />
                    </div>
                  ))}
                  <div style={{ padding:'4px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <button onClick={()=>delLine(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--stone)', fontSize:15, padding:0, opacity:form.lines.length===1?0.3:1 }} disabled={form.lines.length===1}>×</button>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-sm" onClick={addLine} style={{ marginBottom:12 }}>+ Add line</button>

            {/* Balance check */}
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', background:'var(--sand)', borderRadius:'var(--rr)', marginBottom:12 }}>
              <span style={{ fontSize:12 }}>DR: <strong style={{ fontVariantNumeric:'tabular-nums' }}>{fmt(totalDr)}</strong></span>
              <span style={{ fontSize:12 }}>CR: <strong style={{ fontVariantNumeric:'tabular-nums' }}>{fmt(totalCr)}</strong></span>
              <span style={{ fontSize:12, marginLeft:'auto', padding:'2px 10px', borderRadius:99, fontWeight:600,
                background:balanced?'var(--gnb)':'var(--rdb)', color:balanced?'var(--gn)':'var(--rd)' }}>
                {balanced ? '✓ Balanced' : `Off by ${fmt(Math.abs(totalDr-totalCr))}`}
              </span>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-a" onClick={postEntry} disabled={saving || !balanced}>{saving?'Saving…':editing?'Update entry':'Post entry'}</button>
              <button className="btn" onClick={()=>{ setForm(newForm()); setEditing(null); setShowForm(false); setNotice(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── General Ledger tab ── */}
      {tab === 'ledger' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div className="ch">
            <h3>General Ledger</h3>
            <p>Consolidated account balances across all journal entries</p>
          </div>
          <GeneralLedger journals={activeJournals} catMap={catMap} txns={txns} />
        </div>
      )}

      {/* ── Journal Entries tab ── */}
      {tab === 'entries' && (
        <div className="card">
          <div className="ch">
            <h3>Journal entries</h3>
            <p>{activeJournals.length} active · {journals.filter(j=>j.status==='void').length} voided</p>
          </div>
          {journals.length === 0 ? (
            <div style={{ padding:'20px 14px', fontSize:12, color:'var(--stone)' }}>No entries posted yet.</div>
          ) : (
            <JournalList journals={journals} onEdit={loadForEdit} onVoid={voidJournal} />
          )}
        </div>
      )}
    </div>
  );
}
