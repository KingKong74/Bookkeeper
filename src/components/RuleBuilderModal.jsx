/**
 * components/RuleBuilderModal.jsx
 * Shared rule builder modal — used in ImportStatement and AutoCategorise.
 */
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { createRule } from '../lib/supabase';


const CAT_TYPE_ORDER  = ['income', 'expense', 'asset', 'liability', 'equity'];
const CAT_TYPE_LABELS = { income:'Income', expense:'Expenses', asset:'Assets', liability:'Liabilities', equity:'Equity' };

function categorySections(effectiveCats) {
  const sorted = [...(effectiveCats || [])].sort((a, b) => {
    const typeDiff = CAT_TYPE_ORDER.indexOf(a.t) - CAT_TYPE_ORDER.indexOf(b.t);
    return typeDiff || (a.l || '').localeCompare(b.l || '');
  });
  return CAT_TYPE_ORDER
    .map(type => ({ type, label: CAT_TYPE_LABELS[type], items: sorted.filter(cat => cat.t === type) }))
    .filter(section => section.items.length > 0);
}


function RuleBuilderModal({ initialForms, cats, setCats, rules, org, setRules, toast, onClose }) {
  const { cats: ctxCats, setCats: ctxSetCats } = useApp();
  const effectiveCats    = cats    ?? ctxCats;
  const effectiveSetCats = setCats ?? ctxSetCats;
  const [forms, setForms] = useState(initialForms || []);
  const [savingRules, setSavingRules] = useState(false);
  // Per-row inline create-category forms: { [rowIndex]: { name, type, saving } }
  const [newCatForms, setNewCatForms] = useState({});

  function openNewCatForm(i) {
    setNewCatForms(prev => ({ ...prev, [i]: { name: '', type: 'expense', saving: false } }));
  }
  function closeNewCatForm(i) {
    setNewCatForms(prev => { const n = {...prev}; delete n[i]; return n; });
  }
  async function saveNewCat(i) {
    const form = newCatForms[i];
    if (!form?.name?.trim()) return;
    setNewCatForms(prev => ({ ...prev, [i]: { ...prev[i], saving: true } }));
    try {
      const { createCategory } = await import('../lib/supabase');
      const newCat = await createCategory(org.id, {
        label:         form.name.trim(),
        type:          form.type,
        account_group: form.name.trim(),
        colour:        '#888780',
        sort_order:    (effectiveCats||[]).length,
      });
      const norm = { id:newCat.id, l:newCat.label, t:newCat.type, ac:newCat.account_group, col:newCat.colour };
      effectiveSetCats(prev => [...(prev||[]), norm]);
      updateForm(i, { catId: newCat.id, catConfidence:'manual' });
      closeNewCatForm(i);
    } catch(err) {
      setNewCatForms(prev => ({ ...prev, [i]: { ...prev[i], saving: false } }));
      toast?.('Error: ' + err.message);
    }
  }

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
    const missingCat = toSave.filter(f => !f.catId);
    if (missingCat.length > 0) {
      setSaveError(`${missingCat.length} rule${missingCat.length > 1 ? 's are' : ' is'} missing a category. Select a category or untick them.`);
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
                    Assign category
                    {form.catId && form.catConfidence === 'high' && (
                      <span style={{ fontSize:9, padding:'1px 6px', borderRadius:99, background:'var(--gnb)', color:'var(--gn)', fontWeight:600 }}>auto</span>
                    )}
                    {form.catId && form.catConfidence === 'medium' && (
                      <span style={{ fontSize:9, padding:'1px 6px', borderRadius:99, background:'var(--al)', color:'var(--a2)', fontWeight:600 }}>~auto</span>
                    )}
                  </label>
                  {newCatForms[i] ? (
                    /* Inline create-category form */
                    <div style={{ border:'0.5px solid var(--a)', borderRadius:'var(--rr)', padding:'8px 10px', background:'var(--ab)', display:'flex', flexDirection:'column', gap:6 }}>
                      <input autoFocus
                        value={newCatForms[i].name}
                        onChange={e => setNewCatForms(prev => ({ ...prev, [i]: { ...prev[i], name: e.target.value } }))}
                        onKeyDown={e => { if (e.key==='Enter') saveNewCat(i); if (e.key==='Escape') closeNewCatForm(i); }}
                        onClick={e => e.stopPropagation()}
                        placeholder="Category name…"
                        style={{ fontSize:12, padding:'4px 8px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)' }}
                      />
                      <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                        <select value={newCatForms[i].type}
                          onChange={e => setNewCatForms(prev => ({ ...prev, [i]: { ...prev[i], type: e.target.value } }))}
                          onClick={e => e.stopPropagation()}
                          style={{ flex:1, fontSize:11.5, padding:'3px 6px', border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)' }}>
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                          <option value="asset">Asset</option>
                          <option value="liability">Liability</option>
                          <option value="equity">Equity</option>
                        </select>
                        <button className="btn btn-a btn-sm"
                          disabled={!newCatForms[i].name?.trim() || newCatForms[i].saving}
                          onClick={e => { e.stopPropagation(); saveNewCat(i); }}
                          style={{ fontSize:11 }}>
                          {newCatForms[i].saving ? '…' : 'Create'}
                        </button>
                        <button className="btn btn-sm" onClick={e => { e.stopPropagation(); closeNewCatForm(i); }}
                          style={{ fontSize:11 }}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <select value={form.catId} onClick={e=>e.stopPropagation()}
                      onChange={e => {
                        if (e.target.value === '__new__') { openNewCatForm(i); }
                        else { updateForm(i, { catId:e.target.value, catConfidence:'manual' }); }
                      }}
                      style={{ fontSize:12, borderColor: form.catId && form.catConfidence==='high' ? 'var(--gn)' : form.catId && form.catConfidence==='medium' ? 'var(--a2)' : '' }}>
                      <option value="">— choose category —</option>
                      <option value="__new__">＋ Create new category…</option>
                      {categorySections(effectiveCats).map(section => (
                        <optgroup key={section.type} label={section.label}>
                          {section.items.map(cat=>(
                            <option key={cat.id} value={cat.id}>{cat.l}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
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
