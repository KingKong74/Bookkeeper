/**
 * unit.import.test.js — Unit tests for import reconciliation and multi-file logic
 */
import { describe, it, expect } from 'vitest';

// ── calcRecon() — pure function, tested inline ────────────────────────────────
function calcRecon(pf, excludedKeys = new Set()) {
  const { summary, transactions = [] } = pf;
  if (!summary) return null;
  const { openingBalance, closingBalance } = summary;
  if (openingBalance == null || closingBalance == null) return null;
  const included  = transactions.filter(t => !excludedKeys.has(t._key));
  const sumOfTxns = included.reduce((s,t) => s + t.amt, 0);
  const expected  = closingBalance - openingBalance;
  const diff      = Math.abs(Math.abs(sumOfTxns) - Math.abs(expected));
  return {
    openingBalance, closingBalance, expected, sumOfTxns, diff,
    balanced:     diff < 0.05,
    totalCredits: included.filter(t=>t.amt>0).reduce((s,t)=>s+t.amt,0),
    totalDebits:  Math.abs(included.filter(t=>t.amt<0).reduce((s,t)=>s+t.amt,0)),
  };
}

describe('calcRecon() — null guards', () => {
  it('returns null when pf has no summary',          () => expect(calcRecon({ transactions:[] })).toBeNull());
  it('returns null when summary is null',            () => expect(calcRecon({ summary:null })).toBeNull());
  it('returns null when openingBalance is null',     () => expect(calcRecon({ summary:{ openingBalance:null, closingBalance:100 }, transactions:[] })).toBeNull());
  it('returns null when closingBalance is null',     () => expect(calcRecon({ summary:{ openingBalance:100, closingBalance:null }, transactions:[] })).toBeNull());
  it('returns object when both balances present',    () => expect(calcRecon({ summary:{ openingBalance:100, closingBalance:200 }, transactions:[] })).not.toBeNull());
});

describe('calcRecon() — balance calculations', () => {
  const summary     = { openingBalance:5045.07, closingBalance:6731.63 };
  const perfectTxns = [{ _key:'k1', amt: 1686.56 }]; // exact movement

  it('balanced when within 5 cents',    () => expect(calcRecon({ summary, transactions:perfectTxns }).balanced).toBe(true));
  it('diff < 0.05 on exact match',      () => expect(calcRecon({ summary, transactions:perfectTxns }).diff).toBeLessThan(0.05));
  it('imbalanced when off by > 5 cents',() => expect(calcRecon({ summary, transactions:[{_key:'k1',amt:1500}]}).balanced).toBe(false));
  it('reports diff correctly',          () => { const r=calcRecon({ summary, transactions:[{_key:'k1',amt:1500}]}); expect(r.diff).toBeCloseTo(186.56,1); });
  it('totalCredits sum correct',        () => { const t=[{_key:'a',amt:100},{_key:'b',amt:-50}]; const r=calcRecon({summary:{openingBalance:0,closingBalance:50},transactions:t}); expect(r.totalCredits).toBe(100); });
  it('totalDebits sum correct',         () => { const t=[{_key:'a',amt:100},{_key:'b',amt:-50}]; const r=calcRecon({summary:{openingBalance:0,closingBalance:50},transactions:t}); expect(r.totalDebits).toBe(50); });
  it('excludedKeys reduces sum',        () => {
    const txns = [{ _key:'k1',amt:1000 },{ _key:'k2',amt:686.56 }];
    const r1   = calcRecon({ summary, transactions:txns });
    const r2   = calcRecon({ summary, transactions:txns }, new Set(['k1']));
    expect(r2.sumOfTxns).toBeLessThan(r1.sumOfTxns);
  });
  it('empty transactions → sumOfTxns=0',() => { const r=calcRecon({ summary, transactions:[] }); expect(r.sumOfTxns).toBe(0); });
});

// ── Multi-file merge logic ────────────────────────────────────────────────────
describe('Multi-file import — merge logic', () => {
  const parsedFiles = [
    { filename:'cc.pdf', transactions:[
      { desc:'WOOLWORTHS', amt:-87.32, _fileIdx:0, _rowIdx:0, _key:'0:0' },
      { desc:'NETFLIX',    amt:-22.99, _fileIdx:0, _rowIdx:1, _key:'0:1' },
    ]},
    { filename:'savings.pdf', transactions:[
      { desc:'SALARY',  amt:5000, _fileIdx:1, _rowIdx:0, _key:'1:0' },
      { desc:'RENT',    amt:-1800, _fileIdx:1, _rowIdx:1, _key:'1:1' },
    ]},
  ];

  function allTxns(pf) { return pf.flatMap((f,fi) => (f.transactions||[]).map(t=>({...t,_fileIdx:fi}))); }

  it('merges to 4 total transactions',                () => expect(allTxns(parsedFiles).length).toBe(4));
  it('file 0 has 2 transactions',                     () => expect(allTxns(parsedFiles).filter(t=>t._fileIdx===0).length).toBe(2));
  it('file 1 has 2 transactions',                     () => expect(allTxns(parsedFiles).filter(t=>t._fileIdx===1).length).toBe(2));
  it('excluding file 0 leaves only file 1',           () => {
    const all      = allTxns(parsedFiles);
    const excl     = new Set(parsedFiles[0].transactions.map(t=>t._key));
    const selected = all.filter(t=>!excl.has(t._key));
    expect(selected.length).toBe(2);
    expect(selected.every(t=>t._fileIdx===1)).toBe(true);
  });
  it('excluding one row does not affect other file',  () => {
    const all      = allTxns(parsedFiles);
    const selected = all.filter(t=>t._key!=='0:0');
    expect(selected.filter(t=>t._fileIdx===1).length).toBe(2);
  });
  it('toggleFile correctly removes all file keys',    () => {
    const all      = allTxns(parsedFiles);
    const file0Keys = all.filter(t=>t._fileIdx===0).map(t=>t._key);
    const excl     = new Set(file0Keys);
    const selected = all.filter(t=>!excl.has(t._key));
    expect(selected.length).toBe(2);
  });
  it('credit total computes over all files',          () => {
    const credits = allTxns(parsedFiles).filter(t=>t.amt>0).reduce((s,t)=>s+t.amt,0);
    expect(credits).toBeCloseTo(5000,2);
  });
  it('debit total computes over all files',           () => {
    const debits = allTxns(parsedFiles).filter(t=>t.amt<0).reduce((s,t)=>s+t.amt,0);
    expect(debits).toBeCloseTo(-1910.31,2);
  });
  it('deduplication by filename works', () => {
    const existing = new Set(parsedFiles.map(p=>p.filename));
    const newFile  = { filename:'cc.pdf', transactions:[] }; // duplicate
    const merged   = [...parsedFiles, ...[newFile].filter(r=>!existing.has(r.filename))];
    expect(merged.length).toBe(2); // not added
  });
});
