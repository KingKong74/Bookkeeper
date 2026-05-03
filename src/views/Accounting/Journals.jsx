/**
 * views/Accounting/Journals.jsx
 * --------------------------------
 * Paper-style general journal with:
 *   - Post, edit, void entries
 *   - Link to bank account
 *   - Inline balance notifications (no alerts)
 *   - Journal transactions appear in Transactions list
 */

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { createJournalEntry, updateJournalEntry, createTransaction } from '../../lib/supabase';
import { fmt } from '../../utils/helpers';

const BLANK_LINE = { ac:'', dr:'', cr:'' };

function newForm() {
  return { date: new Date().toISOString().slice(0,10), desc:'', ref:'', account_id:'', lines:[{...BLANK_LINE}] };
}

export function Journals() {
  const { cats, journals, setJournals, accounts, org, user, toast, setTxns } = useApp();
  const [form,    setForm]    = useState(newForm());
  const [editing, setEditing] = useState(null);   // null | journal.id
  const [lineErrs, setLineErrs] = useState({});
  const [notice,   setNotice]  = useState(null);  // { type:'ok'|'err', msg }
  const [saving,   setSaving]  = useState(false);

  const accountOptions = [...new Set(cats.map(c => c.ac))];
  const totalDr  = form.lines.reduce((s,l) => s + (parseFloat(l.dr)||0), 0);
  const totalCr  = form.lines.reduce((s,l) => s + (parseFloat(l.cr)||0), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01 && totalDr > 0;

  function setMsg(type, msg) {
    setNotice({ type, msg });
    if (type === 'ok') setTimeout(() => setNotice(null), 3000);
  }

  function updLine(i, field, val) {
    setForm(f => ({ ...f, lines: f.lines.map((l,j) => j===i ? {...l,[field]:val} : l) }));
    setLineErrs(p => { const n={...p}; delete n[i]; return n; });
    setNotice(null);
  }

  function addLine()    { setForm(f => ({ ...f, lines: [...f.lines, {...BLANK_LINE}] })); }
  function delLine(i)   { if (form.lines.length > 1) setForm(f => ({ ...f, lines: f.lines.filter((_,j) => j!==i) })); }
  function resetForm()  { setForm(newForm()); setEditing(null); setLineErrs({}); setNotice(null); }

  function loadForEdit(j) {
    setForm({
      date:       j.date,
      desc:       j.desc,
      ref:        j.ref || '',
      account_id: j.account_id || '',
      lines:      j.lines.map(l => ({ ac: l.account_name||l.ac||'', dr: l.debit||l.dr||'', cr: l.credit||l.cr||'' })),
    });
    setEditing(j.id);
    setNotice(null);
    window.scrollTo({ top: 0, behavior:'smooth' });
  }

  async function postEntry() {
    const errs = {};
    form.lines.forEach((l,i) => { if (!l.ac) errs[i] = true; });
    if (!form.desc.trim()) { setMsg('err','Add a narration / description.'); return; }
    if (Object.keys(errs).length) { setLineErrs(errs); setMsg('err','All lines need an account.'); return; }
    if (!balanced) { setMsg('err',`Not balanced — DR ${fmt(totalDr)} ≠ CR ${fmt(totalCr)}`); return; }

    setSaving(true);
    try {
      const lines = form.lines.map((l,i) => ({
        account_name: l.ac, debit: parseFloat(l.dr)||0, credit: parseFloat(l.cr)||0, sort_order: i,
      }));

      if (editing) {
        // Update existing journal
        const updated = await updateJournalEntry(editing, {
          date:       form.date,
          description: form.desc,
          ref:         form.ref || null,
          account_id:  form.account_id || null,
        }, lines);
        setJournals(prev => prev.map(j => j.id === editing ? { ...j, ...updated, lines } : j));
        setMsg('ok', 'Journal entry updated ✓');
      } else {
        // Create new journal entry
        const entry = await createJournalEntry(org.id, {
          date: form.date, description: form.desc,
          ref: form.ref || null, account_id: form.account_id || null,
          lines,
        });
        setJournals(prev => [{ ...entry, lines }, ...prev]);

        // Create a corresponding transaction so it shows in Transactions list
        const netAmt = totalCr - totalDr; // net of the journal
        if (form.account_id && netAmt !== 0) {
          const txn = await createTransaction(org.id, {
            date:        form.date,
            description: `Journal: ${form.desc}`,
            amount:      netAmt,
            note:        form.ref || null,
            account_id:  form.account_id || null,
            journal_entry_id: entry.id,
            imported:    false,
          });
          setTxns(prev => [{
            ...txn, cat: null, desc: txn.description, amt: parseFloat(txn.amount),
            payee: '', note: txn.note || '',
          }, ...prev]);
        }
        setMsg('ok', 'Journal entry posted ✓');
      }
      resetForm();
    } catch(e) {
      setMsg('err', 'Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function voidJournal(j) {
    const reason = window.prompt('Reason for voiding this entry:');
    if (reason === null) return; // cancelled
    try {
      await updateJournalEntry(j.id, { status:'void', void_reason: reason || 'Voided by user' }, null);
      setJournals(prev => prev.map(x => x.id === j.id ? { ...x, status:'void', void_reason: reason } : x));
      // Remove linked transaction if any
      setTxns(prev => prev.filter(t => t.journal_entry_id !== j.id));
      toast('Journal entry voided.');
    } catch(e) { toast('Error: ' + e.message); }
  }

  return (
    <div>
      {/* ── Entry form ── */}
      <div style={{ background:'#FDFAF6', border:'0.5px solid var(--bd)', borderRadius:'var(--rl)', marginBottom:16, overflow:'hidden', boxShadow:'0 1px 4px rgba(42,36,32,0.06)' }}>
        {/* Header */}
        <div style={{ background:'var(--ink)', padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ color:'#F5F1EB', fontSize:13, fontWeight:500, letterSpacing:'0.02em' }}>
            GENERAL JOURNAL{editing ? ' — EDITING' : ''}
          </span>
          {editing && (
            <button onClick={resetForm} style={{ background:'rgba(255,255,255,0.12)', border:'none', color:'#F5F1EB', borderRadius:5, padding:'3px 10px', cursor:'pointer', fontSize:11 }}>
              Cancel edit
            </button>
          )}
        </div>

        <div style={{ padding:'16px 20px' }}>
          {/* Meta row */}
          <div style={{ display:'grid', gridTemplateColumns:'140px 1fr 130px 180px', gap:12, marginBottom:16, alignItems:'end' }}>
            <div>
              <div style={{ fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Date</div>
              <input type="date" value={form.date} onChange={e => setForm(f=>({...f,date:e.target.value}))} style={{ width:'100%', padding:'6px 9px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)' }} />
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Narration</div>
              <input type="text" value={form.desc} onChange={e => { setForm(f=>({...f,desc:e.target.value})); setNotice(null); }}
                placeholder="e.g. Depreciation of office equipment"
                style={{ width:'100%', padding:'6px 9px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)', borderColor: notice?.type==='err' && !form.desc.trim() ? 'var(--rd)' : '' }} />
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Reference</div>
              <input type="text" value={form.ref} onChange={e => setForm(f=>({...f,ref:e.target.value}))} placeholder="e.g. INV-001"
                style={{ width:'100%', padding:'6px 9px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)' }} />
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Post to account</div>
              <select value={form.account_id} onChange={e => setForm(f=>({...f,account_id:e.target.value}))}
                style={{ width:'100%', padding:'6px 9px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)' }}>
                <option value="">— None —</option>
                {(accounts||[]).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          {/* Lines table */}
          <div style={{ border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'36px 1fr 100px 100px 28px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd2)' }}>
              {['#','Account','Dr ($)','Cr ($)',''].map((h,i) => (
                <div key={i} style={{ padding:'6px 10px', fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:i>=2&&i<4?'right':'left' }}>{h}</div>
              ))}
            </div>

            {form.lines.map((l,i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'36px 1fr 100px 100px 28px', borderBottom:i<form.lines.length-1?'0.5px solid var(--bd)':'none', background:lineErrs[i]?'rgba(163,45,45,0.04)':'transparent' }}>
                <div style={{ padding:'8px 10px', fontSize:11, color:'var(--stone)', display:'flex', alignItems:'center' }}>{i+1}</div>
                <div style={{ padding:'4px 6px', display:'flex', alignItems:'center', gap:4 }}>
                  <select value={l.ac} onChange={e => updLine(i,'ac',e.target.value)}
                    style={{ width:'100%', padding:'5px 8px', fontSize:12, border:lineErrs[i]?'0.5px solid var(--rd)':'0.5px solid transparent', borderRadius:'var(--rr)', background:'transparent', fontFamily:'var(--font-sans)', cursor:'pointer' }}>
                    <option value="">— Select account —</option>
                    {accountOptions.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  {lineErrs[i] && <span style={{ color:'var(--rd)', fontSize:14, flexShrink:0, animation:'blink 0.8s step-end infinite' }}>●</span>}
                </div>
                <div style={{ padding:'4px 6px' }}>
                  <input type="number" placeholder="—" value={l.dr} min="0" step="0.01" onChange={e => updLine(i,'dr',e.target.value)}
                    style={{ width:'100%', padding:'5px 8px', fontSize:12, border:'0.5px solid transparent', borderRadius:'var(--rr)', background:'transparent', textAlign:'right', fontFamily:'var(--font-sans)', color:parseFloat(l.dr)>0?'var(--ink)':'var(--stone)' }} />
                </div>
                <div style={{ padding:'4px 6px' }}>
                  <input type="number" placeholder="—" value={l.cr} min="0" step="0.01" onChange={e => updLine(i,'cr',e.target.value)}
                    style={{ width:'100%', padding:'5px 8px', fontSize:12, border:'0.5px solid transparent', borderRadius:'var(--rr)', background:'transparent', textAlign:'right', fontFamily:'var(--font-sans)', color:parseFloat(l.cr)>0?'var(--ink)':'var(--stone)' }} />
                </div>
                <div style={{ padding:'4px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <button onClick={() => delLine(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--stone)', fontSize:15, padding:0, opacity:form.lines.length===1?0.3:1 }} disabled={form.lines.length===1}>×</button>
                </div>
              </div>
            ))}

            {/* Totals */}
            <div style={{ display:'grid', gridTemplateColumns:'36px 1fr 100px 100px 28px', background:'var(--sand)', borderTop:'0.5px solid var(--bd2)' }}>
              <div /><div style={{ padding:'7px 10px', fontSize:12, fontWeight:500 }}>Totals</div>
              <div style={{ padding:'7px 10px', fontSize:12, fontWeight:500, textAlign:'right', color:totalDr>0&&!balanced?'var(--rd)':'var(--ink)' }}>{totalDr>0?fmt(totalDr):'—'}</div>
              <div style={{ padding:'7px 10px', fontSize:12, fontWeight:500, textAlign:'right', color:totalCr>0&&!balanced?'var(--rd)':'var(--ink)' }}>{totalCr>0?fmt(totalCr):'—'}</div>
              <div />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:12 }}>
            <button className="btn btn-sm" onClick={addLine}>+ Add line</button>
            {/* Inline notification */}
            <div style={{ flex:1, textAlign:'center', fontSize:12, padding:'0 16px', color:notice?.type==='err'?'var(--rd)':'#3B6D11', fontWeight:notice?500:400, minHeight:20 }}>
              {notice?.msg}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {totalDr > 0 && (
                <span style={{ fontSize:11, padding:'3px 10px', borderRadius:99, fontWeight:500, background:balanced?'#EAF3DE':'#FCEBEB', color:balanced?'#27500A':'#A32D2D' }}>
                  {balanced ? '✓ Balanced' : 'Unbalanced'}
                </span>
              )}
              <button className="btn btn-a" onClick={postEntry} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Post entry'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Posted entries ── */}
      <div className="card">
        <div className="ch"><h3>Posted journal entries</h3><p>{journals.filter(j=>j.status!=='void').length} active · {journals.filter(j=>j.status==='void').length} voided</p></div>
        {journals.length === 0 ? (
          <div style={{ padding:'20px 14px', fontSize:12, color:'var(--stone)' }}>No entries posted yet.</div>
        ) : (
          journals.map(j => (
            <div key={j.id} style={{ borderBottom:'0.5px solid var(--bd)', opacity:j.status==='void'?0.5:1 }}>
              <div style={{ padding:'12px 16px 8px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontWeight:500, fontSize:12.5 }}>{j.desc}</span>
                    {j.ref && <span style={{ fontSize:11, color:'var(--stone)', background:'var(--sand2)', padding:'1px 7px', borderRadius:99 }}>{j.ref}</span>}
                    {j.status==='void' && <span style={{ fontSize:11, background:'var(--rdb)', color:'var(--rd)', padding:'1px 7px', borderRadius:99, fontWeight:500 }}>VOID</span>}
                  </div>
                  <div style={{ fontSize:11, color:'var(--stone)', marginTop:2 }}>
                    {j.date}{j.void_reason && ` · Reason: ${j.void_reason}`}
                  </div>
                </div>
                {j.status !== 'void' && (
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-sm" style={{ fontSize:11 }} onClick={() => loadForEdit(j)}>Edit</button>
                    <button className="btn btn-sm" style={{ fontSize:11, color:'var(--rd)' }} onClick={() => voidJournal(j)}>Void</button>
                  </div>
                )}
              </div>
              <div style={{ margin:'0 16px 12px', border:'0.5px solid var(--bd)', borderRadius:'var(--rr)', overflow:'hidden' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', background:'var(--sand)' }}>
                  {['Account','Debit','Credit'].map((h,i) => (
                    <div key={i} style={{ padding:'4px 10px', fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:i>0?'right':'left' }}>{h}</div>
                  ))}
                </div>
                {(j.journal_lines||j.lines||[]).map((l,i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', borderTop:'0.5px solid var(--bd)' }}>
                    <div style={{ padding:'5px 10px', fontSize:12 }}>{l.account_name||l.ac||'—'}</div>
                    <div style={{ padding:'5px 10px', fontSize:12, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{parseFloat(l.debit||l.dr)>0?fmt(parseFloat(l.debit||l.dr)):'—'}</div>
                    <div style={{ padding:'5px 10px', fontSize:12, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{parseFloat(l.credit||l.cr)>0?fmt(parseFloat(l.credit||l.cr)):'—'}</div>
                  </div>
                ))}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', borderTop:'0.5px solid var(--bd2)', background:'var(--sand)' }}>
                  <div style={{ padding:'5px 10px', fontSize:12, fontWeight:500 }}>Total</div>
                  <div style={{ padding:'5px 10px', fontSize:12, fontWeight:500, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt((j.journal_lines||j.lines||[]).reduce((s,l)=>s+(parseFloat(l.debit||l.dr)||0),0))}</div>
                  <div style={{ padding:'5px 10px', fontSize:12, fontWeight:500, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt((j.journal_lines||j.lines||[]).reduce((s,l)=>s+(parseFloat(l.credit||l.cr)||0),0))}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
