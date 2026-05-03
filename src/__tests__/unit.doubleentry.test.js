/**
 * unit.doubleentry.test.js
 * Unit tests for the double-entry posting engine.
 * Tests buildJournalLines() — the pure function that generates DR/CR pairs.
 * All other posting functions require DB access (tested in integration).
 */
import { describe, it, expect } from 'vitest';
import { buildJournalLines } from '../utils/helpers.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const bankAcct   = { id:'ba-1', name:'ANZ Flex Saver' };
const expenseCat = { id:'c-groc', l:'Groceries',    t:'expense' };
const incomeCat  = { id:'c-sal',  l:'Salary',        t:'income'  };
const assetCat   = { id:'c-asset',l:'Motor Vehicle', t:'asset'   };
const liabCat    = { id:'c-liab', l:'Credit Card',   t:'liability'};

const txnOut = { id:'t1', amt:-87.32, date:'2026-03-07', desc:'WOOLWORTHS' }; // money OUT
const txnIn  = { id:'t2', amt:5000,   date:'2026-03-15', desc:'SALARY'     }; // money IN

// ── Money OUT (expenses) ──────────────────────────────────────────────────────
describe('buildJournalLines() — money OUT (expenses)', () => {
  const lines = buildJournalLines(txnOut, expenseCat, bankAcct);

  it('returns exactly 2 lines',                    () => expect(lines.length).toBe(2));
  it('total debits equal total credits',           () => {
    const dr = lines.reduce((s,l)=>s+l.debit,0);
    const cr = lines.reduce((s,l)=>s+l.credit,0);
    expect(Math.abs(dr-cr)).toBeLessThan(0.001);
  });
  it('debit amount = absolute value of transaction', () => expect(lines[0].debit).toBe(87.32));
  it('credit amount = absolute value of transaction',() => expect(lines[1].credit).toBe(87.32));
  it('line 0: DRs the expense category',           () => {
    expect(lines[0].account_name).toBe('Groceries');
    expect(lines[0].debit).toBeGreaterThan(0);
    expect(lines[0].credit).toBe(0);
  });
  it('line 1: CRs the bank account',               () => {
    expect(lines[1].account_name).toBe('ANZ Flex Saver');
    expect(lines[1].credit).toBeGreaterThan(0);
    expect(lines[1].debit).toBe(0);
  });
  it('line 0 has category_id',                     () => expect(lines[0].category_id).toBe('c-groc'));
  it('line 1 has bank_account_id',                 () => expect(lines[1].bank_account_id).toBe('ba-1'));
  it('sort_order is 0, 1',                         () => {
    expect(lines[0].sort_order).toBe(0);
    expect(lines[1].sort_order).toBe(1);
  });
});

// ── Money IN (income) ─────────────────────────────────────────────────────────
describe('buildJournalLines() — money IN (income)', () => {
  const lines = buildJournalLines(txnIn, incomeCat, bankAcct);

  it('returns exactly 2 lines',                    () => expect(lines.length).toBe(2));
  it('total debits equal total credits',           () => {
    const dr = lines.reduce((s,l)=>s+l.debit,0);
    const cr = lines.reduce((s,l)=>s+l.credit,0);
    expect(Math.abs(dr-cr)).toBeLessThan(0.001);
  });
  it('line 0: DRs the bank account (asset up)',    () => {
    expect(lines[0].account_name).toBe('ANZ Flex Saver');
    expect(lines[0].debit).toBe(5000);
    expect(lines[0].credit).toBe(0);
  });
  it('line 1: CRs the income category',            () => {
    expect(lines[1].account_name).toBe('Salary');
    expect(lines[1].credit).toBe(5000);
    expect(lines[1].debit).toBe(0);
  });
  it('line 0 has bank_account_id',                 () => expect(lines[0].bank_account_id).toBe('ba-1'));
  it('line 1 has category_id',                     () => expect(lines[1].category_id).toBe('c-sal'));
});

// ── No bank account (suspense) ────────────────────────────────────────────────
describe('buildJournalLines() — no bank account (suspense)', () => {
  it('uses suspense account name when no bankAccount', () => {
    const lines = buildJournalLines(txnOut, expenseCat, null);
    expect(lines.some(l=>l.account_name==='Suspense / Clearing')).toBe(true);
  });
  it('still balances DR = CR without bank account',    () => {
    const lines = buildJournalLines(txnOut, expenseCat, null);
    const dr = lines.reduce((s,l)=>s+l.debit,0);
    const cr = lines.reduce((s,l)=>s+l.credit,0);
    expect(Math.abs(dr-cr)).toBeLessThan(0.001);
  });
  it('bank_account_id is null when no account',        () => {
    const lines = buildJournalLines(txnOut, expenseCat, null);
    const bankLine = lines.find(l=>l.account_name==='Suspense / Clearing');
    expect(bankLine?.bank_account_id).toBeNull();
  });
});

// ── Asset category (money out to purchase an asset) ───────────────────────────
describe('buildJournalLines() — asset category', () => {
  const txnAsset = { id:'t3', amt:-25000, desc:'CAR PURCHASE', date:'2026-03-01' };
  const lines    = buildJournalLines(txnAsset, assetCat, bankAcct);

  it('DR asset category (asset going up)',   () => expect(lines[0].account_name).toBe('Motor Vehicle'));
  it('CR bank (asset going down)',           () => expect(lines[1].account_name).toBe('ANZ Flex Saver'));
  it('amount is $25,000',                   () => expect(lines[0].debit).toBe(25000));
  it('balances',                            () => {
    expect(lines.reduce((s,l)=>s+l.debit,0)).toBe(lines.reduce((s,l)=>s+l.credit,0));
  });
});

// ── Credit card payment (liability) ───────────────────────────────────────────
describe('buildJournalLines() — liability category', () => {
  const txnLiab = { id:'t4', amt:-500, desc:'CC REPAYMENT', date:'2026-03-01' };
  const lines   = buildJournalLines(txnLiab, liabCat, bankAcct);

  it('DR liability (liability going down)',  () => expect(lines[0].account_name).toBe('Credit Card'));
  it('CR bank account',                     () => expect(lines[1].account_name).toBe('ANZ Flex Saver'));
  it('balances',                            () => {
    expect(lines.reduce((s,l)=>s+l.debit,0)).toBe(lines.reduce((s,l)=>s+l.credit,0));
  });
});

// ── Precision edge cases ──────────────────────────────────────────────────────
describe('buildJournalLines() — precision', () => {
  it('handles 2 decimal places correctly',   () => {
    const lines = buildJournalLines({ amt:-17.49 }, expenseCat, bankAcct);
    expect(lines[0].debit).toBe(17.49);
  });
  it('handles large amounts',                () => {
    const lines = buildJournalLines({ amt:-1234567.89 }, expenseCat, bankAcct);
    expect(lines[0].debit).toBe(1234567.89);
  });
  it('handles zero amount',                  () => {
    const lines = buildJournalLines({ amt:0 }, expenseCat, bankAcct);
    expect(lines[0].debit).toBe(0);
    expect(lines[0].credit).toBe(0);
  });
  it('handles string amount (from DB)',       () => {
    const lines = buildJournalLines({ amt:'-45.80' }, expenseCat, bankAcct);
    expect(lines[0].debit).toBeCloseTo(45.80, 2);
  });
});

// ── Accounting equation holds across multiple postings ────────────────────────
describe('buildJournalLines() — accounting equation across transactions', () => {
  const txns = [
    { amt: -87.32 }, // groceries out
    { amt: -22.99 }, // netflix out
    { amt:  5000  }, // salary in
    { amt: -1800  }, // rent out
    { amt:   43   }, // transfer in
  ];
  
  it('sum of all DRs = sum of all CRs across multiple transactions', () => {
    let totalDR = 0, totalCR = 0;
    txns.forEach(txn => {
      const lines = buildJournalLines(txn, expenseCat, bankAcct);
      totalDR += lines.reduce((s,l)=>s+l.debit,0);
      totalCR += lines.reduce((s,l)=>s+l.credit,0);
    });
    expect(Math.abs(totalDR - totalCR)).toBeLessThan(0.001);
  });
});

// ── buildTBFromJournals() ─────────────────────────────────────────────────────
import { buildTBFromJournals, isTBBalanced } from '../utils/helpers.js';

const catMapForTB = {
  'c-groc': { id:'c-groc', l:'Groceries', t:'expense', col:'#BA7517' },
  'c-sal':  { id:'c-sal',  l:'Salary',    t:'income',  col:'#3B6D11' },
  'c-rent': { id:'c-rent', l:'Rent',      t:'expense', col:'#993C1D' },
};
const acctMapForTB = {
  'ba-1': { id:'ba-1', name:'ANZ Flex Saver', colour:'#185FA5' },
};

// A properly posted journal from postCategoryJournal — expense payment
const expenseJournal = {
  id:'j1', date:'2026-03-07', source:'auto_category',
  journal_lines: [
    { debit:87.32, credit:0,     account_name:'Groceries',    category_id:'c-groc', bank_account_id:null   },
    { debit:0,     credit:87.32, account_name:'ANZ Flex Saver',category_id:null,    bank_account_id:'ba-1' },
  ],
};
// Income journal
const incomeJournal = {
  id:'j2', date:'2026-03-15', source:'auto_category',
  journal_lines: [
    { debit:5000, credit:0,    account_name:'ANZ Flex Saver', category_id:null,    bank_account_id:'ba-1' },
    { debit:0,    credit:5000, account_name:'Salary',         category_id:'c-sal', bank_account_id:null   },
  ],
};

describe('buildTBFromJournals()', () => {
  const journals = [expenseJournal, incomeJournal];
  const rows     = buildTBFromJournals(journals,'2026-03-01','2026-03-31',catMapForTB,acctMapForTB);

  it('returns rows for each unique account',              () => expect(rows.length).toBeGreaterThan(0));
  it('grocery expense has DR entry',                      () => {
    const r = rows.find(r=>r.label==='Groceries');
    expect(r?.dr).toBe(87.32);
  });
  it('bank account has both DR and CR entries',           () => {
    const r = rows.find(r=>r.label==='ANZ Flex Saver');
    expect(r?.dr).toBe(5000);
    expect(r?.cr).toBe(87.32);
  });
  it('salary income has CR entry',                        () => {
    const r = rows.find(r=>r.label==='Salary');
    expect(r?.cr).toBe(5000);
  });
  it('date filter excludes out-of-range journals',        () => {
    const rows2 = buildTBFromJournals(journals,'2026-04-01','2026-04-30',catMapForTB,acctMapForTB);
    expect(rows2.length).toBe(0);
  });
  it('empty journals returns empty array',                () => expect(buildTBFromJournals([],'2026-01-01','2026-12-31',catMapForTB,acctMapForTB)).toEqual([]));
  it('null journals returns empty array',                 () => expect(buildTBFromJournals(null,'2026-01-01','2026-12-31',catMapForTB,acctMapForTB)).toEqual([]));
});

describe('isTBBalanced()', () => {
  it('balanced when DR = CR',           () => {
    const rows = buildTBFromJournals([expenseJournal,incomeJournal],'2026-01-01','2026-12-31',catMapForTB,acctMapForTB);
    expect(isTBBalanced(rows)).toBe(true);
  });
  it('balanced for single journal',     () => {
    const rows = buildTBFromJournals([expenseJournal],'2026-01-01','2026-12-31',catMapForTB,acctMapForTB);
    expect(isTBBalanced(rows)).toBe(true);
  });
  it('false for manually unbalanced',   () => {
    const unbalanced = [{ dr:100, cr:0 }, { dr:50, cr:0 }]; // no CR
    expect(isTBBalanced(unbalanced)).toBe(false);
  });
  it('empty array is trivially balanced',() => expect(isTBBalanced([])).toBe(true));
  it('null is trivially balanced',       () => expect(isTBBalanced(null)).toBe(true));
});

// ── End-to-end: buildJournalLines → buildTBFromJournals balances ──────────────
describe('E2E: journal lines → trial balance always balances', () => {
  const transactions = [
    { amt:-87.32, date:'2026-03-07' },
    { amt:-22.99, date:'2026-03-08' },
    { amt: 5000,  date:'2026-03-15' },
    { amt:-1800,  date:'2026-03-02' },
  ];
  const cats = [expenseCat, incomeCat];

  function makeJournal(txn, cat, bank, id) {
    const lines = buildJournalLines(txn, cat, bank);
    return { id, date: txn.date || '2026-03-01', source:'auto_category', journal_lines: lines.map(l=>({...l,debit:l.debit,credit:l.credit})) };
  }

  it('trial balance balances for 4 posted transactions', () => {
    const journals = [
      makeJournal(transactions[0], expenseCat, bankAcct, 'jA'),
      makeJournal(transactions[1], expenseCat, bankAcct, 'jB'),
      makeJournal(transactions[2], incomeCat,  bankAcct, 'jC'),
      makeJournal(transactions[3], expenseCat, bankAcct, 'jD'),
    ];
    const rows = buildTBFromJournals(journals,'2026-01-01','2026-12-31',catMapForTB,acctMapForTB);
    expect(isTBBalanced(rows)).toBe(true);
  });

  it('adding any transaction preserves balance', () => {
    for (let i = 1; i <= transactions.length; i++) {
      const journals = transactions.slice(0,i).map((t,idx)=>
        makeJournal(t, i%2===0?incomeCat:expenseCat, bankAcct, `j${idx}`)
      );
      const rows = buildTBFromJournals(journals,'2026-01-01','2026-12-31',catMapForTB,acctMapForTB);
      expect(isTBBalanced(rows)).toBe(true);
    }
  });
});
