/**
 * views/Banking/ImportStatement/ImportRuleBuilderModal.jsx
 * Rule builder modal shown after parsing — lets the user review and save
 * auto-categorisation rules discovered from repeating patterns.
 */
import React, { useState, useEffect } from 'react';
import { createRule } from '../../../lib/supabase';
import { categorySections } from './importHelpers';

export function ImportRuleBuilderModal({ initialForms, cats, rules, org, setRules, toast, onClose }) {
  const [forms, setForms]         = useState(initialForms || []);
  const [savingRules, setSaving]  = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => { setForms(initialForms || []); }, [initialForms]);

  function updateForm(i, patch) {
    setForms(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }

  async function saveRules() {
    const toSave = forms.filter(f => f.enabled && f.keyword.trim());
    if (!toSave.length) { setSaveError('No rules to save — enter a keyword or untick all.'); return; }
    const missingCat = toSave.filter(f => !f.catId);
    if (missingCat.length) { setSaveError(`${missingCat.length} rule${missingCat.length > 1 ? 's are' : ' is'} missing a category.`); return; }
    setSaveError('');
    setSaving(true);
    const results = await Promise.allSettled(
      toSave.map((f, idx) => createRule(org.id, {
        keyword: f.keyword.trim().toLowerCase(), category_id: f.catId || null,
        payee_name: (f.payee || '').trim(), sort_order: (rules || []).length + idx,
      }))
    );
    const saved = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');
    saved.forEach(r => {
      const rule = r.value;
      setRules(prev => [...(prev || []), { id: rule.id, keyword: rule.keyword, catId: rule.category_id || '', payee: rule.payee_name || '', amtExact: '', amtMin: '', amtMax: '', direction: '' }]);
    });
    setSaving(false);
    if (failed.length) { setSaveError(`${failed.length} rule(s) failed. ${saved.length} succeeded.`); }
    if (saved.length) { onClose(); toast(`${saved.length} rule${saved.length !== 1 ? 's' : ''} added.`); }
  }

  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Add auto-categorisation rules</h3>
            <div style={{ fontSize: 11.5, color: 'var(--stone)', marginTop: 2 }}>Review and adjust before saving. Untick any you don't want.</div>
          </div>
          <button className="btn-ghost" style={{ padding: 0, fontSize: 18 }} onClick={onClose}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 4px' }}>
          {forms.map((form, i) => (
            <div key={form.id || i} style={{ borderBottom: '0.5px solid var(--bd)', padding: '12px 16px', opacity: form.enabled ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <input type="checkbox" checked={form.enabled} onChange={e => updateForm(i, { enabled: e.target.checked })} style={{ cursor: 'pointer', flexShrink: 0 }} onClick={e => e.stopPropagation()} />
                <span style={{ fontSize: 11, color: 'var(--stone)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Seen ×{form.count} — e.g. "{form.example}"
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 10 }}>Keyword (in description)</label>
                  <input type="text" value={form.keyword} onChange={e => updateForm(i, { keyword: e.target.value })} style={{ fontSize: 12 }} placeholder="e.g. goodlife" onClick={e => e.stopPropagation()} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                    Assign category
                    {form.catId && form.catConfidence === 'high' && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'var(--gnb)', color: 'var(--gn)', fontWeight: 600 }}>auto</span>}
                    {form.catId && form.catConfidence === 'medium' && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'var(--al)', color: 'var(--a2)', fontWeight: 600 }}>~auto</span>}
                  </label>
                  <select value={form.catId} onChange={e => updateForm(i, { catId: e.target.value, catConfidence: 'manual' })}
                    style={{ fontSize: 12, borderColor: form.catId && form.catConfidence === 'high' ? 'var(--gn)' : '' }}
                    onClick={e => e.stopPropagation()}>
                    <option value="">- choose -</option>
                    {categorySections(cats).map(section => (
                      <optgroup key={section.type} label={section.label}>
                        {section.items.map(cat => <option key={cat.id} value={cat.id}>{cat.l}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 10 }}>Assign payee (optional)</label>
                  <input type="text" value={form.payee} onChange={e => updateForm(i, { payee: e.target.value })} style={{ fontSize: 12 }} placeholder="e.g. Goodlife Fitness" onClick={e => e.stopPropagation()} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                  {[
                    ['Exact $', 'amtExact', 'amtMin', 'amtMax', '17.49'],
                    ['Min $',   'amtMin',   null,     null,      '100'],
                    ['Max $',   'amtMax',   null,     null,      '250'],
                  ].map(([lbl, field, clear1, clear2, ph]) => (
                    <div key={field} className="field" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 10 }}>{lbl} (opt)</label>
                      <input type="number" step="0.01" min="0" value={form[field]}
                        disabled={field !== 'amtExact' && !!form.amtExact}
                        onChange={e => updateForm(i, { [field]: e.target.value, ...(clear1 ? { [clear1]: '', [clear2]: '' } : { amtExact: '' }) })}
                        style={{ fontSize: 12 }} placeholder={ph} onClick={e => e.stopPropagation()} />
                    </div>
                  ))}
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 10 }}>Direction</label>
                    <select value={form.direction} onChange={e => updateForm(i, { direction: e.target.value })} style={{ fontSize: 12 }} onClick={e => e.stopPropagation()}>
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

        <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, color: 'var(--stone)' }}>{forms.filter(f => f.enabled).length} of {forms.length} rules selected</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {saveError && <span style={{ fontSize: 11.5, color: 'var(--rd)' }}>{saveError}</span>}
            <span style={{ fontSize:10.5, color:"var(--stone)" }}>Skipping keeps as pending suggestions</span>
            <button className="btn btn-sm" onClick={onClose}>Skip for now</button>
            <button className="btn btn-a btn-sm" disabled={savingRules || !forms.filter(f => f.enabled && f.keyword.trim()).length} onClick={saveRules}>
              {savingRules ? 'Saving…' : `Add ${forms.filter(f => f.enabled && f.keyword.trim()).length} rule${forms.filter(f => f.enabled && f.keyword.trim()).length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
