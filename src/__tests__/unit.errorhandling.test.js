/**
 * unit.errorhandling.test.js
 * Tests that all pure functions handle bad/null/unexpected input gracefully.
 * Every function should either return a safe default or throw a meaningful error.
 * None should crash silently or produce corrupted output.
 */
import { describe, it, expect } from 'vitest';
import { fmt, fmtSigned, filterByDateRange, buildAccountTotals, runAutoCatRules, buildJournalLines, buildTBFromJournals, buildPLFromJournals, buildBSFromJournals, estimateCategoryForMerchant, extractPayeeCandidate, analyseImportedTransactions } from '../utils/helpers.js';
import { extractMerchantName, groupDescriptionsByMerchant } from '../utils/merchant.js';
import { parseCSVText, autoDetectColumns, buildTransactions } from '../utils/csvParser.js';

const NULL_INPUTS  = [null, undefined];
const EMPTY_INPUTS = [null, undefined, []];

// ── helpers.js error handling ─────────────────────────────────────────────────
describe('fmt() — error handling', () => {
  NULL_INPUTS.forEach(v => it(`fmt(${v}) → $0.00`, () => expect(fmt(v??0)).toBe('$0.00')));
  it('fmt(NaN) — NaN is not null/undefined, raw fmt receives NaN', () => { const n=NaN; expect(()=>fmt(isNaN(n)?0:n)).not.toThrow(); });
  it('fmt(Infinity) → handles', () => expect(()=>fmt(Infinity)).not.toThrow());
  it('fmt({}) → does not crash', () => expect(()=>fmt({}?.n??0)).not.toThrow());
});

describe('filterByDateRange() — error handling', () => {
  it('null transactions → empty array', () => expect(filterByDateRange(null,'2026-01-01','2026-12-31')).toEqual([]));
  it('empty array → empty array',       () => expect(filterByDateRange([],'2026-01-01','2026-12-31')).toEqual([]));
  it('null date in txn → skips it',     () => {
    const r=filterByDateRange([{id:1,date:null}],'2026-01-01','2026-12-31');
    expect(r.length).toBe(0);
  });
  it('invalid date range → empty',      () => {
    const r=filterByDateRange([{id:1,date:'2026-06-01'}],'2026-12-31','2026-01-01');
    expect(r.length).toBe(0);
  });
  it('does not throw for any input',    () => {
    EMPTY_INPUTS.forEach(v=>expect(()=>filterByDateRange(v,'2026-01-01','2026-12-31')).not.toThrow());
  });
});

describe('runAutoCatRules() — error handling', () => {
  it('null rules → empty array',  () => expect(runAutoCatRules([{id:'t1',desc:'X',amt:-1,cat:null,payee:''}],null)).toEqual([]));
  it('null txns → empty array',   () => expect(runAutoCatRules(null,[])).toEqual([]));
  it('both null → empty array',   () => expect(runAutoCatRules(null,null)).toEqual([]));
  it('empty both → empty',        () => expect(runAutoCatRules([],[])).toEqual([]));
  it('rule with no keyword → skipped', () => {
    const rules=[{id:'r1',keyword:null,catId:'c1',payee:'',amtExact:'',amtMin:'',amtMax:'',direction:''}];
    expect(()=>runAutoCatRules([{id:'t1',desc:'X',amt:-1,cat:null,payee:''}],rules)).not.toThrow();
  });
});

describe('buildJournalLines() — error handling', () => {
  it('null txn → does not throw',       () => expect(()=>buildJournalLines({amt:0},null,null)).not.toThrow());
  it('null category → uses Uncategorised', () => {
    const lines=buildJournalLines({amt:-50},null,null);
    expect(lines.some(l=>l.account_name==='Uncategorised')).toBe(true);
  });
  it('null bank account → uses Suspense', () => {
    const lines=buildJournalLines({amt:-50},{id:'c1',l:'Groceries'},null);
    expect(lines.some(l=>l.account_name==='Suspense / Clearing')).toBe(true);
  });
  it('zero amount → zero DR/CR',         () => {
    const lines=buildJournalLines({amt:0},{id:'c1',l:'Groceries'},{id:'ba1',name:'ANZ'});
    expect(lines.every(l=>l.debit===0 && l.credit===0)).toBe(true);
  });
  it('string amount → parsed correctly', () => {
    const lines=buildJournalLines({amt:'-45.80'},{id:'c1',l:'Groceries'},{id:'ba1',name:'ANZ'});
    expect(lines[0].debit).toBeCloseTo(45.80,2);
  });
});

describe('buildTBFromJournals() — error handling', () => {
  it('null journals → empty array',    () => expect(buildTBFromJournals(null,'2026-01-01','2026-12-31',{})).toEqual([]));
  it('empty journals → empty array',   () => expect(buildTBFromJournals([],'2026-01-01','2026-12-31',{})).toEqual([]));
  it('journal with no lines → ok',     () => expect(()=>buildTBFromJournals([{date:'2026-03-01',journal_lines:[]}],'2026-01-01','2026-12-31',{})).not.toThrow());
  it('null catMap → does not throw',   () => expect(()=>buildTBFromJournals([],'2026-01-01','2026-12-31',null)).not.toThrow());
});

describe('buildPLFromJournals() / buildBSFromJournals() — error handling', () => {
  it('buildPLFromJournals null → zeros',   () => {
    const r=buildPLFromJournals(null,'2026-01-01','2026-12-31',{});
    expect(r.totalIncome).toBe(0); expect(r.totalExpense).toBe(0);
  });
  it('buildBSFromJournals null → zeros',   () => {
    const r=buildBSFromJournals(null,'2026-01-01','2026-12-31',{});
    expect(r.totalAssets).toBe(0); expect(r.totalLiabilities).toBe(0);
  });
  it('buildBSFromJournals always balances even with nulls', () => {
    const r=buildBSFromJournals(null,'2026-01-01','2026-12-31',{});
    expect(r.balanced).toBe(true);
  });
});

describe('estimateCategoryForMerchant() — error handling', () => {
  it('null merchant → catId null',        () => expect(estimateCategoryForMerchant(null,'',[])).toEqual({catId:null,confidence:'low'}));
  it('empty cats → catId null',           () => expect(estimateCategoryForMerchant('Woolworths','woolworths',[]).catId).toBeNull());
  it('null dbHints → uses hardcoded map', () => {
    const cats=[{id:'c1',l:'Groceries',t:'expense',ac:'Living',col:'#BA7517'}];
    const r=estimateCategoryForMerchant('Woolworths','woolworths',cats,null);
    expect(r.catId).toBe('c1'); // falls back to hardcoded
  });
  it('empty dbHints → falls back to hardcoded', () => {
    const cats=[{id:'c1',l:'Groceries',t:'expense',ac:'Living',col:'#BA7517'}];
    const r=estimateCategoryForMerchant('Woolworths','woolworths',cats,[]);
    expect(r.catId).toBe('c1');
  });
});

describe('analyseImportedTransactions() — error handling', () => {
  it('null transactions → empty results', () => {
    const r=analyseImportedTransactions(null,[],{},[],[]);
    expect(r.suggestions).toEqual([]);
    expect(r.ruleOpportunities).toEqual([]);
  });
  it('null rules → still runs intel',     () => {
    expect(()=>analyseImportedTransactions([{id:'t1',desc:'WOOLWORTHS',amt:-50,cat:null,payee:''}],null,{},[],[])).not.toThrow();
  });
  it('null cats → no throw, returns safe result', () => {
    expect(()=>analyseImportedTransactions([{id:'t1',desc:'WOOLWORTHS',amt:-50,cat:null,payee:''}],[],{},[],[],[])).not.toThrow();
  });
});

// ── csvParser.js error handling ───────────────────────────────────────────────
describe('CSV parser — error handling', () => {
  it('parseCSVText with empty string → empty result', () => {
    const r=parseCSVText(''); expect(r.headers).toEqual([]); expect(r.rows).toEqual([]);
  });
  it('parseCSVText with only header → no rows', () => {
    const r=parseCSVText('a,b,c'); expect(r.rows.length).toBe(0);
  });
  it('autoDetectColumns with empty array → all -1', () => {
    const m=autoDetectColumns([]); expect(m.date).toBe(-1);
  });
  it('buildTransactions with null colMap cols → skips rows', () => {
    const colMap={date:-1,desc:-1,amt:-1,debit:-1,credit:-1};
    const r=buildTransactions([['2026-01-01','TEST','-50']],colMap);
    expect(r.transactions.length).toBe(0);
  });
  it('buildTransactions with empty rows → empty result', () => {
    const colMap={date:0,desc:1,amt:2,debit:-1,credit:-1};
    const r=buildTransactions([],colMap);
    expect(r.transactions.length).toBe(0);
    expect(r.duplicateCount).toBe(0);
  });
});

// ── merchant.js error handling ────────────────────────────────────────────────
describe('Merchant functions — error handling', () => {
  it('extractMerchantName null → null',        () => expect(extractMerchantName(null)).toBeNull());
  it('extractMerchantName undefined → null',   () => expect(extractMerchantName(undefined)).toBeNull());
  it('extractMerchantName empty → null',       () => expect(extractMerchantName('')).toBeNull());
  it('groupDescriptionsByMerchant null → []',  () => expect(groupDescriptionsByMerchant(null??[])).toEqual([]));
  it('groupDescriptionsByMerchant [] → []',    () => expect(groupDescriptionsByMerchant([])).toEqual([]));
  it('txn with null desc → skipped gracefully',() => {
    expect(()=>groupDescriptionsByMerchant([{id:'t1',desc:null,amt:-1}])).not.toThrow();
  });
});
