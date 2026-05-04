/**
 * unit.helpers.test.js  — Unit tests for all utility functions
 * Coverage: helpers.js, csvParser.js, taxEngine.js (pure logic, no DOM/DB)
 */
import { describe, it, expect } from 'vitest';
import {
  fmt, filterByDateRange, buildAccountTotals,
  runAutoCatRules, extractPayeeCandidate, extractRuleKeyword,
} from '../utils/helpers';

// ── fmt() ─────────────────────────────────────────────────────────────────────
describe('fmt()', () => {
  it('formats whole number',        () => expect(fmt(1000)).toBe('$1,000.00'));
  it('formats decimals',            () => expect(fmt(17.49)).toBe('$17.49'));
  it('negative → positive display', () => expect(fmt(-200)).toBe('$200.00'));
  it('zero',                        () => expect(fmt(0)).toBe('$0.00'));
  it('large number with commas',    () => expect(fmt(123456.78)).toBe('$123,456.78'));
  it('rounds to 2 decimal places',  () => expect(fmt(1.005)).toBe('$1.00')); // JS float: 1.005 rounds down
  it('handles string input',        () => expect(fmt('99.9')).toBe('$99.90'));
  it('null → NaN or $0.00',          () => expect(fmt(null ?? 0)).toBe('$0.00'));
  it('undefined → $0.00',          () => expect(fmt(undefined ?? 0)).toBe('$0.00'));
});

// ── filterByDateRange() ───────────────────────────────────────────────────────
describe('filterByDateRange()', () => {
  const txns = [
    { id:'a', date:'2025-06-30' },
    { id:'b', date:'2025-07-01' },
    { id:'c', date:'2026-03-15' },
    { id:'d', date:'2026-06-30' },
    { id:'e', date:'2026-07-01' },
  ];
  it('includes boundary dates',         () => { const r = filterByDateRange(txns,'2025-07-01','2026-06-30'); expect(r.map(t=>t.id)).toEqual(['b','c','d']); });
  it('excludes before start',           () => expect(filterByDateRange(txns,'2025-07-01','2026-06-30').find(t=>t.id==='a')).toBeUndefined());
  it('excludes after end',              () => expect(filterByDateRange(txns,'2025-07-01','2026-06-30').find(t=>t.id==='e')).toBeUndefined());
  it('single day range',               () => { const r = filterByDateRange(txns,'2026-03-15','2026-03-15'); expect(r.length).toBe(1); expect(r[0].id).toBe('c'); });
  it('empty range returns empty',       () => expect(filterByDateRange(txns,'2027-01-01','2027-12-31').length).toBe(0));
  it('all dates range returns all',     () => expect(filterByDateRange(txns,'2000-01-01','2099-12-31').length).toBe(5));
  it('null dates skipped gracefully',   () => { const withNull=[{id:'x',date:null},...txns]; expect(()=>filterByDateRange(withNull,'2026-01-01','2026-12-31')).not.toThrow(); });
  it('empty input returns empty',       () => expect(filterByDateRange([],'2026-01-01','2026-12-31')).toEqual([]));
});

// ── runAutoCatRules() — keyword matching ──────────────────────────────────────
describe('runAutoCatRules() — keyword matching', () => {
  const rules = [{ id:'r1', keyword:'WOOLWORTHS', catId:'cat-groc', payee:'Woolworths', amtExact:'', amtMin:'', amtMax:'', direction:'' }];
  const txns  = [
    { id:'t1', desc:'WOOLWORTHS 0547 SYDNEY', amt:-82.5,  date:'2026-03-01', cat:null, payee:'' },
    { id:'t2', desc:'COLES SUPERMARKET',      amt:-55.0,  date:'2026-03-02', cat:null, payee:'' },
    { id:'t3', desc:'woolworths online',       amt:-40.0,  date:'2026-03-03', cat:null, payee:'' },
  ];
  it('matches keyword in description',    () => expect(runAutoCatRules(txns,rules).find(s=>s.txnId==='t1')).toBeDefined());
  it('non-matching desc returns nothing', () => expect(runAutoCatRules(txns,rules).find(s=>s.txnId==='t2')).toBeUndefined());
  it('case-insensitive match',            () => expect(runAutoCatRules(txns,rules).find(s=>s.txnId==='t3')).toBeDefined());
  it('suggests payee from rule',          () => expect(runAutoCatRules(txns,rules)[0].sugPayee).toBe('Woolworths'));
  it('suggests category from rule',       () => expect(runAutoCatRules(txns,rules)[0].sugCat).toBe('cat-groc'));
  it('empty rules returns empty',         () => expect(runAutoCatRules(txns,[])).toEqual([]));
  it('empty txns returns empty',          () => expect(runAutoCatRules([],rules)).toEqual([]));
});

// ── runAutoCatRules() — amount conditions ─────────────────────────────────────
describe('runAutoCatRules() — amount conditions', () => {
  const base = { keyword:'GOODLIFE', catId:'cat-gym', payee:'', amtMin:'', amtMax:'', direction:'' };
  const txn  = (id, amt) => ({ id, desc:'PAYMENT TO GOODLIFE CARINDA', amt, date:'2026-03-01', cat:null, payee:'' });

  it('amtExact: matches within 0.5¢',     () => expect(runAutoCatRules([txn('t1',-17.49)],[{...base,amtExact:'17.49'}]).length).toBe(1));
  it('amtExact: rejects different amount', () => expect(runAutoCatRules([txn('t1',-36.21)],[{...base,amtExact:'17.49'}]).length).toBe(0));
  it('amtMin: passes when amt >= min',     () => expect(runAutoCatRules([txn('t1',-500)], [{...base,amtMin:'100'}]).length).toBe(1));
  it('amtMin: fails when amt < min',       () => expect(runAutoCatRules([txn('t1',-50)],  [{...base,amtMin:'100'}]).length).toBe(0));
  it('amtMax: passes when amt <= max',     () => expect(runAutoCatRules([txn('t1',-30)],  [{...base,amtMax:'50'}]).length).toBe(1));
  it('amtMax: fails when amt > max',       () => expect(runAutoCatRules([txn('t1',-200)], [{...base,amtMax:'50'}]).length).toBe(0));
  it('amtMin+amtMax: range match',         () => expect(runAutoCatRules([txn('t1',-75)],  [{...base,amtMin:'50',amtMax:'100'}]).length).toBe(1));
  it('amtMin+amtMax: out of range',        () => expect(runAutoCatRules([txn('t1',-200)], [{...base,amtMin:'50',amtMax:'100'}]).length).toBe(0));
  it('direction in: matches credit',       () => expect(runAutoCatRules([txn('t1', 50)],  [{...base,direction:'in'}]).length).toBe(1));
  it('direction in: rejects debit',        () => expect(runAutoCatRules([txn('t1',-50)],  [{...base,direction:'in'}]).length).toBe(0));
  it('direction out: matches debit',       () => expect(runAutoCatRules([txn('t1',-50)],  [{...base,direction:'out'}]).length).toBe(1));
  it('direction out: rejects credit',      () => expect(runAutoCatRules([txn('t1', 50)],  [{...base,direction:'out'}]).length).toBe(0));
  it('amtExact match: rule fires',         () => {
    const rule = {...base, amtExact:'17.49'}; // simple exact match
    expect(runAutoCatRules([txn('t1',-17.49)],[rule]).length).toBe(1);
  });
});

// ── runAutoCatRules() — priority & skip logic ─────────────────────────────────
describe('runAutoCatRules() — priority & skip', () => {
  const r1 = { id:'r1', keyword:'PAYMENT', catId:'cat-a', payee:'', amtExact:'', amtMin:'', amtMax:'', direction:'' };
  const r2 = { id:'r2', keyword:'PAYMENT TO GOODLIFE', catId:'cat-b', payee:'', amtExact:'', amtMin:'', amtMax:'', direction:'' };
  const txn = { id:'t1', desc:'PAYMENT TO GOODLIFE CARINDA', amt:-17.49, date:'2026-03-01', cat:null, payee:'' };

  it('first matching rule wins',     () => expect(runAutoCatRules([txn],[r1,r2])[0].sugCat).toBe('cat-a'));
  it('reorder changes winner',       () => expect(runAutoCatRules([txn],[r2,r1])[0].sugCat).toBe('cat-b'));
  it('already-cat+payee → skip',     () => expect(runAutoCatRules([{...txn,cat:'c1',payee:'X'}],[r1])).toEqual([]));
  it('cat set but no payee → still suggests payee', () => {
    const r = {...r1, payee:'Goodlife'};
    const res = runAutoCatRules([{...txn,cat:'c1',payee:''}],[r]);
    expect(res.length).toBe(1);
    expect(res[0].sugPayee).toBe('Goodlife');
  });
});

// ── buildAccountTotals() ──────────────────────────────────────────────────────
describe('merchant/payee extraction', () => {
  it('cleans noisy Woolworths descriptions', () => {
    expect(extractPayeeCandidate('WOOLWORTHS/543 LUTWYCHE R LUTWYCHE')).toBe('Woolworths');
    expect(extractRuleKeyword('WOOLWORTHS/543 LUTWYCHE R LUTWYCHE')).toBe('woolworths');
  });

  it('uses known payees when their significant word appears', () => {
    expect(extractPayeeCandidate('PAYMENT TO GOODLIFE CARINDA A00LK', [{ name:'Goodlife Fitness' }])).toBe('Goodlife Fitness');
  });
});

describe('buildAccountTotals()', () => {
  const catMap = {
    'c-sal':  { id:'c-sal',  l:'Salary',    t:'income',  ac:'Revenue',        col:'#3B6D11' },
    'c-groc': { id:'c-groc', l:'Groceries', t:'expense', ac:'Living Expenses', col:'#BA7517' },
    'c-rent': { id:'c-rent', l:'Rent',      t:'expense', ac:'Housing',         col:'#993C1D' },
  };
  const txns = [
    { id:'t1', cat:'c-sal',  amt:  5000 },
    { id:'t2', cat:'c-groc', amt:  -200 },
    { id:'t3', cat:'c-groc', amt:  -150 },
    { id:'t4', cat:'c-rent', amt: -1500 },
    { id:'t5', cat:null,     amt:   -50 }, // unallocated
  ];
  it('income → credit entry',          () => { const a=buildAccountTotals(txns,catMap); expect(a.find(x=>x.ac==='Revenue')?.cr).toBe(5000); });
  it('expenses → debit entry',         () => { const a=buildAccountTotals(txns,catMap); expect(a.find(x=>x.ac==='Living Expenses')?.dr).toBe(350); });
  it('separate groups aggregated',      () => { const a=buildAccountTotals(txns,catMap); expect(a.find(x=>x.ac==='Housing')?.dr).toBe(1500); });
  it('unallocated ignored',             () => { const a=buildAccountTotals(txns,catMap); expect(a.some(x=>x.dr===50||x.cr===50)).toBe(false); });
  it('returns array',                   () => expect(Array.isArray(buildAccountTotals(txns,catMap))).toBe(true));
  it('empty txns returns empty',        () => expect(buildAccountTotals([],catMap)).toEqual([]));
  it('income accounts have cr entries, expense have dr', () => {
    const a   = buildAccountTotals(txns, catMap);
    const sal = a.find(x=>x.ac==='Revenue');
    const groc = a.find(x=>x.ac==='Living Expenses');
    expect(sal?.cr).toBeGreaterThan(0);
    expect(groc?.dr).toBeGreaterThan(0);
  });
});
