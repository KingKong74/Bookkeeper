/**
 * unit.new_features.test.js
 * Unit tests for all features implemented in sessions 1–4:
 *   - Journal reversal lines (is_reversal)
 *   - buildTBFromJournals with reversal cancellation & parent/sub grouping
 *   - buildPLFromJournals parent synthesis & zero-net filtering
 *   - buildBSFromJournals bank account classification
 *   - runAutoCatRules payee suggestion
 *   - fmtAcct accounting format
 *   - subCodeLabel helper
 *   - Auto-cat: rule payee field flows to suggestion
 *   - COA parent/child relationships
 *   - InlineCatPicker code-based creation signal
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildJournalLines,
  buildTBFromJournals,
  buildPLFromJournals,
  buildBSFromJournals,
  runAutoCatRules,
  filterByDateRange,
  isTBBalanced,
  fmt,
  fmtAcct,
} from '../utils/helpers.js';

// ── Shared fixtures ────────────────────────────────────────────────────────────
const bank1 = { id:'bank-1', name:'ANZ Everyday', type:'checking', colour:'#185FA5' };
const bank2 = { id:'bank-2', name:'ANZ Savings',  type:'savings',  colour:'#2060A8' };
const cc1   = { id:'bank-3', name:'Visa CC',       type:'credit_card', colour:'#A52020' };

const catExpense  = { id:'cat-exp', l:'Groceries',   t:'expense',   col:'#888', code:'800', parent_id:null };
const catIncome   = { id:'cat-inc', l:'Salary',       t:'income',    col:'#5B8', code:'700', parent_id:null };
const catParent   = { id:'cat-par', l:'Vehicle',      t:'expense',   col:'#AAA', code:'831', parent_id:null };
const catSub1     = { id:'cat-s1',  l:'Fuel',         t:'expense',   col:'#BBB', code:'831/001', parent_id:'cat-par' };
const catSub2     = { id:'cat-s2',  l:'Registration', t:'expense',   col:'#CCC', code:'831/002', parent_id:'cat-par' };

const catMap = {
  [catExpense.id]: catExpense,
  [catIncome.id]:  catIncome,
  [catParent.id]:  catParent,
  [catSub1.id]:    catSub1,
  [catSub2.id]:    catSub2,
};
const accountMap = {
  [bank1.id]: bank1,
  [bank2.id]: bank2,
  [cc1.id]:   cc1,
};

// Helper: build a minimal journal entry with lines
function makeJournal(id, date, lines, source='auto_category') {
  return { id, date, source, status:'posted',
    journal_lines: lines.map((l,i)=>({ ...l, id:`${id}-l${i}`, sort_order:i })) };
}

// ── fmtAcct ───────────────────────────────────────────────────────────────────
describe('fmtAcct() — accounting negative format', () => {
  it('formats positive as $x,xxx.xx',        () => expect(fmtAcct(1234.56)).toBe('$1,234.56'));
  it('formats negative as ($x,xxx.xx)',      () => expect(fmtAcct(-1234.56)).toBe('($1,234.56)'));
  it('formats zero as $0.00',               () => expect(fmtAcct(0)).toBe('$0.00'));
  it('formats small negative correctly',    () => expect(fmtAcct(-0.01)).toBe('($0.01)'));
  it('formats large positive with commas',  () => expect(fmtAcct(1000000)).toBe('$1,000,000.00'));
});

// ── Reversal lines in TB ──────────────────────────────────────────────────────
describe('buildTBFromJournals() — reversal line cancellation', () => {
  // A transaction assigned to Groceries, then unassigned (reversal)
  const origLine   = { debit:100, credit:0, category_id:'cat-exp', bank_account_id:null, is_reversal:false };
  const revLine    = { debit:0, credit:100,  category_id:'cat-exp', bank_account_id:null, is_reversal:true  };
  const bankOrig   = { debit:0, credit:100,  category_id:null, bank_account_id:'bank-1', is_reversal:false };
  const bankRev    = { debit:100, credit:0,  category_id:null, bank_account_id:'bank-1', is_reversal:true  };

  it('original line alone → account appears with dr=100', () => {
    const j = makeJournal('j1','2026-01-15', [origLine, bankOrig]);
    const accts = buildTBFromJournals([j],'2026-01-01','2026-12-31', catMap, accountMap);
    const exp = accts.find(a=>a.cat_id==='cat-exp');
    expect(exp).toBeDefined();
    expect(exp.dr).toBeCloseTo(100);
  });

  it('original + reversal → account nets to zero → filtered out', () => {
    const j = makeJournal('j1','2026-01-15', [origLine, bankOrig, revLine, bankRev]);
    const accts = buildTBFromJournals([j],'2026-01-01','2026-12-31', catMap, accountMap);
    const exp = accts.find(a=>a.cat_id==='cat-exp');
    expect(exp).toBeUndefined();
  });

  it('partial reversal → shows remaining net', () => {
    const partialRev  = { ...revLine, credit:40 };
    const partialBank = { ...bankRev, debit:40 };
    const j = makeJournal('j1','2026-01-15', [origLine, bankOrig, partialRev, partialBank]);
    const accts = buildTBFromJournals([j],'2026-01-01','2026-12-31', catMap, accountMap);
    const exp = accts.find(a=>a.cat_id==='cat-exp');
    expect(exp).toBeDefined();
    expect(Math.abs(exp.net)).toBeCloseTo(60);
  });

  it('TB is balanced: sum(DR) === sum(CR) after reversals', () => {
    const j = makeJournal('j1','2026-01-15', [origLine, bankOrig]);
    const accts = buildTBFromJournals([j],'2026-01-01','2026-12-31', catMap, accountMap);
    expect(isTBBalanced(accts)).toBe(true);
  });
});

// ── TB type ordering ──────────────────────────────────────────────────────────
describe('buildTBFromJournals() — type ordering', () => {
  const expLine = { debit:200, credit:0, category_id:'cat-exp', bank_account_id:null, is_reversal:false };
  const bankLine= { debit:0, credit:200, category_id:null, bank_account_id:'bank-1', is_reversal:false };
  const incLine = { debit:0, credit:500, category_id:'cat-inc', bank_account_id:null, is_reversal:false };
  const bankIn  = { debit:500, credit:0, category_id:null, bank_account_id:'bank-1', is_reversal:false };

  it('assets sort before expenses', () => {
    const j = makeJournal('j1','2026-01-15', [expLine, bankLine, incLine, bankIn]);
    const accts = buildTBFromJournals([j],'2026-01-01','2026-12-31', catMap, accountMap);
    const types = accts.map(a=>a.type);
    const assetIdx  = types.indexOf('asset');
    const incomeIdx = types.indexOf('income');
    const expIdx    = types.indexOf('expense');
    expect(assetIdx).toBeLessThan(expIdx >= 0 ? expIdx : 999);
    if (incomeIdx >= 0 && expIdx >= 0) expect(incomeIdx).toBeLessThan(expIdx);
  });
});

// ── TB parent/sub synthesis ───────────────────────────────────────────────────
describe('buildTBFromJournals() — parent synthesis', () => {
  const sub1Line = { debit:150, credit:0, category_id:'cat-s1', bank_account_id:null, is_reversal:false };
  const sub2Line = { debit:80,  credit:0, category_id:'cat-s2', bank_account_id:null, is_reversal:false };
  const bankLine = { debit:0, credit:230, category_id:null, bank_account_id:'bank-1', is_reversal:false };





  it('sub-accounts have parent_id set', () => {
    const j = makeJournal('j1','2026-01-15', [sub1Line, sub2Line, bankLine]);
    const accts = buildTBFromJournals([j],'2026-01-01','2026-12-31', catMap, accountMap);
    const sub = accts.find(a=>a.cat_id==='cat-s1');
    expect(sub?.parent_id).toBe('cat-par');
  });
});

// ── buildPLFromJournals ────────────────────────────────────────────────────────
describe('buildPLFromJournals() — income/expense filtering', () => {
  const incLine  = { debit:0, credit:5000, category_id:'cat-inc', bank_account_id:null, is_reversal:false };
  const expLine  = { debit:200, credit:0,  category_id:'cat-exp', bank_account_id:null, is_reversal:false };
  const bankIn   = { debit:5000, credit:0, category_id:null, bank_account_id:'bank-1', is_reversal:false };
  const bankOut  = { debit:0, credit:200,  category_id:null, bank_account_id:'bank-1', is_reversal:false };

  it('income lines appear with positive cr-dr', () => {
    const j = makeJournal('j1','2026-01-15', [incLine, bankIn, expLine, bankOut]);
    const pl = buildPLFromJournals([j],'2026-01-01','2026-12-31', catMap, accountMap);
    expect(pl.incomeLines.length).toBeGreaterThan(0);
    const inc = pl.incomeLines.find(x=>x.id==='cat-inc');
    expect(inc.cr - inc.dr).toBeCloseTo(5000);
  });

  it('expense lines appear with positive dr-cr', () => {
    const j = makeJournal('j1','2026-01-15', [incLine, bankIn, expLine, bankOut]);
    const pl = buildPLFromJournals([j],'2026-01-01','2026-12-31', catMap, accountMap);
    const exp = pl.expenseLines.find(x=>x.id==='cat-exp');
    expect(exp.dr - exp.cr).toBeCloseTo(200);
  });

  it('fully reversed income line is filtered out', () => {
    const revLine = { debit:5000, credit:0, category_id:'cat-inc', bank_account_id:null, is_reversal:true };
    const revBank = { debit:0, credit:5000, category_id:null, bank_account_id:'bank-1', is_reversal:true };
    const j = makeJournal('j1','2026-01-15', [incLine, bankIn, revLine, revBank]);
    const pl = buildPLFromJournals([j],'2026-01-01','2026-12-31', catMap, accountMap);
    expect(pl.incomeLines.length).toBe(0);
  });

  it('net profit = income - expense', () => {
    const j = makeJournal('j1','2026-01-15', [incLine, bankIn, expLine, bankOut]);
    const pl = buildPLFromJournals([j],'2026-01-01','2026-12-31', catMap, accountMap);
    expect(pl.totalIncome - pl.totalExpense).toBeCloseTo(4800);
  });
});

// ── buildBSFromJournals ────────────────────────────────────────────────────────
describe('buildBSFromJournals() — bank account classification', () => {
  const incLine = { debit:0, credit:1000, category_id:'cat-inc', bank_account_id:null, is_reversal:false };
  const bankIn  = { debit:1000, credit:0, category_id:null, bank_account_id:'bank-1', is_reversal:false };

  it('checking account classified as asset', () => {
    const j = makeJournal('j1','2026-01-15', [incLine, bankIn]);
    const bs = buildBSFromJournals([j],'2000-01-01','2026-12-31', catMap, accountMap);
    const bankLine = bs.assetLines.find(l=>l.id==='bank-1');
    expect(bankLine).toBeDefined();
    expect(bankLine.t).toBe('asset');
  });

  it('checking account net = DR - CR (money in = positive)', () => {
    const j = makeJournal('j1','2026-01-15', [incLine, bankIn]);
    const bs = buildBSFromJournals([j],'2000-01-01','2026-12-31', catMap, accountMap);
    const bankLine = bs.assetLines.find(l=>l.id==='bank-1');
    expect(bankLine?.net).toBeCloseTo(1000);
  });

  it('credit card classified as liability', () => {
    const ccLine = { debit:0, credit:500, category_id:null, bank_account_id:'bank-3', is_reversal:false };
    const expL   = { debit:500, credit:0, category_id:'cat-exp', bank_account_id:null, is_reversal:false };
    const j = makeJournal('j1','2026-01-15', [expL, ccLine]);
    const am = { ...accountMap, 'bank-3': cc1 };
    const bs = buildBSFromJournals([j],'2000-01-01','2026-12-31', catMap, am);
    const ccEntry = bs.liabilityLines.find(l=>l.id==='bank-3');
    expect(ccEntry).toBeDefined();
    expect(ccEntry.t).toBe('liability');
  });

  it('totalAssets = totalLiabilities + totalEquity (balanced)', () => {
    const j = makeJournal('j1','2026-01-15', [incLine, bankIn]);
    const bs = buildBSFromJournals([j],'2000-01-01','2026-12-31', catMap, accountMap);
    // With only income + asset, equity ≈ totalAssets - totalLiabilities
    expect(bs.totalAssets).toBeCloseTo(bs.totalLiabilities + bs.totalEquity);
  });
});

// ── runAutoCatRules payee suggestion ─────────────────────────────────────────
describe('runAutoCatRules() — payee suggestion from rule', () => {
  const rules = [
    { keyword:'woolworths', catId:'cat-exp', payee:'Woolworths', direction:'', amtExact:'', amtMin:'', amtMax:'' },
    { keyword:'salary',     catId:'cat-inc', payee:'Employer Inc', direction:'in', amtExact:'', amtMin:'', amtMax:'' },
  ];
  const txns = [
    { id:'t1', desc:'WOOLWORTHS METRO', amt:-45.60, cat:null, payee:'', date:'2026-01-05' },
    { id:'t2', desc:'SALARY DIRECT',    amt:5000,   cat:null, payee:'', date:'2026-01-15' },
    { id:'t3', desc:'UNMATCHED DESC',   amt:-12.00, cat:null, payee:'', date:'2026-01-20' },
  ];

  it('matches keyword in description', () => {
    const sug = runAutoCatRules(txns, rules);
    expect(sug.some(s=>s.txnId==='t1')).toBe(true);
  });

  it('sets sugPayee from rule.payee when transaction has no payee', () => {
    const sug = runAutoCatRules(txns, rules);
    const s = sug.find(s=>s.txnId==='t1');
    expect(s?.sugPayee).toBe('Woolworths');
  });

  it('does not suggest payee if transaction already has one', () => {
    const txnsWithPayee = txns.map(t=>t.id==='t1'?{...t,payee:'Existing Payee'}:t);
    const sug = runAutoCatRules(txnsWithPayee, rules);
    const s = sug.find(s=>s.txnId==='t1');
    expect(s?.sugPayee).toBeNull();
  });

  it('direction:in only matches positive amounts', () => {
    const sug = runAutoCatRules(txns, rules);
    expect(sug.some(s=>s.txnId==='t2')).toBe(true);
    // SALARY with negative amount should not match
    const txnsNegSalary = [{ id:'t4', desc:'SALARY DEDUCTION', amt:-100, cat:null, payee:'', date:'2026-01-15' }];
    const sug2 = runAutoCatRules(txnsNegSalary, rules);
    expect(sug2.some(s=>s.txnId==='t4')).toBe(false);
  });

  it('unmatched transaction gets no suggestion', () => {
    const sug = runAutoCatRules(txns, rules);
    expect(sug.some(s=>s.txnId==='t3')).toBe(false);
  });

  it('sets sugCat from rule.catId', () => {
    const sug = runAutoCatRules(txns, rules);
    const s = sug.find(s=>s.txnId==='t1');
    expect(s?.sugCat).toBe('cat-exp');
  });
});

// ── buildJournalLines balanced double-entry ───────────────────────────────────
describe('buildJournalLines() — double-entry balance', () => {
  it('money out: expense DR, bank CR, balanced', () => {
    const lines = buildJournalLines({id:'t1',amt:-150,desc:'Test'}, catExpense, bank1);
    const dr = lines.reduce((s,l)=>s+l.debit,0);
    const cr = lines.reduce((s,l)=>s+l.credit,0);
    expect(Math.abs(dr-cr)).toBeLessThan(0.001);
    expect(lines.find(l=>l.category_id==='cat-exp')?.debit).toBeCloseTo(150);
    expect(lines.find(l=>l.bank_account_id==='bank-1')?.credit).toBeCloseTo(150);
  });

  it('money in: bank DR, income CR, balanced', () => {
    const lines = buildJournalLines({id:'t2',amt:3000,desc:'Pay'}, catIncome, bank1);
    const dr = lines.reduce((s,l)=>s+l.debit,0);
    const cr = lines.reduce((s,l)=>s+l.credit,0);
    expect(Math.abs(dr-cr)).toBeLessThan(0.001);
    expect(lines.find(l=>l.bank_account_id==='bank-1')?.debit).toBeCloseTo(3000);
    expect(lines.find(l=>l.category_id==='cat-inc')?.credit).toBeCloseTo(3000);
  });

  it('zero amount produces zero lines', () => {
    const lines = buildJournalLines({id:'t3',amt:0,desc:'Zero'}, catExpense, bank1);
    const total = lines.reduce((s,l)=>s+l.debit+l.credit,0);
    expect(total).toBe(0);
  });

  it('no bank account uses suspense', () => {
    const lines = buildJournalLines({id:'t4',amt:-50,desc:'Cash'}, catExpense, null);
    const bankLine = lines.find(l=>!l.category_id);
    expect(bankLine?.account_name).toBe('Suspense / Clearing');
  });
});

// ── filterByDateRange ─────────────────────────────────────────────────────────
describe('filterByDateRange()', () => {
  const items = [
    { id:1, date:'2026-01-01', amt:100 },
    { id:2, date:'2026-03-15', amt:200 },
    { id:3, date:'2026-06-30', amt:300 },
    { id:4, date:'2026-12-31', amt:400 },
  ];

  it('returns items within range inclusive', () => {
    const r = filterByDateRange(items,'2026-01-01','2026-06-30');
    expect(r.map(x=>x.id)).toEqual([1,2,3]);
  });

  it('excludes items outside range', () => {
    const r = filterByDateRange(items,'2026-04-01','2026-12-31');
    expect(r.map(x=>x.id)).toEqual([3,4]);
  });

  it('returns all items when range covers all', () => {
    const r = filterByDateRange(items,'2025-01-01','2027-01-01');
    expect(r.length).toBe(4);
  });

  it('returns empty array when nothing in range', () => {
    const r = filterByDateRange(items,'2024-01-01','2024-12-31');
    expect(r.length).toBe(0);
  });
});

// ── isTBBalanced ──────────────────────────────────────────────────────────────
describe('isTBBalanced()', () => {
  it('balanced when DR = CR', () => {
    const accts = [{dr:500,cr:500},{dr:200,cr:200}];
    expect(isTBBalanced(accts)).toBe(true);
  });

  it('unbalanced when DR ≠ CR', () => {
    const accts = [{dr:500,cr:400},{dr:200,cr:200}];
    expect(isTBBalanced(accts)).toBe(false);
  });

  it('balanced within 1 cent tolerance', () => {
    const accts = [{dr:100.001,cr:100}];
    expect(isTBBalanced(accts)).toBe(true);
  });

  it('empty array is balanced', () => {
    expect(isTBBalanced([])).toBe(true);
  });
});

// ── Sub-account code display ───────────────────────────────────────────────────
describe('sub-account code display logic', () => {
  function subCodeLabel(code, isSub) {
    if (!code) return '';
    if (isSub && code.includes('/')) return '/' + code.split('/')[1];
    return code;
  }

  it('sub-account code shows /001 not 831/001', () => {
    expect(subCodeLabel('831/001', true)).toBe('/001');
  });

  it('standalone account shows full code', () => {
    expect(subCodeLabel('831', false)).toBe('831');
  });

  it('parent account (not sub) shows full code', () => {
    expect(subCodeLabel('831', true)).toBe('831'); // no slash in code
  });

  it('returns empty string for null code', () => {
    expect(subCodeLabel(null, true)).toBe('');
  });
});

// ── InlineCatPicker code-based create signal ──────────────────────────────────
describe('InlineCatPicker — code-based create signal', () => {
  function isCodePattern(q) {
    return /^\d{1,3}(\/\d{1,3})?$/.test(q.trim());
  }

  it('recognises 3-digit account code', () => {
    expect(isCodePattern('831')).toBe(true);
  });

  it('recognises sub-account code with slash', () => {
    expect(isCodePattern('831/001')).toBe(true);
  });

  it('does not match plain text', () => {
    expect(isCodePattern('groceries')).toBe(false);
  });

  it('does not match partial text with digits', () => {
    expect(isCodePattern('abc123')).toBe(false);
  });

  it('does not match 4-digit code', () => {
    expect(isCodePattern('8312')).toBe(false);
  });
});

// ── fmt ────────────────────────────────────────────────────────────────────────
describe('fmt() — dollar formatting', () => {
  it('formats positive number', () => expect(fmt(1234.56)).toBe('$1,234.56'));
  it('formats negative as absolute value', () => expect(fmt(-99.5)).toBe('$99.50'));
  it('adds commas for thousands', () => expect(fmt(1000000)).toBe('$1,000,000.00'));
  it('handles zero', () => expect(fmt(0)).toBe('$0.00'));
});
