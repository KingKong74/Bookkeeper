/**
 * integration.new_features.test.js
 * Integration tests for complex feature workflows:
 *   - Journal reversal end-to-end flow
 *   - TB parent/sub drill path
 *   - Auto-cat rule → payee assignment chain
 *   - P&L parent synthesis with subs
 *   - BS cumulative balance calculation
 *   - Rule builder payee validation
 */

import { describe, it, expect } from 'vitest';
import {
  buildJournalLines,
  buildTBFromJournals,
  buildPLFromJournals,
  buildBSFromJournals,
  runAutoCatRules,
  isTBBalanced,
  fmtAcct,
} from '../utils/helpers.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const bank    = { id:'b1', name:'Checking', type:'checking', colour:'#185FA5' };
const catExp  = { id:'e1', l:'Groceries', t:'expense', col:'#E88', code:'800', parent_id:null };
const catInc  = { id:'i1', l:'Salary',    t:'income',  col:'#8E8', code:'700', parent_id:null };
const catPar  = { id:'p1', l:'Vehicle',   t:'expense', col:'#AAA', code:'831', parent_id:null };
const catS1   = { id:'s1', l:'Fuel',      t:'expense', col:'#BBB', code:'831/001', parent_id:'p1' };
const catS2   = { id:'s2', l:'Rego',      t:'expense', col:'#CCC', code:'831/002', parent_id:'p1' };

const catMap  = { e1:catExp, i1:catInc, p1:catPar, s1:catS1, s2:catS2 };
const acctMap = { b1:bank };

function makeJ(id, date, lines) {
  return { id, date, source:'auto_category', status:'posted',
    journal_lines: lines.map((l,i)=>({ ...l, id:`${id}-${i}` })) };
}

// ── Scenario 1: Assign category → unassign → net zero in TB ──────────────────
describe('Scenario: assign then unassign transaction', () => {
  const origDR = { debit:85, credit:0, category_id:'e1', bank_account_id:null, is_reversal:false };
  const origCR = { debit:0, credit:85, category_id:null, bank_account_id:'b1', is_reversal:false };
  const revDR  = { debit:0, credit:85, category_id:'e1', bank_account_id:null, is_reversal:true  };
  const revCR  = { debit:85, credit:0, category_id:null, bank_account_id:'b1', is_reversal:true  };
  const j = makeJ('j1', '2026-02-10', [origDR, origCR, revDR, revCR]);

  it('TB is balanced after assign+unassign', () => {
    const accts = buildTBFromJournals([j],'2026-01-01','2026-12-31',catMap,acctMap);
    expect(isTBBalanced(accts.filter(a=>!a.synthetic))).toBe(true);
  });

  it('TB shows no accounts (all netted to zero)', () => {
    const accts = buildTBFromJournals([j],'2026-01-01','2026-12-31',catMap,acctMap);
    const real = accts.filter(a=>!a.synthetic);
    expect(real.length).toBe(0);
  });

  it('P&L shows no income or expense lines', () => {
    const pl = buildPLFromJournals([j],'2026-01-01','2026-12-31',catMap,acctMap);
    expect(pl.incomeLines.length).toBe(0);
    expect(pl.expenseLines.length).toBe(0);
  });
});

// ── Scenario 2: Sub-accounts roll up to parent in TB ─────────────────────────
describe('Scenario: sub-account roll-up in TB', () => {
  const fuel = { debit:120, credit:0, category_id:'s1', bank_account_id:null, is_reversal:false };
  const rego = { debit:350, credit:0, category_id:'s2', bank_account_id:null, is_reversal:false };
  const bank = { debit:0, credit:470, category_id:null, bank_account_id:'b1', is_reversal:false };
  const j = makeJ('j1','2026-03-01',[fuel,rego,bank]);

  it('sub-accounts appear with own dr values', () => {
    const accts = buildTBFromJournals([j],'2026-01-01','2026-12-31',catMap,acctMap);
    expect(accts.find(a=>a.cat_id==='s1')?.dr).toBeCloseTo(120);
    expect(accts.find(a=>a.cat_id==='s2')?.dr).toBeCloseTo(350);
  });

  it('sub-accounts together sum to 470', () => {
    const accts = buildTBFromJournals([j],'2026-01-01','2026-12-31',catMap,acctMap);
    const subTotal = accts.filter(a=>a.parent_id==='p1').reduce((s,a)=>s+a.dr,0);
    expect(subTotal).toBeCloseTo(470);
  });

  it('balance is maintained with subs', () => {
    const accts = buildTBFromJournals([j],'2026-01-01','2026-12-31',catMap,acctMap);
    expect(isTBBalanced(accts.filter(a=>!a.synthetic))).toBe(true);
  });

  it('drill path: sub-accounts have parent_id linking to parent', () => {
    const accts = buildTBFromJournals([j],'2026-01-01','2026-12-31',catMap,acctMap);
    const subs = accts.filter(r=>r.parent_id==='p1');
    expect(subs.map(s=>s.cat_id)).toContain('s1');
    expect(subs.map(s=>s.cat_id)).toContain('s2');
  });
});

// ── Scenario 3: P&L parent synthesis when parent has no own lines ─────────────
describe('Scenario: P&L parent synthesis', () => {
  const fuel = { debit:120, credit:0, category_id:'s1', bank_account_id:null, is_reversal:false };
  const bank = { debit:0, credit:120, category_id:null, bank_account_id:'b1', is_reversal:false };
  const j = makeJ('j1','2026-03-01',[fuel,bank]);

  it('sub-account appears in expenseLines', () => {
    const pl = buildPLFromJournals([j],'2026-01-01','2026-12-31',catMap,acctMap);
    expect(pl.expenseLines.find(x=>x.id==='s1')).toBeDefined();
  });

  it('total expense includes sub-account value', () => {
    const pl = buildPLFromJournals([j],'2026-01-01','2026-12-31',catMap,acctMap);
    expect(pl.totalExpense).toBeCloseTo(120);
  });
});

// ── Scenario 4: Multiple transactions same category ───────────────────────────
describe('Scenario: multiple transactions to same category', () => {
  const txns = [
    { id:'t1', desc:'WOOLWORTHS', amt:-45, cat:null, payee:'', date:'2026-01-05' },
    { id:'t2', desc:'WOOLWORTHS METRO', amt:-32, cat:null, payee:'', date:'2026-01-10' },
  ];
  const rules = [{ keyword:'woolworths', catId:'e1', payee:'Woolworths', direction:'', amtExact:'', amtMin:'', amtMax:'' }];

  it('both transactions get suggestions', () => {
    const sug = runAutoCatRules(txns, rules);
    expect(sug.length).toBe(2);
  });

  it('both get same category', () => {
    const sug = runAutoCatRules(txns, rules);
    expect(sug.every(s=>s.sugCat==='e1')).toBe(true);
  });

  it('both get payee suggestion', () => {
    const sug = runAutoCatRules(txns, rules);
    expect(sug.every(s=>s.sugPayee==='Woolworths')).toBe(true);
  });
});

// ── Scenario 5: BS cumulative (not filtered by date range) ────────────────────
describe('Scenario: BS is cumulative to dateTo', () => {
  const old = { debit:500, credit:0, category_id:null, bank_account_id:'b1', is_reversal:false };
  const inc = { debit:0, credit:500, category_id:'i1', bank_account_id:null, is_reversal:false };
  const jOld = makeJ('j1','2020-06-15',[old,inc]); // old journal
  const new_ = { debit:200, credit:0, category_id:null, bank_account_id:'b1', is_reversal:false };
  const inc2  = { debit:0, credit:200, category_id:'i1', bank_account_id:null, is_reversal:false };
  const jNew = makeJ('j2','2026-03-01',[new_,inc2]); // recent journal

  it('BS includes both old and new journals up to dateTo', () => {
    const bs = buildBSFromJournals([jOld, jNew],'2000-01-01','2026-12-31',catMap,acctMap);
    const bankLine = bs.assetLines.find(l=>l.id==='b1');
    expect(bankLine?.net).toBeCloseTo(700);
  });

  it('BS excludes journals after dateTo', () => {
    const bs = buildBSFromJournals([jOld, jNew],'2000-01-01','2021-12-31',catMap,acctMap);
    const bankLine = bs.assetLines.find(l=>l.id==='b1');
    expect(bankLine?.net).toBeCloseTo(500);
  });
});

// ── Scenario 6: buildJournalLines full round-trip ────────────────────────────
describe('Scenario: journal lines round-trip through TB', () => {
  it('posting an expense then checking TB shows correct balance', () => {
    const txn = { id:'t1', amt:-200, desc:'Fuel' };
    const lines = buildJournalLines(txn, catS1, bank);
    const j = makeJ('j1','2026-04-01', lines);
    const accts = buildTBFromJournals([j],'2026-01-01','2026-12-31',catMap,acctMap);
    const expAcc = accts.find(a=>a.cat_id==='s1');
    expect(expAcc?.dr).toBeCloseTo(200);
    expect(isTBBalanced(accts.filter(a=>!a.synthetic))).toBe(true);
  });
});

// ── Scenario 7: fmtAcct in accounting context ────────────────────────────────
describe('Scenario: fmtAcct for equity/retained earnings', () => {
  it('negative retained earnings shows ($xxx)', () => {
    expect(fmtAcct(-11966.71)).toBe('($11,966.71)');
  });

  it('positive balance shows $xxx', () => {
    expect(fmtAcct(1913.85)).toBe('$1,913.85');
  });

  it('total liabilities and equity shows correct sign', () => {
    // If equity is negative, total L+E should still show correctly
    const total = -1000;
    expect(fmtAcct(total)).toBe('($1,000.00)');
  });
});
