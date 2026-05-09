/**
 * views/Banking/AutoCategorise.jsx
 * Three sections:
 *   1. Suggested rules  — repeating patterns in unallocated txns (create rules)
 *   2. Rule suggestions — pending approvals from existing auto-cat rules
 *   3. Merchant intel   — per-transaction category hints from merchant intelligence
 */

import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CategoryPill } from '../../components/ui/index';
import { runAutoCatRules, fmt, analyseImportedTransactions, estimateCategoryForMerchant } from '../../utils/helpers';
import { extractMerchantName } from '../../utils/merchant.js';
import { updateTransaction, upsertPayee, postCategoryJournal } from '../../lib/supabase';
import { RuleBuilderModal } from '../../components/RuleBuilderModal.jsx';

export function AutoCategorise({ onNavigate }) {
  const { txns, setTxns, cats, catMap, rules, setRules, payees, setPayees,
          accounts, org, merchantHints, orgSettings, toast, PALETTE } = useApp();

  const [showRuleBuilder, setShowRuleBuilder] = useState(false);
  const [ruleBuilderSeed, setRuleBuilderSeed]  = useState([]);

  // ── 1. Suggested rules — repeating patterns in unallocated txns ─────────────
  const ruleOpportunities = useMemo(() => {
    const unalloc = (txns||[]).filter(t => !t.cat);
    if (unalloc.length === 0) return [];
    const adapted = unalloc.map(t => ({
      id:    t.id,
      desc:  t.desc || t.description || '',
      amt:   t.amt  ?? t.amount ?? 0,
      date:  t.date || '',
      cat:   null,
      payee: '',
    }));
    const analysis = analyseImportedTransactions(
      adapted, rules||[], {}, payees||[], cats||[], merchantHints||[]
    );
    return analysis.ruleOpportunities || [];
  }, [txns, rules, payees, cats, merchantHints]);

  function openRuleBuilder() {
    const seed = ruleOpportunities.map(op => ({
      id:            `${op.keyword}:${op.exampleDesc}`,
      keyword:       op.keyword,
      catId:         op.sugCatId      || '',
      catLabel:      op.sugCatLabel   || '',
      catConfidence: op.catConfidence || 'low',
      payee:         op.suggestName   || op.payee || '',
      amtExact:      op.amtExact != null ? String(op.amtExact.toFixed(2)) : '',
      amtMin:        '',
      amtMax:        '',
      direction:     'out',
      enabled:       true,
      count:         op.count,
      example:       op.exampleDesc,
    }));
    setRuleBuilderSeed(seed);
    setShowRuleBuilder(true);
  }

  // ── 2. Rule-based suggestions ────────────────────────────────────────────────
  const suggestions = useMemo(() => runAutoCatRules(txns, rules), [txns, rules]);

  // ── 3. Merchant intelligence suggestions ────────────────────────────────────
  const intelSuggestions = useMemo(() => {
    if (orgSettings?.merchantIntelEnabled === false) return [];
    const unalloc = (txns||[]).filter(t => !t.cat);
    const ruleIds = new Set(suggestions.map(s => s.txnId));
    const result  = [];
    for (const t of unalloc) {
      if (ruleIds.has(t.id)) continue;
      const merchant = extractMerchantName(t.desc || '');
      if (!merchant) continue;
      const est = estimateCategoryForMerchant(merchant, (t.desc||'').toLowerCase(), cats||[], merchantHints||[]);
      if (!est.catId) continue;
      result.push({
        txnId:      t.id,
        sugCat:     est.catId,
        sugPayee:   merchant,
        confidence: est.confidence === 'high' ? 'High' : 'Medium',
        reason:     `Merchant: ${merchant}`,
        fromIntel:  true,
      });
    }
    return result;
  }, [txns, suggestions, cats, merchantHints, orgSettings]);

  // ── Apply a single suggestion ────────────────────────────────────────────────
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
      ? { ...t, cat: updates.category_id ?? t.cat, payee: sug.sugPayee ?? t.payee }
      : t
    ));
    if (updates.category_id) {
      try {
        const txn  = (txns||[]).find(t => t.id === sug.txnId);
        const cat  = catMap[updates.category_id];
        const acct = txn?.account_id ? (accounts||[]).find(a => a.id === txn.account_id) : null;
        if (txn && cat) await postCategoryJournal(org.id, txn, cat, acct);
      } catch(e) { console.warn('Auto-cat journal failed:', e.message); }
    }
  }

  async function approveAll(list) {
    if (!list.length) return;
    toast(`Applying ${list.length} suggestion${list.length > 1 ? 's' : ''}…`);
    await Promise.all(list.map(sug => approve(sug)));
    toast(`${list.length} suggestion${list.length > 1 ? 's' : ''} applied.`);
  }

  async function dismiss(sug) {
    const fallback = Object.values(catMap).find(c => c.l === 'Other');
    if (fallback) {
      await updateTransaction(sug.txnId, { category_id: fallback.id });
      setTxns(prev => prev.map(t => t.id === sug.txnId ? { ...t, cat: fallback.id } : t));
    }
    toast('Suggestion dismissed.');
  }

  const txnMap        = Object.fromEntries((txns||[]).map(t => [t.id, t]));
  const totalPending  = suggestions.length + intelSuggestions.length;
  const unallocCount  = (txns||[]).filter(t => !t.cat).length;

  function SuggestionRow({ sug, isIntel }) {
    const t = txnMap[sug.txnId]; if (!t) return null;
    const cat = catMap[sug.sugCat];
    return (
      <div style={{ display:'grid', gridTemplateColumns:'1fr 90px 150px 140px 100px', gap:8, alignItems:'center', padding:'8px 14px', borderBottom:'0.5px solid var(--bd)' }}>
        <div>
          <div style={{ fontWeight:500, fontSize:12.5 }}>{t.desc}</div>
          <div style={{ fontSize:11, color:'var(--stone)', marginTop:1 }}>
            {t.date} · {t.amt >= 0 ? '+' : ''}{fmt(t.amt)}
            {isIntel && <span style={{ marginLeft:6, fontSize:10, padding:'1px 6px', borderRadius:99, background:'rgba(83,74,183,0.12)', color:'#534AB7', fontWeight:500 }}>intel</span>}
          </div>
        </div>
        <span style={{ fontSize:10.5, padding:'2px 8px', borderRadius:99, fontWeight:500, textAlign:'center',
          background: sug.confidence==='High' ? 'var(--gnb)' : 'var(--al)',
          color:      sug.confidence==='High' ? 'var(--gn)' : 'var(--a2)' }}>
          {sug.confidence}
        </span>
        <div>{cat ? <CategoryPill category={cat} /> : <span style={{ color:'var(--stone)', fontSize:11 }}>—</span>}</div>
        <div style={{ fontSize:12, color:'var(--stone)' }}>{sug.sugPayee || '—'}</div>
        <div style={{ display:'flex', gap:5 }}>
          <button className="btn btn-approve" style={{ fontSize:11 }} onClick={() => approve(sug).then(() => toast('Applied.'))}>✓</button>
          <button className="btn btn-reject"  style={{ fontSize:11 }} onClick={() => dismiss(sug)}>✕</button>
        </div>
      </div>
    );
  }

  const ColHeaders = () => (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 90px 150px 140px 100px', gap:8, padding:'6px 14px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)' }}>
      {['Transaction','Confidence','Category','Payee',''].map(h => (
        <span key={h} style={{ fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</span>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, gap:12 }}>
        <p style={{ fontSize:12, color:'var(--stone2)', maxWidth:520, lineHeight:1.6 }}>
          Review category suggestions and create rules for repeating patterns.
          {unallocCount > 0 && <> <strong style={{ color:'var(--a2)' }}>{unallocCount} unallocated transaction{unallocCount !== 1 ? 's' : ''}</strong> in your current date range.</>}
        </p>
        {suggestions.length > 0 && (
          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            <button className="btn btn-approve btn-sm" onClick={() => approveAll(suggestions)}>✓ Approve rules ({suggestions.length})</button>
          </div>
        )}
      </div>

      {/* ── Section 1: Suggested rules from patterns ── */}
      {ruleOpportunities.length > 0 && (
        <div className="card" style={{ marginBottom:14 }}>
          <div className="ch" style={{ justifyContent:'space-between' }}>
            <div>
              <h3>{ruleOpportunities.length} repeating pattern{ruleOpportunities.length !== 1 ? 's' : ''} detected</h3>
              <p>Create rules to auto-categorise these merchants in future imports</p>
            </div>
            <button className="btn btn-a btn-sm" onClick={openRuleBuilder}>
              Review &amp; add rules →
            </button>
          </div>
          <div style={{ padding:'0 14px 12px' }}>
            {ruleOpportunities.slice(0, 8).map((op, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 0', borderBottom:'0.5px solid var(--bd)', fontSize:12 }}>
                <span style={{ flex:'0 0 160px', fontWeight:500 }}>{op.suggestName || op.keyword}</span>
                <span style={{ color:'var(--stone)' }}>×{op.count}</span>
                {op.sugCatId && (
                  <span style={{ fontSize:10.5, padding:'1px 8px', borderRadius:99,
                    background: op.catConfidence==='high' ? 'var(--gnb)' : 'var(--al)',
                    color:      op.catConfidence==='high' ? 'var(--gn)' : 'var(--a2)',
                    fontWeight:500 }}>
                    → {op.sugCatLabel || op.sugCatId}
                    {op.catConfidence==='high' ? ' (auto)' : ' (~auto)'}
                  </span>
                )}
                <span style={{ marginLeft:'auto', fontSize:11, color:'var(--stone)', fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>
                  e.g. {op.exampleDesc}
                </span>
              </div>
            ))}
            {ruleOpportunities.length > 8 && (
              <div style={{ fontSize:11, color:'var(--stone)', padding:'6px 0' }}>
                +{ruleOpportunities.length - 8} more patterns — click "Review &amp; add rules" to see all
              </div>
            )}
          </div>
        </div>
      )}

      {totalPending === 0 && ruleOpportunities.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--stone)' }}>
          <div style={{ fontSize:32, marginBottom:10 }}>✓</div>
          <p style={{ fontSize:13, fontWeight:500 }}>All caught up</p>
          <p style={{ fontSize:12, marginTop:4 }}>No pending suggestions or patterns detected.</p>
          <p style={{ fontSize:12, marginTop:4 }}>
            <span style={{ color:'var(--a)', cursor:'pointer' }} onClick={() => onNavigate('rules')}>Manage rules →</span>
          </p>
        </div>
      ) : (
        <>
          {/* ── Section 2: Rule-based suggestions ── */}
          {suggestions.length > 0 && (
            <div className="card" style={{ marginBottom:14 }}>
              <div className="ch" style={{ justifyContent:'space-between' }}>
                <div>
                  <h3>{suggestions.length} rule suggestion{suggestions.length > 1 ? 's' : ''}</h3>
                  <p>Matched by your auto-cat rules — approve to apply</p>
                </div>
                <button className="btn btn-approve btn-sm" onClick={() => approveAll(suggestions).then(() => {})}>✓ Approve all</button>
              </div>
              <ColHeaders />
              {suggestions.map((sug, i) => <SuggestionRow key={`rule-${sug.txnId}-${i}`} sug={sug} isIntel={false} />)}
            </div>
          )}

          {/* ── Section 3: Merchant intelligence ── */}
          {intelSuggestions.length > 0 && (
            <div className="card">
              <div className="ch" style={{ justifyContent:'space-between' }}>
                <div>
                  <h3>{intelSuggestions.length} merchant suggestion{intelSuggestions.length > 1 ? 's' : ''}</h3>
                  <p>From merchant intelligence — based on merchant name, not rules</p>
                </div>
                <button className="btn btn-approve btn-sm" onClick={() => approveAll(intelSuggestions)}>✓ Approve all</button>
              </div>
              <ColHeaders />
              {intelSuggestions.map((sug, i) => <SuggestionRow key={`intel-${sug.txnId}-${i}`} sug={sug} isIntel={true} />)}
            </div>
          )}
        </>
      )}

      {/* Rule builder modal */}
      {showRuleBuilder && (
        <RuleBuilderModal
          initialForms={ruleBuilderSeed}
          cats={cats}
          rules={rules}
          org={org}
          setRules={setRules}
          toast={toast}
          onClose={() => setShowRuleBuilder(false)}
        />
      )}
    </div>
  );
}
