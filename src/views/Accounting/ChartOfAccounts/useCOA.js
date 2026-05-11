/**
 * views/Accounting/ChartOfAccounts/useCOA.js
 * Hook encapsulating all Chart of Accounts state and operations.
 */
import { useState, useMemo, useRef } from 'react';
import { useApp } from '../../../context/AppContext';
import { createCategory, updateCategory, deleteCategory, deactivateCategory } from '../../../services/categoryService';
import {
  importFromMasterCOA, createCategoryWithCode, createReversalForCategory,
  reactivateCategory, updateTransaction,
} from '../../../lib/supabase';
import { postCategoryJournal } from '../../../services/journalService';
import { filterByDateRange } from '../../../utils/helpers';
import { TYPE_RANGES, TYPE_LABELS } from './coaData';

export function normaliseCat(c) {
  return { ...c, l: c.label ?? '', t: c.type ?? '', col: c.colour ?? '#888780', ac: c.account_group ?? '' };
}

export function useCOA() {
  const { cats, setCats, txns, setTxns, accounts, org, toast, dateFrom, dateTo, PALETTE, masterCOA } = useApp();
  const dragCatRef = useRef(null);

  const catBalances = useMemo(() => {
    const ft = filterByDateRange(txns, dateFrom, dateTo);
    const map = {};
    ft.forEach(t => { if (!t.cat) return; map[t.cat] = (map[t.cat] || 0) + (t.amt ?? 0); });
    return map;
  }, [txns, dateFrom, dateTo]);

  const bankBalances = useMemo(() => {
    const map = {};
    (accounts || []).forEach(a => {
      const txnTotal = (txns || []).filter(t => t.account_id === a.id).reduce((s, t) => s + (t.amt ?? 0), 0);
      map[a.id] = (a.opening_balance || 0) + txnTotal;
    });
    return map;
  }, [accounts, txns]);

  function suggestCode(type, label) {
    const [lo, hi] = TYPE_RANGES[type] || [800, 998];
    const used = new Set(
      (cats || []).filter(c => c.t === type && c.code && !c.code.includes('/')).map(c => parseInt(c.code)).filter(n => !isNaN(n) && n >= lo && n <= hi)
    );
    const peers = (cats || []).filter(c => c.t === type && c.is_active !== false && c.code && !c.code.includes('/')).sort((a, b) => (a.l || '').localeCompare(b.l || ''));
    const newLabel = (label || '').trim().toLowerCase();
    const insertIdx = newLabel ? peers.findIndex(p => (p.l || '').toLowerCase() > newLabel) : -1;
    const insertPos = insertIdx === -1 ? peers.length : insertIdx;
    const rangeSize = hi - lo + 1;
    const idealNum = lo + Math.round((insertPos / (peers.length + 1)) * rangeSize);
    for (let delta = 0; delta <= rangeSize; delta++) {
      if (!used.has(idealNum + delta) && idealNum + delta <= hi) return String(idealNum + delta);
      if (!used.has(idealNum - delta) && idealNum - delta >= lo) return String(idealNum - delta);
    }
    return '';
  }

  function onCatDragStart(e, cat) { dragCatRef.current = cat.id; e.dataTransfer.effectAllowed = 'move'; e.currentTarget.style.opacity = '0.4'; }
  function onCatDragEnd(e) { e.currentTarget.style.opacity = ''; }
  async function onCatDrop(e, targetCat) {
    e.preventDefault();
    const fromId = dragCatRef.current; dragCatRef.current = null;
    if (!fromId || fromId === targetCat.id) return;
    setCats(prev => {
      const sameType = prev.filter(c => c.t === targetCat.t).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const fromIdx = sameType.findIndex(c => c.id === fromId), toIdx = sameType.findIndex(c => c.id === targetCat.id);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const reordered = [...sameType]; const [moved] = reordered.splice(fromIdx, 1); reordered.splice(toIdx, 0, moved);
      const updated = reordered.map((c, i) => ({ ...c, sort_order: i }));
      updated.forEach(cat => updateCategory(cat.id, { sort_order: cat.sort_order }).catch(() => {}));
      const updatedIds = new Set(updated.map(c => c.id));
      return prev.map(c => updatedIds.has(c.id) ? updated.find(u => u.id === c.id) : c);
    });
  }

  async function saveAccount(editingId, form) {
    if (!form.label?.trim()) { toast('Name is required.'); return false; }
    if (!form.code?.trim()) { toast('Account code is required (e.g. 820).'); return false; }
    // Duplicate code check — runs for both new accounts AND updates
    const codeConflict = (cats || []).find(x => x.code === form.code.trim() && x.l && x.id !== editingId);
    if (codeConflict) { toast(`Code ${form.code} is already used by "${codeConflict.l}".`); return false; }
    if (editingId !== 'new') {
      const existing = (cats || []).find(c => c.id === editingId);
      if (existing && existing.t !== form.type) {
        const txnCount = (txns || []).filter(t => t.cat === editingId).length;
        const childIds = (cats || []).filter(ch => ch.parent_id === editingId).map(ch => ch.id);
        const totalAffected = txnCount + (txns || []).filter(t => childIds.includes(t.cat)).length;
        const msg = `Change type from "${existing.t}" to "${form.type}"? ${totalAffected > 0 ? `${totalAffected} transactions` : 'This account'} will be reclassified.`;
        if (!window.confirm(msg)) { toast('Type change cancelled.'); return false; }
      }
    }
    const payload = {
      label: form.label.trim(), type: form.type,
      account_group: form.account_group?.trim() || TYPE_LABELS[form.type],
      colour: form.colour || PALETTE[(cats || []).length % PALETTE.length],
      sort_order: form.sort_order ?? (cats || []).length,
      code: form.code || null, parent_id: form.parent_id || null,
    };
    try {
      if (editingId === 'new') {
        const created = form.code
          ? await createCategoryWithCode(org.id, { ...payload, sort_order: parseInt(form.code) || (cats || []).length })
          : await createCategory(org.id, payload);
        setCats(prev => [...prev, normaliseCat(created)]);
        if (form.parent_id) {
          const parentTxns = (txns || []).filter(t => t.cat === form.parent_id);
          if (parentTxns.length > 0) {
            await Promise.all(parentTxns.map(t => updateTransaction(t.id, { category_id: created.id })));
            setTxns(prev => (prev || []).map(t => t.cat === form.parent_id ? { ...t, cat: created.id, category_id: created.id } : t));
            const nc = normaliseCat(created);
            await Promise.all(parentTxns.map(t => { const acct = t.account_id ? (accounts || []).find(a => a.id === t.account_id) : null; return postCategoryJournal(org.id, t, nc, acct).catch(() => {}); }));
            toast(`Account created. ${parentTxns.length} transaction${parentTxns.length > 1 ? 's' : ''} moved.`);
          } else { toast('Account created.'); }
        } else { toast('Account created.'); }
      } else {
        const existing = (cats || []).find(cx => cx.id === editingId);
        const oldCode = existing?.code, oldParentId = existing?.parent_id || null;
        const updated = await updateCategory(editingId, payload);
        setCats(prev => prev.map(x => x.id === editingId ? normaliseCat(updated) : x));
        const newParentId = form.parent_id || null;
        if (newParentId !== oldParentId) {
          toast(newParentId ? 'Account moved under new parent.' : 'Account promoted to top-level.');
          return true;
        }
        // Duplicate code check runs for both new AND updates
        if (oldCode && form.code && oldCode !== form.code.trim()) {
          const children = (cats || []).filter(ch => ch.parent_id === editingId);
          if (children.length > 0) {
            await Promise.all(children.map(async ch => {
              const suffix = (ch.code || '').split('/')[1] || '';
              const newCode = suffix ? `${form.code.trim()}/${suffix}` : ch.code;
              if (newCode !== ch.code) { const updCh = await updateCategory(ch.id, { code: newCode }).catch(() => null); if (updCh) setCats(prev => prev.map(x => x.id === ch.id ? { ...x, code: newCode } : x)); }
            }));
            toast('Account updated. Sub-account codes synced.');
          } else { toast('Account updated.'); }
        } else { toast('Account updated.'); }
      }
      return true;
    } catch (e) { toast('Error: ' + e.message); return false; }
  }

  async function deactivateAccount(cat) {
    const childIds = (cats || []).filter(ch => ch.parent_id === cat.id).map(ch => ch.id);
    const toDeactivate = [cat.id, ...childIds];
    const linked = (txns || []).filter(t => toDeactivate.includes(t.cat));
    try {
      if (linked.length > 0) {
        await Promise.all(linked.map(t => updateTransaction(t.id, { category_id: null })));
        setTxns(prev => (prev || []).map(t => toDeactivate.includes(t.cat) ? { ...t, cat: null } : t));
      }
      await Promise.all(toDeactivate.map(id => deactivateCategory(id)));
      await Promise.all(toDeactivate.map(id => createReversalForCategory(org.id, id).catch(() => {})));
      setCats(prev => prev.map(c => toDeactivate.includes(c.id) ? { ...c, is_active: false } : c));
      const sub = childIds.length > 0 ? ` + ${childIds.length} sub-account${childIds.length > 1 ? 's' : ''}` : '';
      toast(`Account${sub} set to inactive.${linked.length > 0 ? ` ${linked.length} transaction${linked.length > 1 ? 's' : ''} unassigned.` : ''}`);
      return true;
    } catch (e) { toast('Error: ' + e.message); return false; }
  }

  async function reactivateAccount(id) {
    try { await reactivateCategory(id); setCats(prev => prev.map(c => c.id === id ? { ...c, is_active: true } : c)); toast('Account reactivated.'); }
    catch (e) { toast('Error: ' + e.message); }
  }

  async function hardDeleteAccount(cat) {
    try {
      const children = (cats || []).filter(ch => ch.parent_id === cat.id);
      await Promise.all(children.map(ch => deleteCategory(ch.id)));
      await deleteCategory(cat.id);
      const allIds = [cat.id, ...children.map(c => c.id)];
      setCats(prev => prev.filter(c => !allIds.includes(c.id)));
      toast(`"${cat.l}"${children.length > 0 ? ` and ${children.length} sub-account${children.length > 1 ? 's' : ''}` : ''} permanently deleted.`);
      return true;
    } catch (e) { toast('Error: ' + e.message); return false; }
  }

  async function seedAccounts(mode, templateKey, templateMap) {
    const template = templateMap[templateKey] || [];
    try {
      if (mode === 'replace') {
        await Promise.all((cats || []).map(c => deactivateCategory(c.id).catch(() => {})));
        setCats(prev => prev.map(c => ({ ...c, is_active: false })));
      }
      const existing = mode === 'add' ? new Set((cats || []).filter(c => c.is_active !== false).map(c => c.code).filter(Boolean)) : new Set();
      let added = 0;
      for (const a of template) {
        if (existing.has(a.code)) continue;
        const created = await createCategoryWithCode(org.id, { label: a.label, type: a.type, account_group: a.group, colour: a.colour, code: a.code, sort_order: parseInt(a.code) || added });
        setCats(prev => [...prev, normaliseCat(created)]); added++;
      }
      toast(`${added} accounts ${mode === 'replace' ? 'seeded' : 'added'}.`); return true;
    } catch (e) { toast('Error: ' + e.message); return false; }
  }

  async function importFromMaster(selectedIds, masterCOAList) {
    const toImport = masterCOAList.filter(m => selectedIds.has(m.id)); if (!toImport.length) return false;
    try {
      const created = await importFromMasterCOA(org.id, toImport);
      setCats(prev => [...prev, ...created.map(normaliseCat)]); toast(`${created.length} accounts added.`); return true;
    } catch (e) { toast('Error: ' + e.message); return false; }
  }

  return { cats, setCats, txns, setTxns, accounts, org, toast, PALETTE, masterCOA, catBalances, bankBalances, dateFrom, dateTo, suggestCode, onCatDragStart, onCatDragEnd, onCatDrop, saveAccount, deactivateAccount, reactivateAccount, hardDeleteAccount, seedAccounts, importFromMaster };
}
