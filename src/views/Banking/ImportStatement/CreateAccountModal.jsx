/**
 * views/Banking/ImportStatement/CreateAccountModal.jsx
 * Modal shown when user clicks Import without selecting a bank account.
 * Lets them pick an existing account or create a new one inline.
 */
import React, { useState } from 'react';

const COLOURS = ['#185FA5','#BA7517','#3B6D11','#A32D2D','#6B48B5','#1A7A6B','#B5481A','#1A4D7A'];

export function CreateAccountModal({ accounts, selectedAccount, setSelectedAccount, onClose, onImportExisting, onCreate }) {
  const [form, setForm]   = useState({ name: '', type: 'checking', colour: '#185FA5' });
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onCreate(form); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Link to a bank account</h3>
          <button className="btn-ghost" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 16 }}>
            Select an existing account or create a new one to link these transactions.
          </p>

          {accounts.length > 0 && (
            <div className="field">
              <label>Use existing account</label>
              <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '0.5px solid var(--bd2)', borderRadius: 'var(--rr)' }}>
                <option value="">— choose —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type.replace('_', ' ')})</option>)}
              </select>
              {selectedAccount && (
                <button className="btn btn-a" style={{ marginTop: 8, width: '100%' }} onClick={onImportExisting}>
                  Import to {accounts.find(a => a.id === selectedAccount)?.name}
                </button>
              )}
              <div style={{ textAlign: 'center', margin: '14px 0', fontSize: 11, color: 'var(--stone)' }}>— or create a new one —</div>
            </div>
          )}

          <div className="field">
            <label>Account name</label>
            <input type="text" placeholder="e.g. ANZ Everyday" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="field">
            <label>Account type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit_card">Credit card</option>
              <option value="loan">Loan</option>
              <option value="investment">Investment</option>
            </select>
          </div>
          <div className="field">
            <label>Colour</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLOURS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, colour: c }))}
                  style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: form.colour === c ? '3px solid var(--ink)' : '2px solid transparent', cursor: 'pointer' }} />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-a" onClick={handleCreate} disabled={saving || !form.name.trim()}>
            {saving ? 'Creating…' : 'Create & Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
