/**
 * views/Banking/TransactionModal.jsx
 * ------------------------------------
 * Transaction detail/edit modal with Details and Audit Trail tabs.
 * Also exports CategoryDropdown and PayeeDropdown.
 *
 * Fix: all hooks must be called unconditionally (no early return before hooks).
 */

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { updateTransaction, upsertPayee, getTransactionFiles, uploadTransactionFile, deleteTransactionFile, getFileUrl } from '../../lib/supabase';
import { logAudit, getAuditTrail, describeChange, formatAuditDate } from '../../lib/audit';
import { fmt, payeeColor } from '../../utils/helpers';


// ── Searchable select (category / account) ───────────────────────────────────
function SearchSelect({ label, value, onChange, options, placeholder = 'Search…', emptyLabel = '— None —' }) {
  const [q,    setQ]    = useState('');
  const [open, setOpen] = useState(false);
  const ref             = useRef(null);

  const selected = options.find(o => o.value === value);
  const filtered = q.trim()
    ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;

  // Group by `group` property if present
  const groups = {};
  filtered.forEach(o => {
    const g = o.group || '';
    if (!groups[g]) groups[g] = [];
    groups[g].push(o);
  });

  useEffect(() => {
    function down(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);

  function pick(val) { onChange(val); setQ(''); setOpen(false); }

  return (
    <div className="field" ref={ref}>
      <label>{label}</label>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'6px 9px', fontSize:12.5, border:'0.5px solid var(--bd2)',
          borderRadius:'var(--rr)', background:'#FDFAF6', cursor:'pointer',
          userSelect:'none', color: selected ? 'var(--ink)' : 'var(--stone)',
        }}
      >
        <span style={{ display:'flex', alignItems:'center', gap:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {selected?.dot && <span style={{ width:8, height:8, borderRadius:'50%', background:selected.dot, flexShrink:0, display:'inline-block' }} />}
          {selected?.label || emptyLabel}
        </span>
        <span style={{ fontSize:10, color:'var(--stone)', flexShrink:0, marginLeft:6 }}>▾</span>
      </div>

      {open && (
        <div style={{
          position:'absolute', zIndex:800, background:'#FDFAF6',
          border:'0.5px solid var(--bd2)', borderRadius:'var(--rl)',
          boxShadow:'0 6px 20px rgba(42,36,32,0.14)',
          width:'100%', maxHeight:260, display:'flex', flexDirection:'column',
          marginTop:2,
        }}>
          <div style={{ padding:6, borderBottom:'0.5px solid var(--bd)', flexShrink:0 }}>
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={placeholder}
              onClick={e => e.stopPropagation()}
              style={{
                width:'100%', padding:'5px 9px', fontSize:12.5,
                border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)',
                background:'var(--sand)', fontFamily:'var(--font-sans)',
              }}
            />
          </div>
          <div style={{ overflowY:'auto', flex:1 }}>
            <div
              onClick={() => pick('')}
              style={{ padding:'7px 12px', fontSize:12, color:'var(--stone)', cursor:'pointer', borderBottom:'0.5px solid var(--bd)' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--sand)'}
              onMouseLeave={e => e.currentTarget.style.background=''}
            >{emptyLabel}</div>

            {Object.entries(groups).map(([group, items]) => (
              <React.Fragment key={group}>
                {group && (
                  <div style={{ padding:'4px 12px 2px', fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', background:'var(--sand)', borderTop:'0.5px solid var(--bd)' }}>
                    {group}
                  </div>
                )}
                {items.map(o => (
                  <div
                    key={o.value}
                    onClick={() => pick(o.value)}
                    style={{ padding:'7px 12px', fontSize:12.5, cursor:'pointer', display:'flex', alignItems:'center', gap:7, fontWeight: o.value===value ? 500 : 400, background: o.value===value ? 'var(--al)' : '' }}
                    onMouseEnter={e => { if (o.value!==value) e.currentTarget.style.background='var(--sand)'; }}
                    onMouseLeave={e => { if (o.value!==value) e.currentTarget.style.background=''; }}
                  >
                    {o.dot && <span style={{ width:8, height:8, borderRadius:'50%', background:o.dot, flexShrink:0, display:'inline-block' }} />}
                    {o.icon && <span style={{ flexShrink:0 }}>{o.icon}</span>}
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.label}</span>
                    {o.value===value && <span style={{ marginLeft:'auto', fontSize:10, color:'var(--a)', flexShrink:0 }}>✓</span>}
                  </div>
                ))}
              </React.Fragment>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding:'12px', fontSize:12, color:'var(--stone)', textAlign:'center' }}>No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Payee field with add-new popup ────────────────────────────────────────────
function PayeeField({ value, onChange, payees, onAddPayee, PALETTE }) {
  const [q,         setQ]         = useState('');
  const [open,      setOpen]      = useState(false);
  const [showAdd,   setShowAdd]   = useState(false);
  const [newName,   setNewName]   = useState('');
  const [adding,    setAdding]    = useState(false);
  const ref = useRef(null);

  const filtered = q.trim()
    ? payees.filter(p => p.name.toLowerCase().includes(q.toLowerCase()))
    : payees;

  const exactMatch = payees.some(p => p.name.toLowerCase() === q.toLowerCase());
  const showNewBtn = q.trim().length > 1 && !exactMatch;

  useEffect(() => {
    function down(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); } }
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);

  function pick(name) { onChange(name); setQ(''); setOpen(false); }

  async function confirmAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    await onAddPayee(newName.trim());
    pick(newName.trim());
    setNewName('');
    setShowAdd(false);
    setAdding(false);
  }

  return (
    <div className="field" ref={ref} style={{ position:'relative' }}>
      <label>Payee</label>
      <div style={{ position:'relative' }}>
        <input
          value={open ? q : (value || '')}
          placeholder="Search or type payee…"
          onFocus={() => { setOpen(true); setQ(value || ''); }}
          onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
          style={{ width:'100%', padding:'6px 9px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', color:'var(--ink)', fontFamily:'var(--font-sans)' }}
        />
        {value && (
          <button onClick={() => { onChange(''); setQ(''); }}
            style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--stone)', fontSize:14, padding:0, lineHeight:1 }}>×</button>
        )}
      </div>

      {open && (filtered.length > 0 || showNewBtn) && (
        <div style={{ position:'absolute', zIndex:800, background:'#FDFAF6', border:'0.5px solid var(--bd2)', borderRadius:'var(--rl)', boxShadow:'0 6px 20px rgba(42,36,32,0.14)', width:'100%', maxHeight:200, overflowY:'auto', marginTop:2 }}>
          {filtered.map(p => (
            <div key={p.id} onMouseDown={() => pick(p.name)}
              style={{ padding:'7px 12px', fontSize:12.5, cursor:'pointer', display:'flex', alignItems:'center', gap:8, fontWeight: p.name===value?500:400 }}
              onMouseEnter={e => e.currentTarget.style.background='var(--sand)'}
              onMouseLeave={e => e.currentTarget.style.background=''}>
              <span style={{ width:24, height:24, borderRadius:'50%', background:p.colour||'#888', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#fff', fontWeight:600, flexShrink:0 }}>
                {p.name[0].toUpperCase()}
              </span>
              {p.name}
              {p.name===value && <span style={{ marginLeft:'auto', fontSize:10, color:'var(--a)' }}>✓</span>}
            </div>
          ))}
          {showNewBtn && (
            <div onMouseDown={() => { setNewName(q); setOpen(false); setShowAdd(true); }}
              style={{ padding:'7px 12px', fontSize:12.5, cursor:'pointer', color:'var(--a)', borderTop:'0.5px solid var(--bd)', fontWeight:500 }}
              onMouseEnter={e => e.currentTarget.style.background='var(--sand)'}
              onMouseLeave={e => e.currentTarget.style.background=''}>
              + Add "{q}" as new payee
            </div>
          )}
        </div>
      )}

      {/* Add new payee popup */}
      {showAdd && (
        <div className="modal-bg" onClick={() => setShowAdd(false)} style={{ zIndex:900 }}>
          <div className="modal" style={{ width:340 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Add new payee</h3>
              <button className="btn-ghost" style={{ padding:0, fontSize:16 }} onClick={() => setShowAdd(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Payee name</label>
                <input type="text" autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter') confirmAdd(); }}
                  placeholder="e.g. Woolworths" />
              </div>
              <p style={{ fontSize:12, color:'var(--stone)', marginTop:4 }}>
                This payee will be saved to your organisation and available across all transactions.
              </p>
            </div>
            <div className="modal-foot" style={{ justifyContent:'space-between' }}>
              <button className="btn btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-a btn-sm" onClick={confirmAdd} disabled={!newName.trim() || adding}>
                {adding ? 'Adding…' : 'Add payee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Transaction detail / edit modal ──────────────────────────────────────────
export function TransactionModal({ txnId, onClose }) {
  const { txns, setTxns, cats, catMap, payees, setPayees, accounts, org, user, toast, PALETTE } = useApp();
  const acctList = accounts || [];

  // Build category options for SearchSelect (grouped by type)
  const CAT_TYPE_ORDER  = ['income','expense','asset','liability','equity'];
  const CAT_TYPE_LABELS = { income:'Income', expense:'Expenses', asset:'Assets', liability:'Liabilities', equity:'Equity' };
  const catOptions = (cats||[]).map(cat => ({
    value: cat.id,
    label: cat.l,
    dot:   cat.col,
    group: CAT_TYPE_LABELS[cat.t] || cat.t,
  }));

  // Build account options for SearchSelect
  const ACCT_ICON = { checking:'🏦', savings:'💰', credit_card:'💳', loan:'📋', investment:'📈' };
  const acctOptions = acctList.map(a => ({
    value: a.id,
    label: a.name,
    icon:  ACCT_ICON[a.type] || '🏦',
    group: a.type === 'credit_card' || a.type === 'loan' ? 'Liabilities' : 'Assets',
  }));

  // Add new payee handler
  async function handleAddPayee(name) {
    try {
      const col = (PALETTE||[])[payees.length % (PALETTE||['#888']).length] || '#888';
      const p   = await upsertPayee(org.id, name, col);
      setPayees(prev => {
        const exists = prev.find(x => x.id === p.id);
        return exists ? prev : [...prev, p];
      });
    } catch(e) { toast('Could not add payee: ' + e.message); }
  }

  // ── ALL hooks first — no early returns before this block ─────────────────
  const [tab,          setTab]          = useState('details');
  const [auditLog,     setAuditLog]     = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [files,        setFiles]        = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading,    setUploading]    = useState(false);

  // Find the transaction — may be null if id is stale
  const txn = txns.find(t => t.id === txnId) ?? null;

  // Form state — always initialise (Rules of Hooks: no conditional hooks)
  const [form, setForm] = useState({
    date:  txn?.date  ?? '',
    desc:  txn?.desc  ?? '',
    note:  txn?.note  ?? '',
    payee: txn?.payee ?? '',
    cat:        txn?.cat        ?? '',
    amt:        txn?.amt        ?? 0,
    account_id: txn?.account_id ?? '',
  });

  // Sync form if txn loads after mount (e.g. context refresh)
  useEffect(() => {
    if (txn) {
      setForm({
        date:         txn.date,
        desc:         txn.desc       ?? '',
        note:         txn.note       ?? '',
        payee:        txn.payee      ?? '',
        cat:          txn.cat        ?? '',
        amt:          txn.amt        ?? 0,
        account_id:   txn.account_id ?? '',
      });
    }
  }, [txnId]); // eslint-disable-line

  // Load audit trail when tab switches
  useEffect(() => {
    if (tab === 'files' && txnId) {
      setFilesLoading(true);
      getTransactionFiles(txnId)
        .then(setFiles)
        .catch(e => console.warn('Files load failed:', e))
        .finally(() => setFilesLoading(false));
    }
    if (tab === 'audit' && txnId) {
      setAuditLoading(true);
      getAuditTrail(txnId)
        .then(setAuditLog)
        .catch(e => console.warn('Audit load failed:', e))
        .finally(() => setAuditLoading(false));
    }
  }, [tab, txnId]);

  // ── Now safe to early-return if txn not found ─────────────────────────────
  if (!txn) return null;

  // ── Save handler ──────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    const changedFields = {};

    if (form.date  !== txn.date)        changedFields.date        = { from: txn.date, to: form.date };
    if (form.desc  !== txn.desc)        changedFields.description = { from: txn.desc, to: form.desc };
    if (form.note  !== (txn.note||''))  changedFields.note        = { from: txn.note||'', to: form.note };
    if (form.cat   !== (txn.cat||''))   changedFields.category    = {
      from: txn.cat  ? (catMap[txn.cat]?.l  ?? txn.cat)  : 'Unallocated',
      to:   form.cat ? (catMap[form.cat]?.l ?? form.cat) : 'Unallocated',
    };
    if (String(form.amt) !== String(txn.amt)) changedFields.amount = { from: txn.amt, to: form.amt };

    const updates = {
      date:        form.date,
      description: form.desc,
      note:        form.note || null,
      amount:      parseFloat(form.amt) || txn.amt,
      category_id: form.cat || null,
      account_id:  form.account_id || null,
    };

    // Resolve payee
    if (form.payee.trim()) {
      const existing = payees.find(p => p.name.toLowerCase() === form.payee.toLowerCase());
      if (existing) {
        updates.payee_id = existing.id;
        if (form.payee !== txn.payee) changedFields.payee = { from: txn.payee||'None', to: form.payee };
      } else {
        const col  = PALETTE[payees.length % PALETTE.length];
        const newP = await upsertPayee(org.id, form.payee.trim(), col);
        setPayees(prev => [...prev, newP]);
        updates.payee_id = newP.id;
        changedFields.payee = { from: txn.payee||'None', to: form.payee };
      }
    } else if (txn.payee) {
      updates.payee_id = null;
      changedFields.payee = { from: txn.payee, to: 'None' };
    }

    try {
      await updateTransaction(txnId, updates);
      setTxns(prev => prev.map(t => t.id === txnId ? {
        ...t,
        date:        form.date,
        desc:        form.desc,
        note:        form.note,
        payee:       form.payee,
        cat:         form.cat || null,
        category_id: form.cat || null,
        amt:         parseFloat(form.amt) || t.amt,
        account_id:  form.account_id || null,
      } : t));

      if (Object.keys(changedFields).length > 0) {
        await logAudit({
          orgId: org.id, userId: user?.id,
          transaction: txn, action: 'updated', changedFields,
        });
      }


      toast('Transaction updated.');
      onClose();
    } catch (e) {
      toast('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function f(key, val) { setForm(prev => ({ ...prev, [key]: val })); }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="modal-bg"
      onClick={onClose}  // onClick not onMouseDown — avoids race with row click
    >
      <div
        className="modal"
        style={{ width: 480 }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="modal-head" style={{ flexDirection:'column', alignItems:'flex-start', gap:10 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', width:'100%' }}>
            <div style={{ minWidth:0 }}>
              <h3 style={{ marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:360 }}>
                {txn.desc}
              </h3>
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, flexWrap:'wrap' }}>
                <span style={{ color:'var(--stone)' }}>{txn.date}</span>
                {!txn.imported && (
                  <span style={{ background:'var(--al)', color:'var(--a2)', padding:'1px 6px', borderRadius:3, fontSize:10, fontWeight:600 }}>
                    Manual entry
                  </span>
                )}
                <span className={txn.amt >= 0 ? 'vp' : 'vn'} style={{ fontWeight:500 }}>
                  {txn.amt >= 0 ? '+' : ''}{fmt(txn.amt)}
                </span>
              </div>
            </div>
            <button
              className="btn-ghost"
              style={{ padding:0, fontSize:18, flexShrink:0, marginLeft:8 }}
              onClick={onClose}
            >
              ×
            </button>
          </div>

          {/* ── Tabs ── */}
          <div style={{
            display:'flex', borderBottom:'0.5px solid var(--bd)',
            width:'calc(100% + 32px)', marginLeft:-16, paddingLeft:16,
          }}>
            {[
              { key:'details', label:'Details' },
              { key:'audit',   label:'Audit trail' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  padding:'7px 14px', background:'none', border:'none',
                  cursor:'pointer', fontSize:12.5, fontFamily:'var(--font-sans)',
                  color:      tab === key ? 'var(--ink)'   : 'var(--stone)',
                  fontWeight: tab === key ? 500             : 400,
                  borderBottom: tab === key ? '2px solid #BA7517' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Details tab ── */}
        {tab === 'details' && (
          <>
            <div className="modal-body">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={form.date} onChange={e => f('date', e.target.value)} />
                </div>
                <div className="field">
                  <label>Amount</label>
                  <div style={{ position:'relative' }}>
                    <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--stone)', fontSize:13, pointerEvents:'none' }}>$</span>
                    <input type="number" step="0.01" value={form.amt} style={{ paddingLeft:22 }} onChange={e => f('amt', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="field">
                <label>Description</label>
                <input type="text" value={form.desc} onChange={e => f('desc', e.target.value)} />
              </div>

              <div className="field">
                <label>Personal note</label>
                <textarea value={form.note} placeholder="Add a note…" onChange={e => f('note', e.target.value)} style={{ minHeight:52 }} />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ position:'relative' }}>
                  <PayeeField
                    value={form.payee}
                    onChange={v => f('payee', v)}
                    payees={payees||[]}
                    onAddPayee={handleAddPayee}
                    PALETTE={PALETTE}
                  />
                </div>
                <div style={{ position:'relative' }}>
                  <SearchSelect
                    label="Category"
                    value={form.cat}
                    onChange={v => f('cat', v)}
                    options={catOptions}
                    placeholder="Search categories…"
                    emptyLabel="— Unallocated —"
                  />
                </div>
              </div>

              {/* ── Bank account allocation ── */}
              <div style={{ position:'relative' }}>
                <SearchSelect
                  label="Bank account"
                  value={form.account_id}
                  onChange={v => f('account_id', v)}
                  options={acctOptions}
                  placeholder="Search accounts…"
                  emptyLabel="— Unlinked —"
                />
              </div>
            </div>

            <div className="modal-foot" style={{ justifyContent:'space-between' }}>
              <button className="btn btn-sm" onClick={onClose}>Cancel</button>
              <button className="btn btn-a btn-sm" onClick={handleSave} disabled={saving} style={{ minWidth:100 }}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        )}

        {/* ── Files tab ── */}
        {tab === 'files' && (
          <div style={{ minHeight:200 }}>
            {/* Upload area */}
            <div
              style={{ margin:'16px 16px 12px', border:'1.5px dashed var(--bd2)', borderRadius:'var(--rl)', padding:'20px', textAlign:'center', cursor:'pointer', background:'var(--sand)', transition:'border-color 0.15s' }}
              onClick={() => document.getElementById('txn-file-upload').click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--a)'; }}
              onDragLeave={e => { e.currentTarget.style.borderColor=''; }}
              onDrop={async e => {
                e.preventDefault(); e.currentTarget.style.borderColor='';
                const file = e.dataTransfer.files[0];
                if (!file) return;
                setUploading(true);
                try {
                  const f = await uploadTransactionFile(org.id, txnId, file, user?.id);
                  setFiles(prev => [...prev, f]);
                  toast('File uploaded.');
                } catch(err) { toast('Upload failed: ' + err.message); }
                finally { setUploading(false); }
              }}
            >
              {uploading
                ? <p style={{ fontSize:12, color:'var(--stone)' }}>Uploading…</p>
                : <><p style={{ fontSize:12.5, fontWeight:500, color:'var(--stone2)', marginBottom:4 }}>Drop file here or click to browse</p>
                   <p style={{ fontSize:11, color:'var(--stone)' }}>PDF, PNG, JPG, HEIC accepted</p></>
              }
            </div>
            <input id="txn-file-upload" type="file" accept=".pdf,.png,.jpg,.jpeg,.heic,.webp" style={{ display:'none' }}
              onChange={async e => {
                const file = e.target.files[0]; if (!file) return;
                setUploading(true);
                try {
                  const f = await uploadTransactionFile(org.id, txnId, file, user?.id);
                  setFiles(prev => [...prev, f]);
                  toast('File uploaded.');
                } catch(err) { toast('Upload failed: ' + err.message); }
                finally { setUploading(false); e.target.value=''; }
              }}
            />

            {/* File list */}
            {filesLoading ? (
              <div style={{ padding:'16px', textAlign:'center', color:'var(--stone)', fontSize:12 }}>Loading…</div>
            ) : files.length === 0 ? (
              <div style={{ padding:'8px 16px 16px', textAlign:'center', color:'var(--stone)', fontSize:12 }}>No files attached yet.</div>
            ) : (
              <div style={{ padding:'0 16px 16px' }}>
                {files.map(f => (
                  <div key={f.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', border:'0.5px solid var(--bd)', borderRadius:'var(--rr)', marginBottom:6, background:'#FDFAF6' }}>
                    <span style={{ fontSize:20, flexShrink:0 }}>
                      {f.mime_type?.includes('pdf') ? '📄' : f.mime_type?.includes('image') ? '🖼' : '📎'}
                    </span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12.5, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.filename}</div>
                      <div style={{ fontSize:11, color:'var(--stone)' }}>{f.size_bytes ? `${(f.size_bytes/1024).toFixed(0)} KB` : ''} · {new Date(f.created_at).toLocaleDateString()}</div>
                    </div>
                    <button className="btn btn-sm" onClick={async () => {
                      try {
                        const url = await getFileUrl(f.storage_path);
                        if (url) window.open(url, '_blank');
                      } catch(e) { toast('Could not open file.'); }
                    }}>View</button>
                    <button onClick={async () => {
                      await deleteTransactionFile(f.id, f.storage_path);
                      setFiles(prev => prev.filter(x => x.id !== f.id));
                      toast('File removed.');
                    }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--stone)', fontSize:16, padding:'0 2px' }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Audit trail tab ── */}
        {tab === 'audit' && (
          <div style={{ minHeight:200, maxHeight:400, overflowY:'auto' }}>
            {auditLoading ? (
              <div style={{ padding:24, textAlign:'center', color:'var(--stone)', fontSize:12 }}>
                Loading audit trail…
              </div>
            ) : auditLog.length === 0 ? (
              <div style={{ padding:24, textAlign:'center', color:'var(--stone)', fontSize:12 }}>
                <div style={{ fontSize:24, marginBottom:8 }}>📋</div>
                No history yet. Changes made here will be recorded.
              </div>
            ) : (
              auditLog.map(entry => (
                <div
                  key={entry.id}
                  style={{
                    padding:'10px 16px',
                    borderBottom:'0.5px solid var(--bd)',
                    display:'flex', gap:10, alignItems:'flex-start',
                  }}
                >
                  {/* Action icon */}
                  <div style={{
                    width:28, height:28, borderRadius:'50%', flexShrink:0,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:13,
                    background:
                      entry.action === 'deleted'  ? 'var(--rdb)' :
                      entry.action === 'created' || entry.action === 'imported' ? 'var(--gnb)' :
                      'var(--al)',
                  }}>
                    {entry.action === 'deleted'  ? '🗑' :
                     entry.action === 'created'  ? '✚' :
                     entry.action === 'imported' ? '↓' : '✎'}
                  </div>

                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:500 }}>
                      {describeChange(entry)}
                    </div>
                    <div style={{ fontSize:11, color:'var(--stone)', marginTop:2 }}>
                      {formatAuditDate(entry.created_at)}
                    </div>
                    {entry.note && (
                      <div style={{ fontSize:11, color:'var(--stone2)', marginTop:2, fontStyle:'italic' }}>
                        {entry.note}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ── Category dropdown ─────────────────────────────────────────────────────────
// ── Category dropdown — searchable, grouped, full keyboard nav ───────────────
const CAT_ORDER  = ['income','expense','asset','liability','equity'];
const CAT_LABELS = { income:'Income', expense:'Expenses', asset:'Assets', liability:'Liabilities', equity:'Equity' };

export function CategoryDropdown({ pos, onSelect, onUnallocate, onClose, currentCatId }) {
  const { cats } = useApp();
  const [q,       setQ]       = useState('');
  const [hiIdx,   setHiIdx]   = useState(0);   // keyboard highlight index
  const inputRef              = useRef(null);

  // Flat filtered list (used for keyboard navigation)
  const flat = q.trim()
    ? (cats||[]).filter(c => c.l.toLowerCase().includes(q.toLowerCase()))
    : (cats||[]);

  // Reset highlight when query changes
  useEffect(() => setHiIdx(0), [q]);

  // Focus search on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  function commit(c) { onSelect(c.id); }

  function handleKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHiIdx(i => Math.min(i + 1, flat.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHiIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (flat[hiIdx]) commit(flat[hiIdx]);
      return;
    }
  }

  // Group for display (only when no search query)
  const grouped = {};
  CAT_ORDER.forEach(t => { grouped[t] = []; });
  flat.forEach(c => { if (grouped[c.t]) grouped[c.t].push(c); else grouped['equity'].push(c); });

  const sections = q.trim()
    ? [{ label: '', items: flat }]
    : CAT_ORDER.filter(t => grouped[t].length > 0).map(t => ({ label: CAT_LABELS[t], items: grouped[t] }));

  // Global flat index across sections for arrow-key highlight
  let globalIdx = 0;

  const left = Math.min(pos.x, window.innerWidth - 240);
  const top  = pos.y + 240 > window.innerHeight ? pos.y - 244 : pos.y;

  return (
    <div
      className="dd-portal"
      style={{ display:'block', position:'fixed', left, top, zIndex:600, minWidth:224, maxHeight:300, overflowY:'auto', padding:0 }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Search box — sticky flush to top, no gap */}
      <div style={{ position:'sticky', top:0, background:'#FDFAF6', borderBottom:'0.5px solid var(--bd)', zIndex:1 }}>
        <input
          ref={inputRef}
          className="dd-search"
          placeholder="Search categories…"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={handleKey}
          style={{ width:'100%', boxSizing:'border-box', fontSize:12.5, padding:'8px 10px' }}
        />
      </div>

      {/* Unallocate row */}
      {currentCatId && (
        <div className="dd-opt" style={{ color:'var(--stone)', borderBottom:'0.5px solid var(--bd)', marginBottom:3 }} onClick={onUnallocate}>
          <span style={{ fontSize:11 }}>✕</span> Remove allocation
        </div>
      )}

      {/* Category rows grouped by type */}
      {sections.map(({ label, items }) => (
        <React.Fragment key={label}>
          {label && (
            <div style={{ padding:'4px 9px 2px', fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', background:'var(--sand)', borderTop:'0.5px solid var(--bd)', marginTop:2 }}>
              {label}
            </div>
          )}
          {items.map(c => {
            const idx = globalIdx++;
            const isHi = idx === hiIdx;
            return (
              <div
                key={c.id}
                className="dd-opt"
                style={{ fontWeight: c.id===currentCatId ? 500 : 400, background: isHi ? 'var(--al)' : '' }}
                onMouseEnter={() => setHiIdx(idx)}
                onClick={() => commit(c)}
              >
                <span className="cdot" style={{ background: c.col }} />
                <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.l}</span>
                {c.id === currentCatId && <span style={{ fontSize:10, color:'var(--stone)', flexShrink:0 }}>✓</span>}
              </div>
            );
          })}
        </React.Fragment>
      ))}

      {flat.length === 0 && (
        <div style={{ padding:'10px', fontSize:12, color:'var(--stone)', textAlign:'center' }}>No matches</div>
      )}

      {/* Keyboard hint */}
      <div style={{ padding:'4px 10px', fontSize:10, color:'var(--sand4)', borderTop:'0.5px solid var(--bd)' }}>
        ↑↓ · Enter/Tab · Esc
      </div>
    </div>
  );
}


// ── Payee dropdown — search, create, full keyboard nav ────────────────────────
export function PayeeDropdown({ pos, onSelect, onClose, onRemove }) {
  const { payees, setPayees, org, PALETTE } = useApp();
  const [q,     setQ]     = useState('');
  const [hiIdx, setHiIdx] = useState(0);
  const inputRef          = useRef(null);

  const filtered   = (payees||[]).filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  const canCreate  = q.trim().length > 0 && !(payees||[]).find(p => p.name.toLowerCase() === q.trim().toLowerCase());
  // Items = existing filtered rows + optional "Create" row at end
  const allItems   = canCreate ? [...filtered, { _create: true, name: q.trim() }] : filtered;

  useEffect(() => setHiIdx(0), [q]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function createAndSelect(name) {
    const col  = (PALETTE||[])[payees.length % (PALETTE||['#888']).length] || '#888';
    const newP = await upsertPayee(org.id, name.trim(), col);
    setPayees(prev => prev.find(p => p.id === newP.id) ? prev : [...prev, newP]);
    onSelect(newP);
  }

  function pickItem(item) {
    if (item._create) createAndSelect(item.name);
    else onSelect(item);
  }

  function handleKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHiIdx(i => Math.min(i + 1, allItems.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHiIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      // If nothing highlighted but canCreate → create from query
      if (allItems[hiIdx]) pickItem(allItems[hiIdx]);
      else if (canCreate)  createAndSelect(q.trim());
      return;
    }
  }

  const left = Math.min(pos.x, window.innerWidth - 240);
  const top  = pos.y + 240 > window.innerHeight ? pos.y - 244 : pos.y;

  return (
    <div
      className="dd-portal"
      style={{ display:'block', position:'fixed', left, top, zIndex:600, minWidth:224, maxHeight:300, overflowY:'auto', padding:0 }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Search / create box — sticky flush to top */}
      <div style={{ position:'sticky', top:0, background:'#FDFAF6', borderBottom:'0.5px solid var(--bd)', zIndex:1 }}>
        <input
          ref={inputRef}
          className="dd-search"
          placeholder="Search or type to create…"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={handleKey}
          style={{ width:'100%', boxSizing:'border-box', fontSize:12.5, padding:'8px 10px' }}
        />
      </div>

      {/* Remove payee row — shown when a payee is currently set */}
      {onRemove && (
        <div
          className="dd-opt"
          style={{ color:'var(--stone)', borderBottom:'0.5px solid var(--bd)', padding:'6px 10px' }}
          onClick={onRemove}
        >
          <span style={{ fontSize:11 }}>✕</span> Remove payee
        </div>
      )}

      {/* Existing payees */}
      {filtered.map((p, i) => {
        const isHi = i === hiIdx;
        return (
          <div key={p.id} className="dd-opt"
            style={{ background: isHi ? 'var(--al)' : '' }}
            onMouseEnter={() => setHiIdx(i)}
            onClick={() => onSelect(p)}
          >
            <span style={{ width:20, height:20, borderRadius:'50%', background:`${p.col||'#888'}22`, color:p.col||'#888', fontSize:9, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontWeight:700 }}>
              {p.name.slice(0,2).toUpperCase()}
            </span>
            <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
          </div>
        );
      })}

      {/* Create row */}
      {canCreate && (
        <div
          className="dd-opt"
          style={{ borderTop:'0.5px solid var(--bd)', marginTop:2, color:'var(--a2)', fontWeight:500, background: hiIdx === filtered.length ? 'var(--al)' : '' }}
          onMouseEnter={() => setHiIdx(filtered.length)}
          onClick={() => createAndSelect(q.trim())}
        >
          <span style={{ fontSize:13, flexShrink:0 }}>+</span>
          Create "{q.trim()}"
        </div>
      )}

      {filtered.length === 0 && !canCreate && (
        <div style={{ padding:'10px', fontSize:12, color:'var(--stone)', textAlign:'center' }}>
          {payees.length === 0 ? 'Type a name to create a payee' : 'No matches'}
        </div>
      )}

      {/* Keyboard hint */}
      <div style={{ padding:'4px 10px', fontSize:10, color:'var(--sand4)', borderTop:'0.5px solid var(--bd)' }}>
        ↑↓ · Enter/Tab · Esc
      </div>
    </div>
  );
}
