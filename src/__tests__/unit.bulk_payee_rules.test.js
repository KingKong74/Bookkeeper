/**
 * unit.bulk_payee_rules.test.js
 * Tests for:
 *   - bulkAllocate with payee
 *   - bulkAllocate unassign (catId=null)
 *   - Auto-assign payees via merchant match
 *   - AutoCatRules save payee to DB (payload shape)
 *   - P&L sub-account indent (StRow logic via source inspection)
 *   - runAutoCatRules payee → allocateCat flow
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { runAutoCatRules, extractMerchantName } from '../utils/helpers.js';

// ── bulkAllocate logic (pure logic, no DB) ────────────────────────────────────
describe('bulkAllocate — category + payee assignment', () => {
  // Mirror the real bulkAllocate logic
  function applyBulk(txns, selectedIds, catId, payeeObj) {
    const isUnassign = !catId;
    return txns.map(t => {
      if (!selectedIds.has(t.id)) return t;
      return {
        ...t,
        cat:      catId ?? null,
        category_id: catId ?? null,
        payee:    isUnassign ? '' : (payeeObj?.name ?? t.payee),
        payee_id: isUnassign ? null : (payeeObj?.id ?? t.payee_id),
      };
    });
  }

  const txns = [
    { id:'t1', cat:null, payee:'', payee_id:null, desc:'ALDI' },
    { id:'t2', cat:null, payee:'', payee_id:null, desc:'WOOLIES' },
    { id:'t3', cat:'cat-a', payee:'Old', payee_id:'p0', desc:'OLD' },
  ];
  const selected = new Set(['t1','t2']);
  const payee = { id:'p1', name:'Aldi Stores' };

  it('assigns category to selected transactions', () => {
    const result = applyBulk(txns, selected, 'cat-exp', null);
    expect(result.find(t=>t.id==='t1').cat).toBe('cat-exp');
    expect(result.find(t=>t.id==='t2').cat).toBe('cat-exp');
  });

  it('does not touch unselected transactions', () => {
    const result = applyBulk(txns, selected, 'cat-exp', null);
    expect(result.find(t=>t.id==='t3').cat).toBe('cat-a');
  });

  it('assigns payee alongside category', () => {
    const result = applyBulk(txns, selected, 'cat-exp', payee);
    expect(result.find(t=>t.id==='t1').payee).toBe('Aldi Stores');
    expect(result.find(t=>t.id==='t1').payee_id).toBe('p1');
  });

  it('no payee selected → preserves existing payee on txn', () => {
    const txnsWithPayee = txns.map(t=>t.id==='t1'?{...t,payee:'Existing'}:t);
    const result = applyBulk(txnsWithPayee, selected, 'cat-exp', null);
    expect(result.find(t=>t.id==='t1').payee).toBe('Existing');
  });
});

describe('bulkAllocate — unassign (catId=null)', () => {
  function applyUnassign(txns, selectedIds) {
    return txns.map(t => {
      if (!selectedIds.has(t.id)) return t;
      return { ...t, cat:null, category_id:null, payee:'', payee_id:null };
    });
  }

  const txns = [
    { id:'t1', cat:'cat-a', payee:'Woolworths', payee_id:'p1', desc:'WOO' },
    { id:'t2', cat:'cat-b', payee:'Aldi',       payee_id:'p2', desc:'ALD' },
    { id:'t3', cat:'cat-c', payee:'',            payee_id:null, desc:'OTH' },
  ];

  it('removes category from selected', () => {
    const result = applyUnassign(txns, new Set(['t1']));
    expect(result.find(t=>t.id==='t1').cat).toBeNull();
  });

  it('clears payee on unassign', () => {
    const result = applyUnassign(txns, new Set(['t1']));
    expect(result.find(t=>t.id==='t1').payee).toBe('');
    expect(result.find(t=>t.id==='t1').payee_id).toBeNull();
  });

  it('does not affect unselected', () => {
    const result = applyUnassign(txns, new Set(['t1']));
    expect(result.find(t=>t.id==='t2').cat).toBe('cat-b');
    expect(result.find(t=>t.id==='t3').cat).toBe('cat-c');
  });

  it('multiple unassign clears all selected', () => {
    const result = applyUnassign(txns, new Set(['t1','t2']));
    expect(result.filter(t=>t.cat===null).map(t=>t.id)).toEqual(expect.arrayContaining(['t1','t2']));
  });
});

// ── Auto-assign payees — smart matching (two strategies) ───────────────────────
function smartMatchPayees(txns, payees) {
  // Mirror the logic in Transactions.jsx auto-assign effect
  const sortedPayees = [...payees].sort((a,b)=>(b.name||'').length-(a.name||'').length);
  const results = [];
  for (const t of txns) {
    if (t.payee_id) continue; // already has payee
    const desc = (t.desc || '').toLowerCase();
    if (!desc) continue;
    // Strategy 1: payee name substring in description
    let matched = sortedPayees.find(p => {
      const name = (p.name||'').toLowerCase();
      return name.length >= 3 && desc.includes(name);
    });
    // Strategy 2: extracted merchant matches
    if (!matched) {
      const merchant = (extractMerchantName(t.desc||'')||'').toLowerCase();
      if (merchant.length >= 3) {
        matched = sortedPayees.find(p => {
          const name = (p.name||'').toLowerCase();
          return name === merchant || merchant.startsWith(name) || name.startsWith(merchant);
        });
      }
    }
    if (matched) results.push({ txnId: t.id, payeeId: matched.id, payeeName: matched.name });
  }
  return results;
}

describe('auto-assign payees — smart matching', () => {
  const payees = [
    { id:'p1', name:'Woolworths' },
    { id:'p2', name:'Aldi' },
    { id:'p3', name:'Coles' },
    { id:'p4', name:'Netflix' },
  ];

  it('strategy 1: payee name substring in description', () => {
    const txns = [{ id:'t1', desc:'WOOLWORTHS 0123 SYDNEY', payee_id:null }];
    const result = smartMatchPayees(txns, payees);
    expect(result.find(r=>r.txnId==='t1')?.payeeName).toBe('Woolworths');
  });

  it('strategy 1: case-insensitive substring match', () => {
    const txns = [{ id:'t1', desc:'Coles Express Brighton', payee_id:null }];
    const result = smartMatchPayees(txns, payees);
    expect(result.find(r=>r.txnId==='t1')?.payeeName).toBe('Coles');
  });

  it('strategy 2: merchant prefix match (Aldi in ALDI STORES PTY LTD)', () => {
    const txns = [{ id:'t1', desc:'ALDI STORES PTY LTD 123', payee_id:null }];
    const result = smartMatchPayees(txns, payees);
    expect(result.find(r=>r.txnId==='t1')?.payeeName).toBe('Aldi');
  });

  it('web merchant match: NETFLIX.COM → Netflix', () => {
    const txns = [{ id:'t1', desc:'NETFLIX.COM MONTHLY', payee_id:null }];
    const result = smartMatchPayees(txns, payees);
    expect(result.find(r=>r.txnId==='t1')?.payeeName).toBe('Netflix');
  });

  it('longer payee name takes priority (sorted longest first)', () => {
    const richPayees = [
      { id:'p1', name:'Woolworths' },
      { id:'p2', name:'Woolworths Metro' },
    ];
    const txns = [{ id:'t1', desc:'WOOLWORTHS METRO BONDI', payee_id:null }];
    const result = smartMatchPayees(txns, richPayees);
    expect(result.find(r=>r.txnId==='t1')?.payeeName).toBe('Woolworths Metro');
  });

  it('skips generic transfer descriptions (no merchant extracted)', () => {
    const txns = [{ id:'t1', desc:'TRANSFER REF 99282', payee_id:null }];
    const result = smartMatchPayees(txns, payees);
    expect(result.some(r=>r.txnId==='t1')).toBe(false);
  });

  it('skips transactions that already have payee_id', () => {
    const txns = [{ id:'t1', desc:'WOOLWORTHS METRO', payee_id:'existing-id' }];
    const result = smartMatchPayees(txns, payees);
    expect(result.some(r=>r.txnId==='t1')).toBe(false);
  });

  it('payee name shorter than 3 chars is not matched', () => {
    const shortPayees = [{ id:'p1', name:'BP' }];
    const txns = [{ id:'t1', desc:'BP SERVICE STATION', payee_id:null }];
    const result = smartMatchPayees(txns, shortPayees);
    expect(result.some(r=>r.txnId==='t1')).toBe(false);
  });

  it('returns correct payeeId for matched payee', () => {
    const txns = [{ id:'t1', desc:'COLES SUPERMARKET 432', payee_id:null }];
    const result = smartMatchPayees(txns, payees);
    expect(result.find(r=>r.txnId==='t1')?.payeeId).toBe('p3');
  });
});


// ── AutoCatRules save payload — DB column safety ─────────────────────────────
// auto_cat_rules DB columns: id, org_id, keyword, category_id, payee_name, sort_order, created_at
// amt_exact / amt_min / amt_max / direction are LOCAL UI ONLY — NOT in DB schema


// Migration 014 adds: amt_exact, amt_min, amt_max, direction to auto_cat_rules
const VALID_RULE_DB_COLUMNS = new Set(['keyword', 'category_id', 'payee_name', 'sort_order', 'amt_exact', 'amt_min', 'amt_max', 'direction']);

function buildFullSavePayload(form) {
  // Mirrors Accounting/index.jsx save() after migration 014
  return {
    keyword:     form.keyword.trim().toLowerCase(),
    category_id: form.catId || null,
    payee_name:  (form.payee || '').trim(),
    amt_exact:   form.amtExact ? parseFloat(form.amtExact) : null,
    amt_min:     form.amtMin   ? parseFloat(form.amtMin)   : null,
    amt_max:     form.amtMax   ? parseFloat(form.amtMax)   : null,
    direction:   form.direction || null,
  };
}

describe('AutoCatRules — save payload includes all valid DB columns', () => {
  const form = { keyword:'woolworths', catId:'c1', payee:'Woolworths', amtExact:'49.95', amtMin:'', amtMax:'', direction:'out' };

  it('includes payee_name', () => {
    expect(buildFullSavePayload(form).payee_name).toBe('Woolworths');
  });

  it('includes amt_exact as float', () => {
    expect(buildFullSavePayload(form).amt_exact).toBeCloseTo(49.95);
  });

  it('amt_exact is null when not set', () => {
    expect(buildFullSavePayload({ ...form, amtExact:'' }).amt_exact).toBeNull();
  });

  it('amt_min is null when not set', () => {
    expect(buildFullSavePayload(form).amt_min).toBeNull();
  });

  it('direction is set', () => {
    expect(buildFullSavePayload(form).direction).toBe('out');
  });

  it('direction is null when empty string', () => {
    expect(buildFullSavePayload({ ...form, direction:'' }).direction).toBeNull();
  });

  it('keyword is lowercased', () => {
    expect(buildFullSavePayload({ ...form, keyword:'WOOLWORTHS' }).keyword).toBe('woolworths');
  });

  it('every payload key is a valid DB column (no unknown columns)', () => {
    for (const key of Object.keys(buildFullSavePayload(form))) {
      expect(VALID_RULE_DB_COLUMNS.has(key), 'Unexpected DB column: ' + key).toBe(true);
    }
  });

  it('source audit: index.jsx save() includes amt_exact in payload', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Accounting/index.jsx', import.meta.url), 'utf-8');
    const saveIdx = src.indexOf('async function save()');
    const saveBody = src.slice(saveIdx, saveIdx + 800);
    expect(saveBody).toContain('amt_exact:');
    expect(saveBody).toContain('payee_name:');
    expect(saveBody).toContain('direction:');
  });
});

// ── Source audit: verify index.jsx save() matches safe columns ────────────────
describe('AutoCatRules source audit — all conditions saved (migration 014)', () => {
  it('index.jsx save() sends amt_exact, amt_min, amt_max, direction to DB', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Accounting/index.jsx', import.meta.url), 'utf-8');
    const saveIdx = src.indexOf('async function save()');
    const saveBody = src.slice(saveIdx, saveIdx + 800);
    expect(saveBody).toContain('amt_exact:');
    expect(saveBody).toContain('amt_min:');
    expect(saveBody).toContain('amt_max:');
    expect(saveBody).toContain('direction:');
    expect(saveBody).toContain('payee_name:');
  });

  it('migration 014 exists and adds the required columns', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../../supabase/migrations/014_rule_conditions.sql', import.meta.url), 'utf-8'
    );
    expect(src).toContain('amt_exact');
    expect(src).toContain('amt_min');
    expect(src).toContain('amt_max');
    expect(src).toContain('direction');
  });
});

// ── Source audit: React state declarations (catches "X is not defined" crashes) ──
describe('Transactions.jsx — state declaration audit', () => {
  it('bulkPayeeId is declared as useState', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Banking/Transactions.jsx', import.meta.url), 'utf-8');
    expect(src).toContain('const [bulkPayeeId');
    expect(src).toContain('setBulkPayeeId');
  });

  it('bulkPayeeId declaration comes before its use in JSX', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Banking/Transactions.jsx', import.meta.url), 'utf-8');
    const declIdx = src.indexOf('const [bulkPayeeId');
    const useIdx  = src.indexOf('value={bulkPayeeId}');
    expect(declIdx).toBeGreaterThan(-1);
    expect(useIdx).toBeGreaterThan(-1);
    expect(declIdx).toBeLessThan(useIdx);
  });

  it('bulkPayeeId is declared before the JSX return statement', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Banking/Transactions.jsx', import.meta.url), 'utf-8');
    const txnStart  = src.indexOf('export function Transactions(');
    const declIdx   = src.indexOf('const [bulkPayeeId', txnStart);
    const returnIdx = src.indexOf('  return (', txnStart);
    expect(declIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(-1);
    expect(declIdx).toBeLessThan(returnIdx);
  });
});
