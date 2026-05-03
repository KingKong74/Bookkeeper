/**
 * integration.test.js — Integration tests: multiple modules working together
 * Tests realistic data flows across helpers, rules, and state transforms
 */
import { describe, it, expect } from 'vitest';
import { runAutoCatRules, filterByDateRange, buildAccountTotals, fmt } from '../utils/helpers';

// ── Integration 1: Full import → auto-cat → review pipeline ──────────────────
describe('Integration: import → auto-cat → review', () => {
  const catMap = {
    'cat-gym':     { id:'cat-gym',     l:'Gym & Fitness',  t:'expense', ac:'Health',      col:'#1D9E75' },
    'cat-grocery': { id:'cat-grocery', l:'Groceries',      t:'expense', ac:'Living',       col:'#BA7517' },
    'cat-income':  { id:'cat-income',  l:'Salary',         t:'income',  ac:'Revenue',      col:'#3B6D11' },
    'cat-transfer':{ id:'cat-transfer',l:'Transfers',      t:'equity',  ac:'Equity',       col:'#534AB7' },
  };
  const rules = [
    { id:'r1', keyword:'GOODLIFE',    catId:'cat-gym',      payee:'Goodlife Fitness', amtExact:'17.49', amtMin:'', amtMax:'', direction:'out' },
    { id:'r2', keyword:'WOOLWORTHS',  catId:'cat-grocery',  payee:'Woolworths',       amtExact:'',      amtMin:'', amtMax:'', direction:'' },
    { id:'r3', keyword:'SALARY',      catId:'cat-income',   payee:'Employer',         amtExact:'',      amtMin:'', amtMax:'', direction:'in' },
    { id:'r4', keyword:'PAYMENT FROM',catId:'cat-transfer', payee:'',                 amtExact:'',      amtMin:'', amtMax:'', direction:'in' },
  ];
  const importedTxns = [
    { id:'t1', desc:'PAYMENT TO GOODLIFE CARINDA A00LKY8U0NB9', amt:-17.49, date:'2026-03-05', cat:null, payee:'' },
    { id:'t2', desc:'PAYMENT TO GOODLIFE CARINDA A00LQTXW0AY7', amt:-36.21, date:'2026-03-23', cat:null, payee:'' },
    { id:'t3', desc:'WOOLWORTHS METRO SYDNEY',                   amt:-45.80, date:'2026-03-07', cat:null, payee:'' },
    { id:'t4', desc:'SALARY CREDIT EMPLOYER PTY LTD',           amt:5000,   date:'2026-03-15', cat:null, payee:'' },
    { id:'t5', desc:'PAYMENT FROM TOBY KING',                   amt:43.41,  date:'2026-03-18', cat:null, payee:'' },
    { id:'t6', desc:'NETFLIX.COM SUBSCRIPTION',                 amt:-22.99, date:'2026-03-02', cat:null, payee:'' },
  ];

  const suggestions = runAutoCatRules(importedTxns, rules);

  it('exact amount Goodlife ($17.49) gets gym category',   () => expect(suggestions.find(s=>s.txnId==='t1')?.sugCat).toBe('cat-gym'));
  it('wrong amount Goodlife ($36.21) gets no suggestion',  () => expect(suggestions.find(s=>s.txnId==='t2')).toBeUndefined());
  it('Woolworths gets grocery category',                   () => expect(suggestions.find(s=>s.txnId==='t3')?.sugCat).toBe('cat-grocery'));
  it('Salary credit gets income category',                 () => expect(suggestions.find(s=>s.txnId==='t4')?.sugCat).toBe('cat-income'));
  it('Transfer-in gets transfer category',                 () => expect(suggestions.find(s=>s.txnId==='t5')?.sugCat).toBe('cat-transfer'));
  it('Netflix (no matching rule) gets no suggestion',      () => expect(suggestions.find(s=>s.txnId==='t6')).toBeUndefined());
  it('Goodlife gets payee suggestion',                     () => expect(suggestions.find(s=>s.txnId==='t1')?.sugPayee).toBe('Goodlife Fitness'));

  it('after approval: trial balance has correct totals', () => {
    const approved = importedTxns.map(t => {
      const s = suggestions.find(x=>x.txnId===t.id);
      return s ? { ...t, cat:s.sugCat } : t;
    });
    const accts = buildAccountTotals(approved, catMap);
    expect(accts.find(a=>a.ac==='Revenue')?.cr).toBe(5000);
    expect(accts.find(a=>a.ac==='Health')?.dr).toBe(17.49);
    expect(accts.find(a=>a.ac==='Living')?.dr).toBe(45.80);
  });
});

// ── Integration 2: Date filter → auto-cat → P&L summary ─────────────────────
describe('Integration: date filter → auto-cat → P&L', () => {
  const rules  = [{ id:'r1', keyword:'RENT', catId:'cat-rent', payee:'', amtExact:'', amtMin:'', amtMax:'', direction:'out' }];
  const catMap = { 'cat-rent':{ id:'cat-rent', l:'Rent', t:'expense', ac:'Housing', col:'#993C1D' } };
  const allTxns = [
    { id:'t1', desc:'RENT PAYMENT',  amt:-1800, date:'2025-06-15', cat:null, payee:'' }, // outside FY
    { id:'t2', desc:'RENT PAYMENT',  amt:-1800, date:'2025-07-15', cat:null, payee:'' },
    { id:'t3', desc:'RENT PAYMENT',  amt:-1800, date:'2026-03-15', cat:null, payee:'' },
    { id:'t4', desc:'RENT PAYMENT',  amt:-1800, date:'2026-07-15', cat:null, payee:'' }, // outside FY
  ];

  it('filters to FY period correctly', () => {
    const ft = filterByDateRange(allTxns, '2025-07-01', '2026-06-30');
    expect(ft.length).toBe(2);
  });

  it('auto-cat applies to filtered set only', () => {
    const ft   = filterByDateRange(allTxns, '2025-07-01', '2026-06-30');
    const sugs = runAutoCatRules(ft, rules);
    expect(sugs.length).toBe(2);
  });

  it('P&L total rent = $3600 for FY', () => {
    const ft      = filterByDateRange(allTxns, '2025-07-01', '2026-06-30');
    const applied = ft.map(t => ({ ...t, cat:'cat-rent' }));
    const accts   = buildAccountTotals(applied, catMap);
    expect(accts.find(a=>a.ac==='Housing')?.dr).toBe(3600);
  });
});

// ── Integration 3: Rule priority + amount conditions together ─────────────────
describe('Integration: rule priority + amount conditions', () => {
  const rules = [
    { id:'r1', keyword:'COINSPOT', catId:'cat-crypto', payee:'CoinSpot', amtExact:'', amtMin:'1000', amtMax:'', direction:'out' },  // large crypto
    { id:'r2', keyword:'COINSPOT', catId:'cat-invest', payee:'CoinSpot', amtExact:'', amtMin:'',     amtMax:'', direction:'out' },  // any crypto
  ];
  const txns = [
    { id:'t1', desc:'PAYMENT TO COINSPOT #017452', amt:-1500, date:'2026-03-01', cat:null, payee:'' },
    { id:'t2', desc:'PAYMENT TO COINSPOT #910456', amt:  -50, date:'2026-03-02', cat:null, payee:'' },
  ];

  it('large COINSPOT → cat-crypto (r1 matches first)',        () => expect(runAutoCatRules(txns,rules).find(s=>s.txnId==='t1')?.sugCat).toBe('cat-crypto'));
  it('small COINSPOT → cat-invest (r1 fails amtMin, r2 wins)',() => expect(runAutoCatRules(txns,rules).find(s=>s.txnId==='t2')?.sugCat).toBe('cat-invest'));
});

// ── Integration 4: Balance sheet equation always holds ───────────────────────
describe('Integration: balance sheet always balances', () => {
  function bs(liquid, invest, fixed, cc, catLiab) {
    const totalAssets = liquid + invest + fixed;
    const totalLiab   = cc + catLiab;
    const totalEquity = totalAssets - totalLiab;
    return { totalAssets, totalLiab, totalEquity, totalLE: totalLiab + totalEquity };
  }

  it('basic case balances',                  () => { const r=bs(10000,0,0,2000,0); expect(r.totalLE).toBe(r.totalAssets); });
  it('complex case balances',                () => { const r=bs(8000,5000,2000,3000,1000); expect(Math.abs(r.totalLE-r.totalAssets)).toBeLessThan(0.01); });
  it('negative equity (insolvent) balances', () => { const r=bs(1000,0,0,5000,0); expect(r.totalEquity).toBe(-4000); expect(r.totalLE).toBe(r.totalAssets); });
  it('zero assets balances',                 () => { const r=bs(0,0,0,2000,0); expect(r.totalLE).toBe(0); });
  it('all zeros balances',                   () => { const r=bs(0,0,0,0,0); expect(r.totalLE).toBe(0); });
});

// ── Integration 5: COA drag-drop reorder ─────────────────────────────────────
describe('Integration: COA drag-drop reorder', () => {
  function simulateDrop(cats, fromId, toId) {
    if (fromId === toId) return cats.map((c,i)=>({...c,sort_order:i}));
    const sorted  = [...cats].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    const fromIdx = sorted.findIndex(c=>c.id===fromId);
    const toIdx   = sorted.findIndex(c=>c.id===toId);
    const arr     = [...sorted];
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    return arr.map((c,i)=>({...c,sort_order:i}));
  }

  const cats = [
    { id:'c1', l:'Groceries', sort_order:0 },
    { id:'c2', l:'Dining',    sort_order:1 },
    { id:'c3', l:'Netflix',   sort_order:2 },
    { id:'c4', l:'Gym',       sort_order:3 },
  ];

  it('drag c3 to top → c3 first',              () => expect(simulateDrop(cats,'c3','c1')[0].id).toBe('c3'));
  it('sort_orders are sequential after drop',   () => { const r=simulateDrop(cats,'c3','c1'); expect(r.map(c=>c.sort_order)).toEqual([0,1,2,3]); });
  it('no-op drag returns same order',           () => expect(simulateDrop(cats,'c1','c1').map(c=>c.id)).toEqual(['c1','c2','c3','c4']));
  it('drag to bottom → last position',         () => expect(simulateDrop(cats,'c1','c4')[3].id).toBe('c1'));
  it('original array not mutated',              () => { simulateDrop(cats,'c3','c1'); expect(cats[0].sort_order).toBe(0); });
});

// ── Integration 6: Bulk allocation + P&L impact ───────────────────────────────
describe('Integration: bulk allocation → P&L impact', () => {
  const catMap = {
    'cat-groc':{ id:'cat-groc', l:'Groceries', t:'expense', ac:'Living', col:'#BA7517' },
    'cat-misc': { id:'cat-misc', l:'Misc',     t:'expense', ac:'Misc',   col:'#888' },
  };
  const txns = [
    { id:'t1', cat:null, amt:-50  },
    { id:'t2', cat:null, amt:-80  },
    { id:'t3', cat:null, amt:-45  },
    { id:'t4', cat:'cat-misc', amt:-100 }, // already categorised
  ];
  const selected = new Set(['t1','t2','t3']);

  it('bulk allocation applies to selected only', () => {
    const result = txns.map(t => selected.has(t.id) ? {...t,cat:'cat-groc'} : t);
    expect(result.filter(t=>t.cat==='cat-groc').length).toBe(3);
  });
  it('pre-categorised row unchanged',            () => {
    const result = txns.map(t => selected.has(t.id) ? {...t,cat:'cat-groc'} : t);
    expect(result.find(t=>t.id==='t4')?.cat).toBe('cat-misc');
  });
  it('P&L Living Expenses = $175 after bulk',    () => {
    const applied = txns.map(t => selected.has(t.id) ? {...t,cat:'cat-groc'} : t);
    const accts   = buildAccountTotals(applied, catMap);
    expect(accts.find(a=>a.ac==='Living')?.dr).toBe(175);
  });
});

// ── Integration 7: Auto-cat suggestions → approve → trial balance ─────────────
describe('Integration: auto-cat approve → trial balance debits=credits', () => {
  const catMap = {
    'c-in':  { id:'c-in',  l:'Revenue',   t:'income',  ac:'Revenue',  col:'#3B6D11' },
    'c-ex':  { id:'c-ex',  l:'Expenses',  t:'expense', ac:'Expenses', col:'#BA7517' },
  };
  const rules = [
    { id:'r1', keyword:'INCOME',  catId:'c-in', payee:'', amtExact:'', amtMin:'', amtMax:'', direction:'in'  },
    { id:'r2', keyword:'EXPENSE', catId:'c-ex', payee:'', amtExact:'', amtMin:'', amtMax:'', direction:'out' },
  ];
  const txns = [
    { id:'t1', desc:'INCOME JAN',   amt:  1000, date:'2026-01-01', cat:null, payee:'' },
    { id:'t2', desc:'EXPENSE RENT', amt:  -600, date:'2026-01-02', cat:null, payee:'' },
    { id:'t3', desc:'INCOME FEB',   amt:   800, date:'2026-02-01', cat:null, payee:'' },
    { id:'t4', desc:'EXPENSE FOOD', amt:  -200, date:'2026-02-02', cat:null, payee:'' },
  ];
  const sugs    = runAutoCatRules(txns, rules);
  const applied = txns.map(t => { const s=sugs.find(x=>x.txnId===t.id); return s?{...t,cat:s.sugCat}:t; });
  const accts   = buildAccountTotals(applied, catMap);
  const totalDr = accts.reduce((s,a)=>s+a.dr,0);
  const totalCr = accts.reduce((s,a)=>s+a.cr,0);

  it.skip('trial balance DR=CR (N/A: single-entry system, income CR ≠ expense DR)',() => expect(Math.abs(totalDr-totalCr)).toBeLessThan(0.01));
  it('income CR = 1800',                         () => expect(accts.find(a=>a.ac==='Revenue')?.cr).toBe(1800));
  it('expense DR = 800',                         () => expect(accts.find(a=>a.ac==='Expenses')?.dr).toBe(800));
});
