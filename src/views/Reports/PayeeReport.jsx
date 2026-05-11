/**
 * views/Reports/PayeeReport.jsx
 * Payee summary — spend, income, transaction counts per payee.
 * Supports comparison, sorting, search, and inline payee editing.
 */
import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { PeriodBar } from '../../components/ui/PeriodBar';
import { MetricCard, PayeeAvatar } from '../../components/ui/index';
import { upsertPayee, deletePayee } from '../../services/categoryService';
import { fmt, fmtSigned, filterByDateRange } from '../../utils/helpers';
import { CompareBar } from './reportComponents';
import { getPriorDates, buildByPayee } from './reportHelpers';

export function PayeeReport() {
  const { txns, setTxns, catMap, payees, setPayees, org, PALETTE, dateFrom, dateTo, toast } = useApp();
  const [compare,     setCompare]     = useState('none');
  const [editPayee,   setEditPayee]   = useState(null);
  const [editForm,    setEditForm]    = useState({ name: '', colour: '' });
  const [saving,      setSaving]      = useState(false);
  const [showZeroPay, setShowZeroPay] = useState(false);
  const [payeeSearch, setPayeeSearch] = useState('');
  const [sortCol,     setSortCol]     = useState('total');
  const [sortDir,     setSortDir]     = useState('desc');

  const priorDates = getPriorDates(compare, dateFrom, dateTo);
  const payeeById  = useMemo(() => Object.fromEntries((payees || []).map(p => [p.id, p.name])), [payees]);

  const ft  = useMemo(() => filterByDateRange(txns, dateFrom, dateTo).filter(t => !!t.cat), [txns, dateFrom, dateTo]);
  const ftP = useMemo(() => priorDates ? filterByDateRange(txns, priorDates[0], priorDates[1]).filter(t => !!t.cat) : [], [txns, priorDates]);

  const byPayee  = useMemo(() => buildByPayee(ft,  catMap, payeeById), [ft,  catMap, payeeById]);
  const byPayeeP = useMemo(() => buildByPayee(ftP, catMap, payeeById), [ftP, catMap, payeeById]);

  function togglePayeeSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir(col === 'name' ? 'asc' : 'desc'); }
  }

  const allNames = new Set([...Object.keys(byPayee), ...(showZeroPay ? (payees || []).map(p => p.name) : [])]);
  const rows = [...allNames]
    .map(n => [n, byPayee[n] || { total: 0, count: 0, income: 0, expense: 0, cats: new Set() }])
    .filter(([n, v]) => {
      if (!showZeroPay && Math.abs(v.total) < 0.005 && v.count === 0) return false;
      if (payeeSearch.trim()) return n.toLowerCase().includes(payeeSearch.toLowerCase());
      return true;
    })
    .sort(([na, va], [nb, vb]) => {
      let diff = sortCol === 'name' ? na.localeCompare(nb)
               : sortCol === 'count'   ? va.count - vb.count
               : sortCol === 'income'  ? va.income - vb.income
               : sortCol === 'expense' ? va.expense - vb.expense
               : Math.abs(va.total) - Math.abs(vb.total);
      return sortDir === 'asc' ? diff : -diff;
    });

  const totalExp = rows.reduce((s, [, v]) => s + v.expense, 0);

  async function savePayee() {
    if (!editForm.name.trim()) return;
    setSaving(true);
    try {
      const col = editForm.colour || (PALETTE || [])[(payees || []).length % (PALETTE || ['#888']).length] || '#888';
      const p   = await upsertPayee(org.id, editForm.name.trim(), col);
      setPayees(prev => { const exists = prev.find(x => x.id === p.id); return exists ? prev.map(x => x.id === p.id ? p : x) : [...prev, p]; });
      toast(`Payee "${p.name}" saved.`);
      setEditPayee(null);
    } catch (e) { toast('Error: ' + e.message); }
    finally { setSaving(false); }
  }

  async function deletePayeeById(payeeId, payeeName) {
    if (!window.confirm(`Delete "${payeeName}"? All transactions will lose this payee.`)) return;
    try {
      await deletePayee(payeeId);
      if (setTxns) setTxns(prev => (prev || []).map(t => t.payee_id === payeeId ? { ...t, payee: '', payee_id: null } : t));
      setPayees(prev => (prev || []).filter(p => p.id !== payeeId));
      toast('Payee deleted.');
    } catch (e) { toast('Delete failed: ' + e.message); }
  }

  const SortTh = ({ col, label, right }) => (
    <th className={right ? 'tr' : undefined} onClick={() => togglePayeeSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label}<span style={{ marginLeft: 3, fontSize: 9, opacity: sortCol === col ? 0.9 : 0.25 }}>{sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
    </th>
  );

  return (
    <div>
      <PeriodBar />
      <div className="metrics">
        <MetricCard label="Unique payees"      value={rows.filter(([k]) => k !== '(No payee)').length} />
        <MetricCard label="Total transactions" value={ft.length} />
        <MetricCard label="Total spent"        value={fmt(totalExp)} valueClass="vn" />
      </div>
      <CompareBar compare={compare} setCompare={setCompare} />

      <div className="card">
        <div className="ch">
          <h3>Payee summary</h3>
          <div className="ch-r" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input placeholder="Search payees…" value={payeeSearch} onChange={e => setPayeeSearch(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', border: '0.5px solid var(--bd2)', borderRadius: 'var(--rr)', width: 140 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--stone)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={showZeroPay} onChange={e => setShowZeroPay(e.target.checked)} />Zero bal
            </label>
            <button className="btn btn-a btn-sm" onClick={() => { setEditForm({ name: '', colour: (PALETTE || [])[(payees || []).length % (PALETTE || ['#888']).length] || '#888' }); setEditPayee('new'); }}>+ Add payee</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <SortTh col="name"    label="Payee"  right={false} />
              <SortTh col="count"   label="Txns"   right />
              <SortTh col="income"  label="Income" right />
              <SortTh col="expense" label="Spent"  right />
              <SortTh col="total"   label="Net"    right />
              {compare !== 'none' && <><th className="tr">Prior net</th><th className="tr">Variance</th></>}
              <th>Categories</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--stone)' }}>No transactions in range.</td></tr>}
            {rows.map(([name, v]) => {
              const prior    = byPayeeP[name];
              const variance = prior ? v.total - prior.total : null;
              const p        = name !== '(No payee)' ? (payees || []).find(px => px.name === name) : null;
              return (
                <tr key={name} style={{ borderBottom: '0.5px solid var(--bd)' }}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {name !== '(No payee)' && <PayeeAvatar name={name} payeesList={payees} size="sm" />}
                    <span style={{ fontWeight: 500 }}>{name}</span>
                  </div></td>
                  <td className="tr">{v.count}</td>
                  <td className="tr vp">{v.income > 0 ? fmt(v.income) : '—'}</td>
                  <td className="tr vn">{v.expense > 0 ? fmt(v.expense) : '—'}</td>
                  <td className={`tr ${v.total >= 0 ? 'vp' : 'vn'}`}>{fmtSigned(v.total)}</td>
                  {compare !== 'none' && <>
                    <td className="tr" style={{ color: 'var(--stone)' }}>{prior ? fmtSigned(prior.total) : '—'}</td>
                    <td className={`tr ${variance === null ? '' : variance >= 0 ? 'vp' : 'vn'}`}>{variance !== null ? fmtSigned(variance) : '—'}</td>
                  </>}
                  <td style={{ fontSize: 11, color: 'var(--stone)' }}>{[...v.cats].join(', ') || '—'}</td>
                  <td>{p && <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => { setEditForm({ name: p.name, colour: p.colour || p.col || '#888' }); setEditPayee(p); }}>Edit</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editPayee && (
        <div className="modal-bg" onClick={() => setEditPayee(null)}>
          <div className="modal" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editPayee === 'new' ? 'New payee' : `Edit "${editPayee.name}"`}</h3>
              <button className="btn-ghost" style={{ padding: 0, fontSize: 16 }} onClick={() => setEditPayee(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field"><label>Name</label><input autoFocus type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Coles" /></div>
              <div className="field"><label>Colour</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
                  {(PALETTE || []).map(col => <span key={col} onClick={() => setEditForm(f => ({ ...f, colour: col }))} style={{ width: 22, height: 22, borderRadius: '50%', background: col, cursor: 'pointer', border: editForm.colour === col ? '2.5px solid var(--ink)' : '2px solid transparent' }} />)}
                </div>
              </div>
            </div>
            <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
              <div>{editPayee !== 'new' && <button className="btn btn-sm" style={{ color: 'var(--rd)' }} onClick={() => { if (editPayee?.id) deletePayeeById(editPayee.id, editPayee.name); }}>Delete payee</button>}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => setEditPayee(null)}>Cancel</button>
                <button className="btn btn-a" disabled={saving || !editForm.name.trim()} onClick={savePayee}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
