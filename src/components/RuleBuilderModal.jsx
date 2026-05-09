/**
 * components/RuleBuilderModal.jsx
 * Shared rule builder modal — used in ImportStatement and AutoCategorise.
 */
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { createRule, createCategoryWithCode, createCategory } from '../lib/supabase';


const CAT_TYPE_ORDER  = ['income', 'expense', 'asset', 'liability', 'equity'];

// Inline "create new account" mini-form used inside the rule builder
function NewAccountInline({ cats, onSave, onCancel }) {
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState('expense');
  const [code, setCode] = React.useState(() => {
    const TYPE_RANGES = { asset:[100,399], liability:[400,599], equity:[600,699], income:[700,799], expense:[800,998] };
    const [lo,hi] = TYPE_RANGES['expense'];
    const used = new Set((cats||[]).filter(c=>c.code&&!c.code.includes('/')).map(c=>parseInt(c.code)).filter(n=>!isNaN(n)));
    for (let n=lo; n<=hi; n++) { if (!used.has(n)) return String(n); }
    return '';
  });
  const [saving, setSaving] = React.useState(false);

  function updateSuggest(newType, newName) {
    setCode(suggestAccountCode(cats, newType, newName));
  }

  return (
    <div style={{ border:'0.5px solid var(--a)', borderRadius:'var(--rr)', padding:'8px 10px', background:'var(--ab)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'70px 1fr', gap:6, marginBottom:6 }}>
        <div>
          <div style={{ fontSize:9, color:'var(--stone)', marginBottom:2 }}>Code <span style={{ color:'var(--rd)' }}>*</span></div>
          <input value={code} onChange={e=>setCode(e.target.value.replace(/[^0-9]/g,''))} maxLength={3}
            placeholder="820" style={{ width:'100%', fontFamily:'monospace', fontSize:12, padding:'3px 6px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)' }} />
        </div>
        <div>
          <div style={{ fontSize:9, color:'var(--stone)', marginBottom:2 }}>Account name</div>
          <input autoFocus value={name} onChange={e=>{ setName(e.target.value); updateSuggest(type, e.target.value); }}
            placeholder="Account name…" style={{ width:'100%', fontSize:12, padding:'3px 6px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)' }} />
        </div>
      </div>
      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
        <select value={type} onChange={e=>{ setType(e.target.value); updateSuggest(e.target.value, name); }}
          style={{ fontSize:11.5, padding:'3px 6px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', flex:1 }}>
          {[['expense','Expense'],['income','Income'],['asset','Asset'],['liability','Liability'],['equity','Equity']].map(([v,l])=>(
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button className="btn btn-a btn-sm" style={{ fontSize:11 }} disabled={!name.trim()||!code||saving}
          onClick={async()=>{ setSaving(true); await onSave(name.trim(), type, code); setSaving(false); }}>
          {saving?'…':'Create'}
        </button>
        <button className="btn btn-sm" style={{ fontSize:11 }} onClick={onCancel}>✕</button>
      </div>
    </div>
  );
}

const CAT_TYPE_LABELS = { income:'Income', expense:'Expenses', asset:'Assets', liability:'Liabilities', equity:'Equity' };

function categorySections(effectiveCats) {
  // Exclude parents that have active sub-accounts (only show selectable accounts)
  const selectable = (effectiveCats||[]).filter(c => {
    if (c.is_active === false) return false;
    const hasSubs = (effectiveCats||[]).some(ch=>ch.parent_id===c.id&&ch.is_active!==false);
    return !hasSubs;
  });
  return CAT_TYPE_ORDER.map(type => {
    const items = selectable.filter(cat=>cat.t===type)
      .sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999)||(a.l||'').localeCompare(b.l||''));
    return { type, label: CAT_TYPE_LABELS[type], items };
  }).filter(s=>s.items.length>0);
}

function suggestAccountCode(cats, type, label) {
  const TYPE_RANGES = { asset:[100,399], liability:[400,599], equity:[600,699], income:[700,799], expense:[800,998] };
  const [lo, hi] = TYPE_RANGES[type] || [800,998];
  const used = new Set((cats||[]).filter(c=>c.code&&!c.code.includes('/')).map(c=>parseInt(c.code)).filter(n=>!isNaN(n)));
  if (!label?.trim()) {
    for (let n=lo; n<=hi; n++) { if (!used.has(n)) return String(n); }
    return '';
  }
  const peers = (cats||[]).filter(c=>c.t===type&&c.is_active!==false&&c.code&&!c.code.includes('/'))
    .sort((a,b)=>(a.l||'').localeCompare(b.l||''));
  const insertIdx = peers.findIndex(p=>(p.l||'').toLowerCase()>(label||'').toLowerCase());
  const insertPos = insertIdx===-1 ? peers.length : insertIdx;
  const rangeSize = hi-lo+1;
  const idealNum  = lo+Math.round((insertPos/(peers.length+1))*rangeSize);
  for (let delta=0; delta<=rangeSize; delta++) {
    if (!used.has(idealNum+delta)&&idealNum+delta<=hi) return String(idealNum+delta);
    if (!used.has(idealNum-delta)&&idealNum-delta>=lo) return String(idealNum-delta);
  }
  return '';
}


function RuleBuilderModal({ initialForms, cats, setCats, rules, org, setRules, toast, onClose }) {
  const { cats: ctxCats, setCats: ctxSetCats } = useApp();
  const effectiveCats    = cats    ?? ctxCats;
  const effectiveSetCats = setCats ?? ctxSetCats;
  const [forms, setForms] = useState(initialForms || []);
  const [savingRules, setSavingRules] = useState(false);

  useEffect(() => {
    setForms(initialForms || []);
  }, [initialForms]);

  function updateForm(index, patch) {
    setForms(prev => prev.map((form, i) => i === index ? { ...form, ...patch } : form));
  }

  const [saveError, setSaveError] = React.useState('');

  async function saveRules() {
    const toSave = forms.filter(f => f.enabled && f.keyword.trim());
    if (toSave.length === 0) { setSaveError('No rules to save — enter a keyword or untick all.'); return; }
    // Rules need at least a category OR a payee to be useful
    const noAction = toSave.filter(f => !f.catId && !(f.payee||'').trim());
    if (noAction.length > 0) {
      setSaveError(`${noAction.length} rule${noAction.length > 1 ? 's' : ''} need at least an account or payee. Fill them in or untick them.`);
      return;
    }
    setSaveError('');
    setSavingRules(true);
    const results = await Promise.allSettled(
      toSave.map((form, idx) =>
        createRule(org.id, {
          keyword:     form.keyword.trim().toLowerCase(),
          category_id: form.catId || null,
          payee_name:  (form.payee || '').trim(),
          sort_order:  (rules || []).length + idx,
        })
      )
    );

    const saved = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected');

    results.forEach(r => {
      if (r.status === 'fulfilled') {
        const rule = r.value;
        setRules(prev => [...(prev || []), {
          id:        rule.id,
          keyword:   rule.keyword,
          catId:     rule.category_id || '',
          payee:     rule.payee_name  || '',
          amtExact:  '',
          amtMin:    '',
          amtMax:    '',
          direction: '',
        }]);
      }
    });

    setSavingRules(false);

    if (failed.length > 0) {
      setSaveError(`${failed.length} rule(s) failed to save. ${saved} succeeded.`);
    }
    if (saved > 0) {
      onClose();
      toast(`${saved} rule${saved !== 1 ? 's' : ''} added.`);
    }
  }

  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width:860, maxHeight:'88vh', display:'flex', flexDirection:'column' }} onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Add auto-categorisation rules</h3>
            <div style={{ fontSize:11.5, color:'var(--stone)', marginTop:2 }}>
              Review and adjust before saving. Untick any you don't want.
            </div>
          </div>
          <button className="btn-ghost" style={{ padding:0, fontSize:18 }} onClick={onClose}>x</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'0 0 4px' }}>
          {forms.map((form, i) => (
            <div key={form.id || i} style={{ borderBottom:'0.5px solid var(--bd)', padding:'12px 16px', background:form.enabled?'#FDFAF6':'var(--sand)', opacity:form.enabled?1:0.5 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <input type="checkbox" checked={form.enabled} style={{ cursor:'pointer', flexShrink:0 }} onClick={e=>e.stopPropagation()}
                  onChange={e => updateForm(i, { enabled:e.target.checked })} />
                <span style={{ fontSize:11, color:'var(--stone)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  Seen x{form.count} - e.g. "{form.example}"
                </span>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div className="field" style={{ marginBottom:0 }}>
                  <label style={{ fontSize:10 }}>Keyword (in description)</label>
                  <input type="text" value={form.keyword} onClick={e=>e.stopPropagation()}
                    onChange={e=>updateForm(i, { keyword:e.target.value })}
                    style={{ fontSize:12 }} placeholder="e.g. goodlife" />
                </div>
                <div className="field" style={{ marginBottom:0 }}>
                  <label style={{ fontSize:10, display:'flex', alignItems:'center', gap:5 }}>
                    Assign account
                    {form.catId && form.catConfidence === 'high' && (
                      <span style={{ fontSize:9, padding:'1px 6px', borderRadius:99, background:'var(--gnb)', color:'var(--gn)', fontWeight:600 }}>auto</span>
                    )}
                    {form.catId && form.catConfidence === 'medium' && (
                      <span style={{ fontSize:9, padding:'1px 6px', borderRadius:99, background:'var(--al)', color:'var(--a2)', fontWeight:600 }}>~auto</span>
                    )}
                  </label>
                  {form._showNewAccount ? (
                    <NewAccountInline
                      cats={effectiveCats}
                      onSave={async (label, type, code) => {
                        try {
                          const payload = { label, type, account_group:label, colour:'#888780', sort_order:parseInt(code)||0, code };
                          const newCat = await createCategoryWithCode(org.id, payload);
                          const norm = { id:newCat.id, l:newCat.label, t:newCat.type, ac:newCat.account_group, col:newCat.colour, sort_order:newCat.sort_order, code:newCat.code||null, is_active:true };
                          setCats(prev => [...(prev||[]), norm]);
                          updateForm(i, { catId:newCat.id, catConfidence:'manual', _showNewAccount:false });
                        } catch(err) { alert('Error: ' + err.message); }
                      }}
                      onCancel={() => updateForm(i, { _showNewAccount:false })}
                    />
                  ) : (
                    <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                      <select value={form.catId} onClick={e=>e.stopPropagation()}
                        onChange={e => {
                          if (e.target.value === '__new__') { updateForm(i, { _showNewAccount:true }); }
                          else { updateForm(i, { catId:e.target.value, catConfidence:'manual' }); }
                        }}
                        style={{ fontSize:12, flex:1, borderColor: form.catId && form.catConfidence==='high' ? 'var(--gn)' : form.catId && form.catConfidence==='medium' ? 'var(--a2)' : '' }}>
                        <option value="">— choose account —</option>
                        <option value="__new__">＋ Create new account…</option>
                        {categorySections(effectiveCats).map(section => (
                          <optgroup key={section.type} label={section.label}>
                            {section.items.map(cat=>(
                              <option key={cat.id} value={cat.id}>{cat.code?`${cat.code} · `:''}{cat.l}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="field" style={{ marginBottom:0 }}>
                  <label style={{ fontSize:10 }}>Assign payee (optional)</label>
                  <input type="text" value={form.payee} onClick={e=>e.stopPropagation()}
                    onChange={e=>updateForm(i, { payee:e.target.value })}
                    style={{ fontSize:12 }} placeholder="e.g. Goodlife Fitness" />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6 }}>
                  <div className="field" style={{ marginBottom:0 }}>
                    <label style={{ fontSize:10 }}>Exact $ (opt)</label>
                    <input type="number" step="0.01" min="0" value={form.amtExact} onClick={e=>e.stopPropagation()}
                      onChange={e=>updateForm(i, { amtExact:e.target.value, amtMin:'', amtMax:'' })}
                      style={{ fontSize:12 }} placeholder="17.49" />
                  </div>
                  <div className="field" style={{ marginBottom:0 }}>
                    <label style={{ fontSize:10 }}>Min $ (opt)</label>
                    <input type="number" step="0.01" min="0" value={form.amtMin} disabled={!!form.amtExact} onClick={e=>e.stopPropagation()}
                      onChange={e=>updateForm(i, { amtMin:e.target.value, amtExact:'' })}
                      style={{ fontSize:12 }} placeholder="100" />
                  </div>
                  <div className="field" style={{ marginBottom:0 }}>
                    <label style={{ fontSize:10 }}>Max $ (opt)</label>
                    <input type="number" step="0.01" min="0" value={form.amtMax} disabled={!!form.amtExact} onClick={e=>e.stopPropagation()}
                      onChange={e=>updateForm(i, { amtMax:e.target.value, amtExact:'' })}
                      style={{ fontSize:12 }} placeholder="250" />
                  </div>
                  <div className="field" style={{ marginBottom:0 }}>
                    <label style={{ fontSize:10 }}>Direction</label>
                    <select value={form.direction} onClick={e=>e.stopPropagation()}
                      onChange={e=>updateForm(i, { direction:e.target.value })}
                      style={{ fontSize:12 }}>
                      <option value="">Any</option>
                      <option value="out">Out (debits)</option>
                      <option value="in">In (credits)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-foot" style={{ justifyContent:'space-between', borderTop:'0.5px solid var(--bd)' }}>
          <div style={{ fontSize:12, color:'var(--stone)' }}>
            {forms.filter(f=>f.enabled).length} of {forms.length} rules selected
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {saveError && (
              <span style={{ fontSize:11.5, color:'var(--rd)', flex:1 }}>{saveError}</span>
            )}
            <div style={{ fontSize:11, color:'var(--stone)', flex:1, lineHeight:1.5 }}>
              Skipping keeps these as <strong>pending suggestions</strong> visible in Transactions view.
            </div>
            <button className="btn btn-sm" onClick={onClose}>Skip for now</button>
            <button className="btn btn-a btn-sm" disabled={savingRules || forms.filter(f=>f.enabled&&f.keyword.trim()).length===0}
              onClick={saveRules}>
              {savingRules ? 'Saving...' : `Add ${forms.filter(f=>f.enabled&&f.keyword.trim()).length} rule${forms.filter(f=>f.enabled&&f.keyword.trim()).length!==1?'s':''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Parse a single file, return { filename, transactions, summary, error } ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
async function parseFile(file, existingTxns) {
  const isPDF = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  try {
    if (isPDF) {
      const result = await parsePDF(file, existingTxns);
      return { filename: file.name, transactions: result.transactions, summary: result.summary, debugRows: result.debugRows, fileType: 'pdf' };
    } else {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const { headers, rows } = parseCSVText(e.target.result);
            const colMap = autoDetectColumns(headers, file.name);
            const { transactions } = buildTransactions(rows, colMap, existingTxns);
            resolve({ filename: file.name, transactions, summary: null, headers, rows, colMap, fileType: 'csv' });
          } catch(err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }
  } catch(e) {
    return { filename: file.name, transactions: [], summary: null, error: e.message, fileType: isPDF ? 'pdf' : 'csv' };
  }
}

function calcRecon(pf, excludedKeys) {
  const { summary, transactions = [] } = pf;
  if (!summary) return null;
  const { openingBalance, closingBalance } = summary;
  if (openingBalance == null || closingBalance == null) return null;
  const included   = transactions.filter(t => !excludedKeys.has(t._key));
  const sumOfTxns  = included.reduce((s, t) => s + t.amt, 0);
  const expected   = closingBalance - openingBalance;
  const diff       = Math.abs(Math.abs(sumOfTxns) - Math.abs(expected));
  return {
    openingBalance, closingBalance, expected, sumOfTxns, diff,
    balanced:      diff < 0.05,
    totalCredits:  included.filter(t=>t.amt>0).reduce((s,t)=>s+t.amt,0),
    totalDebits:   Math.abs(included.filter(t=>t.amt<0).reduce((s,t)=>s+t.amt,0)),
  };
}

export { RuleBuilderModal, categorySections };
