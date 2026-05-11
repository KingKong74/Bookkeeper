/**
 * views/Banking/AddTransactionModal.jsx
 * ---------------------------------------
 * Proper modal form for manually adding a transaction.
 * Flags the transaction as manual (imported=false) and logs audit trail.
 */

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { createTransaction } from '../../lib/supabase';
import { upsertPayee } from '../../services/categoryService';
import { logAudit } from '../../lib/audit';

export function AddTransactionModal({ onClose }) {
  const { cats, payees, setPayees, setTxns, org, user, toast, PALETTE } = useApp();

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

  function validate() {
    const e = {};
    if (!form.date)  e.date = 'Date is required';
    if (!form.desc.trim()) e.desc = 'Description is required';
    const num = parseFloat(form.amt);
    if (isNaN(num) || num <= 0) e.amt = 'Enter a positive amount';
    return e;
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
              <label>Category</label>
              <select value={form.cat} onChange={e => f('cat', e.target.value)}>
                <option value="">Unallocated</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.l}</option>)}
              </select>
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
