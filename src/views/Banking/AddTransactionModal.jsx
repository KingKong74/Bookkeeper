/**
 * views/Banking/AddTransactionModal.jsx
 * ---------------------------------------
 * Proper modal form for manually adding a transaction.
 * Flags the transaction as manual (imported=false) and logs audit trail.
 */

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { createTransaction, upsertPayee } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';

export function AddTransactionModal({ onClose }) {
  const { cats, setCats, payees, setPayees, setTxns, org, user, toast, PALETTE } = useApp();

  const [form, setForm] = useState({
    date:   new Date().toISOString().slice(0, 10),
    desc:   '',
    amt:    '',
    cat:    '',
    payee:  '',
    note:   '',
    type:   'expense', // 'income' | 'expense' — controls sign
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [showNewCat,  setShowNewCat]  = useState(false);
  const [newCatName,  setNewCatName]  = useState('');
  const [newCatType,  setNewCatType]  = useState('expense');
  const [newCatCode,  setNewCatCode]  = useState('');
  const [savingCat,   setSavingCat]   = useState(false);

  // Auto-suggest code: considers type range + alphabetical position of label
  function suggestCode(type, label) {
    const TYPE_RANGES = { asset:[100,399], liability:[400,599], equity:[600,699], income:[700,799], expense:[800,998] };
    const [lo, hi] = TYPE_RANGES[type] || [800,998];
    const used = new Set((cats||[]).filter(c=>c.code&&!c.code.includes('/')).map(c=>parseInt(c.code)).filter(n=>!isNaN(n)));
    if (!label?.trim()) {
      for (let n=lo; n<=hi; n++) { if (!used.has(n)) return String(n); }
      return '';
    }
    const peers = (cats||[])
      .filter(c=>c.t===type && c.is_active!==false && c.code && !c.code.includes('/'))
      .sort((a,b)=>(a.l||'').localeCompare(b.l||''));
    const newLabel = label.trim().toLowerCase();
    const insertIdx = peers.findIndex(p=>(p.l||'').toLowerCase()>newLabel);
    const insertPos = insertIdx===-1 ? peers.length : insertIdx;
    const rangeSize = hi-lo+1;
    const totalPeers = peers.length+1;
    const idealNum = lo+Math.round((insertPos/totalPeers)*rangeSize);
    for (let delta=0; delta<=rangeSize; delta++) {
      if (!used.has(idealNum+delta) && idealNum+delta<=hi) return String(idealNum+delta);
      if (!used.has(idealNum-delta) && idealNum-delta>=lo) return String(idealNum-delta);
    }
    return '';
  }

  function validate() {
    const e = {};
    if (!form.date)  e.date = 'Date is required';
    if (!form.desc.trim()) e.desc = 'Description is required';
    const num = parseFloat(form.amt);
    if (isNaN(num) || num <= 0) e.amt = 'Enter a positive amount';
    return e;
  }

  async function saveNewCat() {
    if (!newCatName.trim()) { toast('Account name is required.'); return; }
    if (!newCatCode.trim()) { toast('Account code is required.'); return; }
    const codeConflict = (cats||[]).find(x => x.code === newCatCode.trim() && x.l);
    if (codeConflict) { toast(`Code ${newCatCode} is already used by "${codeConflict.l}".`); return; }
    setSavingCat(true);
    try {
      const { createCategory, createCategoryWithCode } = await import('../../lib/supabase');
      const payload = { label:newCatName.trim(), type:newCatType, account_group:newCatName.trim(), colour:PALETTE[(cats||[]).length%PALETTE.length], sort_order:parseInt(newCatCode)||0 };
      const created = await createCategoryWithCode(org.id, { ...payload, code:newCatCode.trim() });
      const norm = { ...created, l:created.label, t:created.type, col:created.colour, ac:created.account_group, code:created.code||null };
      setCats(prev => [...(prev||[]), norm]);
      f('cat', created.id);
      setShowNewCat(false);
      setNewCatName('');
    } catch(e) { toast('Error: '+e.message); }
    setSavingCat(false);
  }

  async function handleSave() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);

    try {
      const rawAmt = parseFloat(form.amt);
      // Apply sign based on income/expense toggle
      const amount = form.type === 'expense' ? -Math.abs(rawAmt) : Math.abs(rawAmt);

      // Resolve payee
      let payeeId = null;
      if (form.payee.trim()) {
        const existing = payees.find(p => p.name.toLowerCase() === form.payee.toLowerCase());
        if (existing) {
          payeeId = existing.id;
        } else {
          const col  = PALETTE[payees.length % PALETTE.length];
          const newP = await upsertPayee(org.id, form.payee.trim(), col);
          setPayees(prev => [...prev, newP]);
          payeeId = newP.id;
        }
      }

      const created = await createTransaction(org.id, {
        date:        form.date,
        description: form.desc.trim(),
        amount,
        note:        form.note.trim() || null,
        category_id: form.cat || null,
        payee_id:    payeeId,
        imported:    false,   // ← flags as manual entry
      });

      // Normalise for local state
      const normalised = {
        ...created,
        cat:    created.category_id ?? null,
        desc:   created.description,
        amt:    parseFloat(created.amount),
        payee:  form.payee.trim(),
        note:   created.note ?? '',
        imported: false,
      };

      setTxns(prev => [normalised, ...prev]);

      await logAudit({
        orgId: org.id, userId: user?.id,
        transaction: normalised,
        action: 'created',
        note: 'Manual entry',
      });

      toast('Transaction added.');
      onClose();
    } catch (e) {
      toast('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function f(key, val) { setForm(prev => ({ ...prev, [key]: val })); setErrors(prev => ({ ...prev, [key]: null })); }

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal" style={{ width: 440 }} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Add transaction</h3>
            <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 2 }}>
              Manual entries are flagged with an <span style={{ background:'var(--al)', color:'var(--a2)', padding:'0 4px', borderRadius:3, fontWeight:600, fontSize:10 }}>M</span> badge
            </p>
          </div>
          <button className="btn-ghost" style={{ padding:0, fontSize:16 }} onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Income / Expense toggle */}
          <div className="field">
            <label>Type</label>
            <div style={{ display:'flex', gap:0, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', overflow:'hidden' }}>
              {['expense','income'].map(type => (
                <button
                  key={type}
                  onClick={() => f('type', type)}
                  style={{
                    flex:1, padding:'7px 0', border:'none', cursor:'pointer',
                    fontFamily:'var(--font-sans)', fontSize:12.5,
                    background: form.type === type
                      ? (type === 'income' ? '#EAF3DE' : '#FCEBEB')
                      : 'var(--sand)',
                    color: form.type === type
                      ? (type === 'income' ? '#27500A' : '#A32D2D')
                      : 'var(--stone)',
                    fontWeight: form.type === type ? 500 : 400,
                  }}
                >
                  {type === 'income' ? '↑ Income' : '↓ Expense'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="field">
              <label>Date {errors.date && <span style={{ color:'var(--rd)', fontWeight:400 }}>— {errors.date}</span>}</label>
              <input type="date" value={form.date} onChange={e => f('date', e.target.value)}
                style={{ borderColor: errors.date ? 'var(--rd)' : '' }} />
            </div>
            <div className="field">
              <label>Amount {errors.amt && <span style={{ color:'var(--rd)', fontWeight:400 }}>— {errors.amt}</span>}</label>
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--stone)', fontSize:13 }}>$</span>
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={form.amt} onChange={e => f('amt', e.target.value)}
                  style={{ paddingLeft:22, borderColor: errors.amt ? 'var(--rd)' : '' }}
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label>Description {errors.desc && <span style={{ color:'var(--rd)', fontWeight:400 }}>— {errors.desc}</span>}</label>
            <input type="text" placeholder="e.g. Woolworths groceries" value={form.desc}
              onChange={e => f('desc', e.target.value)}
              style={{ borderColor: errors.desc ? 'var(--rd)' : '' }} />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="field">
              <label>Account</label>
              {showNewCat ? (
                <div style={{ border:'0.5px solid var(--a)', borderRadius:'var(--rr)', padding:'8px 10px', background:'var(--ab)' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'80px 1fr', gap:8, marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:10, color:'var(--stone)', marginBottom:3 }}>Code <span style={{ color:'var(--rd)' }}>*</span></div>
                      <input value={newCatCode} onChange={e=>setNewCatCode(e.target.value)}
                        style={{ width:'100%', fontFamily:'monospace', fontSize:12, padding:'3px 6px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)' }}
                        placeholder="e.g. 820" />
                    </div>
                    <div>
                      <div style={{ fontSize:10, color:'var(--stone)', marginBottom:3 }}>Name</div>
                      <input autoFocus value={newCatName} onChange={e=>{
                          setNewCatName(e.target.value);
                          // Re-suggest code as name changes (alphabetical slot)
                          if (!newCatCode || newCatCode === suggestCode(newCatType)) {
                            setNewCatCode(suggestCode(newCatType, e.target.value));
                          }
                        }}
                        onKeyDown={e=>{ if(e.key==='Enter') saveNewCat(); if(e.key==='Escape') setShowNewCat(false); }}
                        placeholder="Account name…"
                        style={{ width:'100%', fontSize:12, padding:'3px 6px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)' }} />
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <select value={newCatType}
                      onChange={e=>{ const t=e.target.value; setNewCatType(t); setNewCatCode(suggestCode(t)); }}
                      style={{ fontSize:11.5, padding:'3px 6px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', flex:1 }}>
                      {[['expense','Expense'],['income','Income'],['asset','Asset'],['liability','Liability'],['equity','Equity']].map(([v,l])=>(
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <button className="btn btn-a btn-sm" disabled={!newCatName.trim()||savingCat} onClick={saveNewCat} style={{ fontSize:11 }}>
                      {savingCat?'…':'Create account'}
                    </button>
                    <button className="btn btn-sm" onClick={()=>setShowNewCat(false)} style={{ fontSize:11 }}>✕</button>
                  </div>
                </div>
              ) : (
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <select value={form.cat} onChange={e=>f('cat',e.target.value)} style={{ flex:1 }}>
                    <option value="">Unallocated</option>
                    {['asset','liability','equity','income','expense'].map(type => {
                      const group = (cats||[]).filter(c=>c.t===type).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
                      if (!group.length) return null;
                      return <optgroup key={type} label={{asset:'Assets',liability:'Liabilities',equity:'Equity',income:'Revenue',expense:'Expenses'}[type]}>
                        {group.map(c=><option key={c.id} value={c.id}>{c.code?`${c.code} · `:''}{c.l}</option>)}
                      </optgroup>;
                    })}
                  </select>
                  <button className="btn btn-sm" style={{ fontSize:11, flexShrink:0 }}
                onClick={()=>{ const t=form.type==='income'?'income':'expense'; setNewCatType(t); setNewCatCode(suggestCode(t)); setNewCatName(''); setShowNewCat(true); }}>
                    + New
                  </button>
                </div>
              )}
            </div>
            <div className="field">
              <label>Payee</label>
              <input type="text" list="add-payee-list" value={form.payee}
                placeholder="e.g. Woolworths"
                onChange={e => f('payee', e.target.value)} />
              <datalist id="add-payee-list">
                {payees.map(p => <option key={p.id} value={p.name} />)}
              </datalist>
            </div>
          </div>

          <div className="field">
            <label>Personal note <span style={{ color:'var(--stone)', fontWeight:400 }}>(optional)</span></label>
            <textarea placeholder="e.g. Monthly rent — March" value={form.note}
              onChange={e => f('note', e.target.value)} style={{ minHeight:56 }} />
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-a" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Add transaction'}
          </button>
        </div>
      </div>
    </div>
  );
}
