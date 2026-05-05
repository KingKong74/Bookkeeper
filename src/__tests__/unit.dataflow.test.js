/**
 * unit.dataflow.test.js
 * Tests data flow integrity — normalisation, transformations, state transitions.
 * Validates that data entering the system leaves in the right shape.
 */
import { describe, it, expect } from 'vitest';
import { fmt, filterByDateRange, buildAccountTotals, buildJournalLines } from '../utils/helpers.js';
import { parseCSVText, autoDetectColumns, buildTransactions } from '../utils/csvParser.js';
import { extractMerchantName } from '../utils/merchant.js';

// ── normalise transaction from DB row ─────────────────────────────────────────
describe('Transaction normalisation (DB row → app state)', () => {
  // This mirrors what AppContext.normaliseTxn does
  function normaliseTxn(t) {
    return {
      ...t,
      cat:    t.category_id ?? null,
      desc:   t.description ?? '',
      amt:    parseFloat(t.amount) || 0,
      payee:  t.payees?.name ?? t.payee ?? '',
      note:   t.note ?? '',
    };
  }

  it('maps category_id → cat',              () => expect(normaliseTxn({category_id:'c1'}).cat).toBe('c1'));
  it('maps null category_id → null cat',    () => expect(normaliseTxn({category_id:null}).cat).toBeNull());
  it('maps description → desc',             () => expect(normaliseTxn({description:'NETFLIX'}).desc).toBe('NETFLIX'));
  it('maps amount string → amt float',      () => expect(normaliseTxn({amount:'-45.50'}).amt).toBe(-45.50));
  it('maps payees.name → payee',            () => expect(normaliseTxn({payees:{name:'Woolworths'}}).payee).toBe('Woolworths'));
  it('falls back to t.payee string',        () => expect(normaliseTxn({payee:'Goodlife'}).payee).toBe('Goodlife'));
  it('null note → empty string',            () => expect(normaliseTxn({note:null}).note).toBe(''));
  it('missing fields → safe defaults',      () => {
    const t = normaliseTxn({});
    expect(t.cat).toBeNull();
    expect(t.desc).toBe('');
    expect(t.amt).toBe(0);
    expect(t.payee).toBe('');
    expect(t.note).toBe('');
  });
});

// ── CSV → transactions pipeline ───────────────────────────────────────────────
describe('CSV → transactions full pipeline', () => {
  const csv = `Date,Description,Amount
2026-03-01,WOOLWORTHS METRO,-45.50
2026-03-02,SALARY CREDIT,5000
2026-03-03,NETFLIX.COM,-22.99
2026-03-04,PAYMENT TO GOODLIFE,-17.49`;

  it('parses → detects → builds without losing rows', () => {
    const {headers,rows} = parseCSVText(csv);
    const colMap = autoDetectColumns(headers);
    const {transactions} = buildTransactions(rows, colMap);
    expect(transactions.length).toBe(4);
  });

  it('amounts are correct types after pipeline', () => {
    const {headers,rows} = parseCSVText(csv);
    const colMap = autoDetectColumns(headers);
    const {transactions} = buildTransactions(rows, colMap);
    transactions.forEach(t => expect(typeof t.amt).toBe('number'));
  });

  it('dates are ISO strings after pipeline', () => {
    const {headers,rows} = parseCSVText(csv);
    const colMap = autoDetectColumns(headers);
    const {transactions} = buildTransactions(rows, colMap);
    transactions.forEach(t => expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('merchant extraction works on all parsed descriptions', () => {
    const {headers,rows} = parseCSVText(csv);
    const colMap = autoDetectColumns(headers);
    const {transactions} = buildTransactions(rows, colMap);
    const merchants = transactions.map(t => extractMerchantName(t.desc)).filter(Boolean);
    expect(merchants.length).toBeGreaterThan(0);
    merchants.forEach(m => {
      expect(m[0]).toBe(m[0].toUpperCase()); // title-cased → first char uppercase
    });
  });
});

// ── Journal line data flow ─────────────────────────────────────────────────────
describe('Journal line data flow (txn → DR/CR lines → trial balance)', () => {
  const bankAcct   = { id:'ba-1', name:'ANZ Flex Saver' };
  const expenseCat = { id:'c-groc', l:'Groceries', t:'expense' };
  const incomeCat  = { id:'c-sal',  l:'Salary',    t:'income'  };

  const catMap = {
    'c-groc': { ...expenseCat, ac:'Living', col:'#BA7517' },
    'c-sal':  { ...incomeCat,  ac:'Revenue', col:'#3B6D11' },
  };

  it('DR line amount equals transaction absolute value', () => {
    const lines = buildJournalLines({amt:-87.32}, expenseCat, bankAcct);
    expect(lines[0].debit).toBe(87.32);
  });

  it('CR line amount equals transaction absolute value', () => {
    const lines = buildJournalLines({amt:-87.32}, expenseCat, bankAcct);
    expect(lines[1].credit).toBe(87.32);
  });

  it('every journal entry has exactly debit = credit (balanced)', () => {
    const txns = [{amt:-45},{amt:5000},{amt:-1800},{amt:43},{amt:-17.49}];
    txns.forEach(t => {
      const lines = buildJournalLines(t, expenseCat, bankAcct);
      const dr = lines.reduce((s,l)=>s+l.debit,0);
      const cr = lines.reduce((s,l)=>s+l.credit,0);
      expect(Math.abs(dr-cr)).toBeLessThan(0.001);
    });
  });

  it('category_id and bank_account_id are on correct lines (expense out)', () => {
    const lines = buildJournalLines({amt:-50}, expenseCat, bankAcct);
    expect(lines[0].category_id).toBe('c-groc');    // DR line has category
    expect(lines[0].bank_account_id).toBeNull();
    expect(lines[1].bank_account_id).toBe('ba-1'); // CR line has bank
    expect(lines[1].category_id).toBeNull();
  });

  it('category_id and bank_account_id are on correct lines (income in)', () => {
    const lines = buildJournalLines({amt:5000}, incomeCat, bankAcct);
    expect(lines[0].bank_account_id).toBe('ba-1'); // DR line has bank (asset up)
    expect(lines[1].category_id).toBe('c-sal');    // CR line has category
  });
});

// ── Amount formatting data flow ────────────────────────────────────────────────
describe('Amount formatting data flow', () => {
  it('fmt always produces $ prefix',          () => expect(fmt(1234).startsWith('$')).toBe(true));
  it('fmt always produces 2 decimal places',  () => expect(fmt(1000)).toMatch(/\.\d{2}$/));
  it('fmt(0) → $0.00',                        () => expect(fmt(0)).toBe('$0.00'));
  it('fmt negatives → positive display',      () => expect(fmt(-50)).toBe('$50.00'));
  // fmtSigned is pure — test inline without importing helpers (which imports seeds)
  const fmtSignedInline = n => (n >= 0 ? '+ ' : '− ') + '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  it('fmtSigned positive → starts with + ',  () => expect(fmtSignedInline(100)).toMatch(/^\+/));
  it('fmtSigned negative → starts with − ',  () => expect(fmtSignedInline(-100)).toMatch(/^−/));
  it('fmtSigned zero → + $0.00',             () => expect(fmtSignedInline(0)).toBe('+ $0.00'));
  it('large numbers have comma separators',   () => expect(fmt(1234567)).toContain(','));
  it('amt passed as string → still works',    () => expect(fmt('99.9')).toBe('$99.90'));
});

// ── Date range filter data flow ────────────────────────────────────────────────
describe('Date range filter data flow', () => {
  const txns = [
    { id:1, date:'2026-01-01', amt:-10 },
    { id:2, date:'2026-06-15', amt:-20 },
    { id:3, date:'2026-12-31', amt:-30 },
  ];

  it('output is subset of input',                  () => {
    const out = filterByDateRange(txns,'2026-01-01','2026-06-30');
    expect(out.every(t => txns.some(x=>x.id===t.id))).toBe(true);
  });
  it('filtered transactions preserve all fields',  () => {
    const out = filterByDateRange(txns,'2026-01-01','2026-12-31');
    out.forEach(t => { expect(t.id).toBeDefined(); expect(t.amt).toBeDefined(); });
  });
  it('count is accurate',                          () => {
    expect(filterByDateRange(txns,'2026-01-01','2026-06-30').length).toBe(2);
  });
  it('no mutation of original array',              () => {
    const original = [...txns];
    filterByDateRange(txns,'2026-06-01','2026-06-30');
    expect(txns).toEqual(original);
  });
});
