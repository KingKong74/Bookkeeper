/**
 * views/Banking/AutoCategorise.jsx
 * Approval queue — approve all in one batch, badges update immediately.
 */

import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { CategoryPill } from '../../components/ui/index';
import { runAutoCatRules, fmt } from '../../utils/helpers';
import { updateTransaction, upsertPayee, postCategoryJournal } from '../../lib/supabase';

export function AutoCategorise({ onNavigate }) {
  const { txns, setTxns, catMap, rules, payees, setPayees, accounts, org, toast, PALETTE } = useApp();

  const suggestions = useMemo(() => runAutoCatRules(txns, rules), [txns, rules]);

  // ── Apply a single suggestion ──────────────────────────────────────────────
  async function approve(sug) {
    const updates = {};
    if (sug.sugCat) updates.category_id = sug.sugCat;
    if (sug.sugPayee) {
      try {
        const col = PALETTE[payees.length % PALETTE.length];
        const p   = await upsertPayee(org.id, sug.sugPayee, col);
        if (!payees.find(x => x.name.toLowerCase() === sug.sugPayee.toLowerCase())) {
          setPayees(prev => [...prev, p]);
        }
        updates.payee_id = p.id;
      } catch (e) { console.error(e); }
    }
    await updateTransaction(sug.txnId, updates);
    setTxns(prev => prev.map(t => t.id === sug.txnId
      ? { ...t, cat: updates.category_id ?? t.cat, category_id: updates.category_id ?? t.category_id, payee: sug.sugPayee ?? t.payee }
      : t
    ));
    // Post double-entry journal for this suggestion
    if (updates.category_id) {
      try {
        const txn  = (txns||[]).find(t=>t.id===sug.txnId);
        const cat  = catMap[updates.category_id];
        const acct = txn?.account_id ? (accounts||[]).find(a=>a.id===txn.account_id) : null;
        if (txn && cat) await postCategoryJournal(org.id, txn, cat, acct);
      } catch(e) { console.warn('Auto-cat journal failed:', e.message); }
    }
  }

  // ── Approve ALL in parallel batch ─────────────────────────────────────────
  async function approveAll() {
    if (suggestions.length === 0) return;
    toast(`Applying ${suggestions.length} suggestions…`);

    // Batch all DB updates in parallel
    await Promise.all(suggestions.map(sug => approve(sug)));

    toast(`${suggestions.length} suggestions applied.`);
    onNavigate('transactions');
  }

  // ── Dismiss (set to 'other' so it stops appearing) ────────────────────────
  async function dismiss(sug) {
    const fallback = Object.values(catMap).find(c => c.l === 'Other');
    if (fallback) {
      await updateTransaction(sug.txnId, { category_id: fallback.id });
      setTxns(prev => prev.map(t => t.id === sug.txnId ? { ...t, cat: fallback.id } : t));
    }
    toast('Suggestion dismissed.');
  }

  async function dismissAll() {
    const fallback = Object.values(catMap).find(c => c.l === 'Other');
    if (!fallback) return;
    await Promise.all(suggestions.map(s => updateTransaction(s.txnId, { category_id: fallback.id })));
    setTxns(prev => {
      const ids = new Set(suggestions.map(s => s.txnId));
      return prev.map(t => ids.has(t.id) ? { ...t, cat: fallback.id } : t);
    });
    toast('All suggestions dismissed.');
  }

  const txnMap = Object.fromEntries(txns.map(t => [t.id, t]));

  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
        <p style={{ fontSize:12, color:'var(--stone2)', maxWidth:480, lineHeight:1.6 }}>
          Review category and payee suggestions from your auto-cat rules.
          Approving applies them permanently to the database.
        </p>
        {suggestions.length > 0 && (
          <div style={{ display:'flex', gap:8, flexShrink:0, marginLeft:16 }}>
            <button className="btn btn-approve" onClick={approveAll}>
              ✓ Approve all ({suggestions.length})
            </button>
            <button className="btn btn-reject" onClick={dismissAll}>Dismiss all</button>
          </div>
        )}
      </div>

      {suggestions.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--stone)' }}>
          <div style={{ fontSize:32, marginBottom:10 }}>✓</div>
          <p style={{ fontSize:13, fontWeight:500 }}>No pending suggestions</p>
          <p style={{ fontSize:12, marginTop:4 }}>
            <span style={{ color:'var(--a)', cursor:'pointer' }} onClick={() => onNavigate('rules')}>Manage rules →</span>
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="ch">
            <h3>{suggestions.length} pending suggestion{suggestions.length > 1 ? 's' : ''}</h3>
          </div>
          {/* Column headers */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 140px 140px 110px', gap:8, padding:'6px 14px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)' }}>
            {['Transaction','Confidence','Category','Payee',''].map(h => (
              <span key={h} style={{ fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</span>
            ))}
          </div>
          {suggestions.map((sug, i) => {
            const t  = txnMap[sug.txnId]; if (!t) return null;
            const c  = catMap[sug.sugCat];
            return (
              <div key={`${sug.txnId}-${i}`}
                style={{ display:'grid', gridTemplateColumns:'1fr 100px 140px 140px 110px', gap:8, alignItems:'center', padding:'8px 14px', borderBottom:'0.5px solid var(--bd)' }}>
                <div>
                  <div style={{ fontWeight:500, fontSize:12 }}>{t.desc}</div>
                  <div style={{ fontSize:11, color:'var(--stone)' }}>{t.date} · {t.amt>=0?'+':''}{fmt(t.amt)}</div>
                </div>
                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:500,
                  background: sug.confidence==='High'?'#EAF3DE':'#FAEEDA',
                  color:      sug.confidence==='High'?'#27500A':'#633806' }}>
                  {sug.confidence}
                </span>
                <div>{sug.sugCat && c ? <CategoryPill category={c} /> : <span style={{ color:'var(--stone)', fontSize:11 }}>Already set</span>}</div>
                <div style={{ fontSize:12 }}>{sug.sugPayee || <span style={{ color:'var(--stone)', fontSize:11 }}>Already set</span>}</div>
                <div style={{ display:'flex', gap:5 }}>
                  <button className="btn btn-approve" onClick={() => approve(sug).then(() => toast('Approved.'))}>✓</button>
                  <button className="btn btn-reject" onClick={() => dismiss(sug)}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
