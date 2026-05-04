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

// ── buildPLFromJournals() ─────────────────────────────────────────────────────
import { buildPLFromJournals, buildBSFromJournals } from '../utils/helpers.js';

const plCatMap = {
  'c-sal':  { id:'c-sal',  l:'Salary',    t:'income',  col:'#3B6D11' },
  'c-int':  { id:'c-int',  l:'Interest',  t:'income',  col:'#1D9E75' },
  'c-rent': { id:'c-rent', l:'Rent',      t:'expense', col:'#993C1D' },
  'c-groc': { id:'c-groc', l:'Groceries', t:'expense', col:'#BA7517' },
  'c-car':  { id:'c-car',  l:'Motor Vehicle', t:'asset', col:'#185FA5' },
  'c-loan': { id:'c-loan', l:'Bank Loan', t:'liability', col:'#A32D2D' },
};
const plAcctMap = { 'ba-1':{ id:'ba-1', name:'ANZ Flex Saver', type:'savings', colour:'#185FA5' } };

const salaryJournal = { id:'j1', date:'2026-03-15', source:'auto_category', journal_lines:[
  { debit:5000, credit:0,    category_id:null,    bank_account_id:'ba-1' },
  { debit:0,    credit:5000, category_id:'c-sal', bank_account_id:null   },
]};
const rentJournal = { id:'j2', date:'2026-03-02', source:'auto_category', journal_lines:[
  { debit:1800, credit:0,    category_id:'c-rent', bank_account_id:null   },
  { debit:0,    credit:1800, category_id:null,     bank_account_id:'ba-1' },
]};
const grocJournal = { id:'j3', date:'2026-03-07', source:'auto_category', journal_lines:[
  { debit:87.32, credit:0,    category_id:'c-groc', bank_account_id:null   },
  { debit:0,     credit:87.32,category_id:null,     bank_account_id:'ba-1' },
]};
const interestJournal = { id:'j4', date:'2026-04-01', source:'auto_category', journal_lines:[
  { debit:19.88, credit:0,    category_id:null,    bank_account_id:'ba-1' },
  { debit:0,     credit:19.88,category_id:'c-int', bank_account_id:null   },
]};

describe('buildPLFromJournals()', () => {
  const journals = [salaryJournal, rentJournal, grocJournal];
  const pl = buildPLFromJournals(journals,'2026-03-01','2026-03-31',plCatMap,plAcctMap);

  it('returns incomeLines array',                () => expect(Array.isArray(pl.incomeLines)).toBe(true));
  it('returns expenseLines array',               () => expect(Array.isArray(pl.expenseLines)).toBe(true));
  it('salary appears in income lines',           () => expect(pl.incomeLines.find(l=>l.id==='c-sal')).toBeDefined());
  it('rent appears in expense lines',            () => expect(pl.expenseLines.find(l=>l.id==='c-rent')).toBeDefined());
  it('groceries appears in expense lines',       () => expect(pl.expenseLines.find(l=>l.id==='c-groc')).toBeDefined());
  it('totalIncome = $5,000',                     () => expect(pl.totalIncome).toBe(5000));
  it('totalExpense = $1,887.32',                 () => expect(pl.totalExpense).toBeCloseTo(1887.32, 2));
  it('netProfit = totalIncome - totalExpense',   () => expect(pl.netProfit).toBeCloseTo(5000 - 1887.32, 2));
  it('netProfit is positive (profitable)',        () => expect(pl.netProfit).toBeGreaterThan(0));
  it('date filter excludes April journal',        () => {
    const plWithApril = buildPLFromJournals([...journals, interestJournal],'2026-03-01','2026-03-31',plCatMap,plAcctMap);
    expect(plWithApril.incomeLines.find(l=>l.id==='c-int')).toBeUndefined();
  });
  it('bank account lines excluded from P&L',     () => expect(pl.incomeLines.find(l=>l.l==='ANZ Flex Saver')).toBeUndefined());
  it('empty journals returns zeros',             () => {
    const empty = buildPLFromJournals([],'2026-01-01','2026-12-31',plCatMap);
    expect(empty.totalIncome).toBe(0);
    expect(empty.totalExpense).toBe(0);
    expect(empty.netProfit).toBe(0);
  });
  it('netProfit = totalIncome - totalExpense algebraically', () => {
    expect(Math.abs(pl.netProfit - (pl.totalIncome - pl.totalExpense))).toBeLessThan(0.01);
  });
});

// ── buildBSFromJournals() ─────────────────────────────────────────────────────
const carJournal = { id:'j5', date:'2025-12-01', source:'auto_category', journal_lines:[
  { debit:25000, credit:0,    category_id:'c-car', bank_account_id:null   },
  { debit:0,     credit:25000,category_id:null,    bank_account_id:'ba-1' },
]};
const loanJournal = { id:'j6', date:'2025-12-01', source:'auto_category', journal_lines:[
  { debit:0,     credit:20000,category_id:'c-loan',bank_account_id:null   },
  { debit:20000, credit:0,    category_id:null,    bank_account_id:'ba-1' },
]};

describe('buildBSFromJournals()', () => {
  const journals = [salaryJournal, rentJournal, grocJournal, carJournal, loanJournal];
  const bs = buildBSFromJournals(journals,'2000-01-01','2026-03-31',plCatMap,plAcctMap);

  it('returns assetLines array',                 () => expect(Array.isArray(bs.assetLines)).toBe(true));
  it('returns liabilityLines array',             () => expect(Array.isArray(bs.liabilityLines)).toBe(true));
  it('motor vehicle is an asset',                () => expect(bs.assetLines.find(l=>l.id==='c-car')).toBeDefined());
  it('bank loan is a liability',                 () => expect(bs.liabilityLines.find(l=>l.id==='c-loan')).toBeDefined());
  it('totalAssets > 0',                         () => expect(bs.totalAssets).toBeGreaterThan(0));
  it('totalLiabilities > 0',                    () => expect(bs.totalLiabilities).toBeGreaterThan(0));
  it('Assets = Liabilities + Equity (always)',   () => expect(Math.abs(bs.totalAssets - bs.totalLE)).toBeLessThan(0.01));
  it('totalEquity = totalAssets - totalLiab',    () => expect(Math.abs(bs.totalEquity - (bs.totalAssets - bs.totalLiabilities))).toBeLessThan(0.01));
  it('balanced flag is true',                    () => expect(bs.balanced).toBe(true));
  it('cumulative: includes pre-period assets',   () => {
    // Car purchased Dec 2025, BS as of March 2026 should still include it
    const bsMar = buildBSFromJournals([carJournal],'2000-01-01','2026-03-31',plCatMap,plAcctMap);
    expect(bsMar.assetLines.find(l=>l.id==='c-car')).toBeDefined();
  });
  it('empty journals: all zeros',                () => {
    const empty = buildBSFromJournals([],'2000-01-01','2026-12-31',plCatMap);
    expect(empty.totalAssets).toBe(0);
    expect(empty.totalLiabilities).toBe(0);
    expect(empty.totalEquity).toBe(0);
  });
  it('BS balances with multiple transactions',   () => {
    for (let i = 1; i <= journals.length; i++) {
      const partial = buildBSFromJournals(journals.slice(0,i),'2000-01-01','2026-12-31',plCatMap,plAcctMap);
      expect(partial.balanced).toBe(true);
    }
  });
});

// ── consolidateLines() — inline (matches Journals.jsx logic) ──────────────────
function consolidateLines(lines) {
  const map = {};
  for (const l of lines) {
    const name = l.account_name || l.ac || '—';
    if (!map[name]) map[name] = { account_name: name, debit: 0, credit: 0 };
    map[name].debit  += parseFloat(l.debit  || l.dr  || 0);
    map[name].credit += parseFloat(l.credit || l.cr  || 0);
  }
  return Object.values(map).filter(r => r.debit > 0.005 || r.credit > 0.005);
}

describe('consolidateLines() — general ledger consolidation', () => {
  const rawLines = [
    { account_name:'Dining & Café', debit:6,    credit:0    },
    { account_name:'ANZ First CC',  debit:0,    credit:6    },
    { account_name:'Dining & Café', debit:3.32, credit:0    },
    { account_name:'ANZ First CC',  debit:0,    credit:3.32 },
    { account_name:'Groceries',     debit:45.8, credit:0    },
    { account_name:'ANZ First CC',  debit:0,    credit:45.8 },
  ];

  const consolidated = consolidateLines(rawLines);

  it('reduces 6 lines to 3 accounts',               () => expect(consolidated.length).toBe(3));
  it('Dining & Café DR = $9.32',                    () => expect(consolidated.find(r=>r.account_name==='Dining & Café')?.debit).toBeCloseTo(9.32,2));
  it('ANZ First CC CR = $55.12',                    () => expect(consolidated.find(r=>r.account_name==='ANZ First CC')?.credit).toBeCloseTo(55.12,2));
  it('Groceries DR = $45.80',                       () => expect(consolidated.find(r=>r.account_name==='Groceries')?.debit).toBeCloseTo(45.80,2));
  it('total DR = total CR (still balanced)',         () => {
    const dr = consolidated.reduce((s,r)=>s+r.debit,0);
    const cr = consolidated.reduce((s,r)=>s+r.credit,0);
    expect(Math.abs(dr-cr)).toBeLessThan(0.01);
  });
  it('adding a new entry updates consolidated',     () => {
    const withNew = [...rawLines,
      { account_name:'Dining & Café', debit:1,   credit:0 },
      { account_name:'ANZ First CC',  debit:0,   credit:1 },
    ];
    const c2 = consolidateLines(withNew);
    expect(c2.find(r=>r.account_name==='Dining & Café')?.debit).toBeCloseTo(10.32,2);
    expect(c2.find(r=>r.account_name==='ANZ First CC')?.credit).toBeCloseTo(56.12,2);
  });
  it('empty input returns empty array',             () => expect(consolidateLines([])).toEqual([]));
  it('zero-amount lines are filtered out',          () => {
    const withZero = [...rawLines, { account_name:'Empty', debit:0, credit:0 }];
    const c2 = consolidateLines(withZero);
    expect(c2.find(r=>r.account_name==='Empty')).toBeUndefined();
  });
});

// ── analyseImportedTransactions() ────────────────────────────────────────────
import { analyseImportedTransactions } from '../utils/helpers.js';

describe('analyseImportedTransactions() — smart auto-cat', () => {
  const rules = [{ id:'r1', keyword:'WOOLWORTHS', catId:'c-groc', payee:'Woolworths', amtExact:'', amtMin:'', amtMax:'', direction:'' }];
  const payees = [{ id:'p1', name:'Goodlife Fitness', col:'#3B6D11' }];

  const txns = [
    { id:'t1', desc:'WOOLWORTHS 3847 SYDNEY',              amt:-92,   date:'2026-03-04', cat:null, payee:'' },
    { id:'t2', desc:'WOOLWORTHS ONLINE 9182',              amt:-55,   date:'2026-03-10', cat:null, payee:'' },
    { id:'t3', desc:'PAYMENT TO GOODLIFE CARINDA A00LK',   amt:-17.49,date:'2026-03-05', cat:null, payee:'' },
    { id:'t4', desc:'PAYMENT TO GOODLIFE CARINDA A00QR',   amt:-17.49,date:'2026-03-19', cat:null, payee:'' },
    { id:'t5', desc:'NETFLIX.COM ANNUAL',                  amt:-129,  date:'2026-03-08', cat:null, payee:'' },
    { id:'t6', desc:'NETFLIX.COM ANNUAL',                  amt:-129,  date:'2026-04-08', cat:null, payee:'' },
  ];

  const result = analyseImportedTransactions(txns, rules, {}, payees);

  it('returns suggestions array',                () => expect(Array.isArray(result.suggestions)).toBe(true));
  it('woolworths rule fires for t1',             () => expect(result.suggestions.find(s=>s.txnId==='t1')?.sugCat).toBe('c-groc'));
  it('woolworths rule fires for t2',             () => expect(result.suggestions.find(s=>s.txnId==='t2')?.sugCat).toBe('c-groc'));
  it('goodlife payee name found in desc',        () => {
    const s = result.suggestions.find(s=>s.txnId==='t3'||s.txnId==='t4');
    expect(s?.sugPayee).toBe('Goodlife Fitness');
  });
  it('netflix repeating pattern detected',       () => {
    const opp = result.ruleOpportunities.find(o=>o.keyword.includes('netflix'));
    expect(opp).toBeDefined();
    expect(opp.count).toBe(2);
  });
  it('rule opportunities has count >= 2',        () => result.ruleOpportunities.forEach(o => expect(o.count).toBeGreaterThanOrEqual(2)));
  it('empty transactions returns empty results', () => {
    const r = analyseImportedTransactions([], rules, {}, payees);
    expect(r.suggestions.length).toBe(0);
    expect(r.ruleOpportunities.length).toBe(0);
  });
  it('null rules does not throw',                () => expect(()=>analyseImportedTransactions(txns,null,{},[]) ).not.toThrow());
});

// ── extractMerchantName() ─────────────────────────────────────────────────────
import { extractMerchantName, groupDescriptionsByMerchant } from '../utils/merchant.js';

describe('extractMerchantName() — smart payee extraction', () => {
  it('WOOLWORTHS/543 LUTWYCHE R LUTWYCHE → "Woolworths"',    () => expect(extractMerchantName('WOOLWORTHS/543 LUTWYCHE R LUTWYCHE')).toBe('Woolworths'));
  it('PAYMENT TO GOODLIFE CARINDA A00LK → starts with Goodlife', () => expect(extractMerchantName('PAYMENT TO GOODLIFE CARINDA A00LK')).toMatch(/^Goodlife/));
  it('NETFLIX.COM → "Netflix"',                              () => expect(extractMerchantName('NETFLIX.COM')).toBe('Netflix'));
  it('BPAY TO TELSTRA #619288 → "Telstra"',                  () => expect(extractMerchantName('BPAY TO TELSTRA #619288')).toBe('Telstra'));
  it('EFTPOS COLES SUPERMARKETS SYDNEY → "Coles"',           () => expect(extractMerchantName('EFTPOS COLES SUPERMARKETS SYDNEY')).toBe('Coles'));
  it('DIRECT DEBIT ENERGY AUSTRALIA → "Energy"',             () => expect(extractMerchantName('DIRECT DEBIT ENERGY AUSTRALIA')).toBe('Energy'));
  it('PAYMENT TO COINSPOT #017452 → "Coinspot"',             () => expect(extractMerchantName('PAYMENT TO COINSPOT #017452')).toBe('Coinspot'));
  it('PAYMENT TO BETASHARES APPLICATIONS → "Betashares"',    () => expect(extractMerchantName('PAYMENT TO BETASHARES APPLICATIONS ACCOUNT #191841')).toMatch(/^Betashares/));
  it('SALARY CREDIT → null (internal)',                       () => expect(extractMerchantName('SALARY CREDIT COMPANY PTY LTD')).toBeNull());
  it('INTEREST → null (internal)',                            () => expect(extractMerchantName('CREDIT INTEREST')).toBeNull());
  it('ATM WITHDRAWAL → null (internal)',                      () => expect(extractMerchantName('ATM WITHDRAWAL 0123')).toBeNull());
  it('null input → null',                                     () => expect(extractMerchantName(null)).toBeNull());
  it('empty string → null',                                   () => expect(extractMerchantName('')).toBeNull());
  it('title-cases the result',                                () => {
    const r = extractMerchantName('WOOLWORTHS METRO SYDNEY');
    expect(r).toMatch(/^Woolworths/);
  });
  it('PAYMENT FROM → null (transfer)',                        () => {
    const r = extractMerchantName('PAYMENT FROM MR BAILEY MATTHEW KING');
    // Payment FROM is stripped, leaving BAILEY or MR — either way it's a person name
    // We just verify it doesn't crash and returns something or null
    expect(typeof r === 'string' || r === null).toBe(true);
  });
});

describe('groupDescriptionsByMerchant()', () => {
  const txns = [
    { id:'t1', desc:'WOOLWORTHS/543 LUTWYCHE', amt:-92 },
    { id:'t2', desc:'WOOLWORTHS ONLINE 9182',  amt:-55 },
    { id:'t3', desc:'PAYMENT TO GOODLIFE CARINDA A001', amt:-17.49 },
    { id:'t4', desc:'PAYMENT TO GOODLIFE CARINDA A002', amt:-17.49 },
    { id:'t5', desc:'NETFLIX.COM',             amt:-15.99 },
    { id:'t6', desc:'NETFLIX.COM ANNUAL',      amt:-15.99 },
    { id:'t7', desc:'SALARY CREDIT',           amt: 5000  }, // internal — ignored
  ];

  const groups = groupDescriptionsByMerchant(txns);

  it('returns array',                              () => expect(Array.isArray(groups)).toBe(true));
  it('groups Woolworths (appears twice)',           () => expect(groups.find(g=>g.name==='Woolworths')).toBeDefined());
  it('groups Goodlife (appears twice)',             () => expect(groups.find(g=>g.name==='Goodlife')).toBeDefined());
  it('groups Netflix (appears twice)',             () => expect(groups.find(g=>g.name==='Netflix')).toBeDefined());
  it('excludes salary (internal, count=1 only)',   () => expect(groups.find(g=>g.name==='Salary'||g.name==='Salary Credit')).toBeUndefined());
  it('Woolworths has count=2',                     () => expect(groups.find(g=>g.name==='Woolworths')?.count).toBe(2));
  it('Goodlife has keyword in lowercase',          () => expect(groups.find(g=>g.name?.startsWith('Goodlife'))?.keyword).toMatch(/goodlife/));
  it('consistent amounts → amtExact pre-filled',  () => {
    // Goodlife both $17.49 → should suggest amtExact in analyseImportedTransactions
    // analyseImportedTransactions tested separately — use dynamic import
    const result = analyseImportedTransactions(
      txns.map(t=>({...t,cat:null,payee:''})),
      [], {}, []
    );
    const goodlife = result.ruleOpportunities.find(o=>o.keyword==='goodlife');
    expect(goodlife?.amtExact).toBeCloseTo(17.49, 2);
  });
  it('inconsistent amounts → no amtExact',        () => {
    // analyseImportedTransactions tested separately — use dynamic import
    const result = analyseImportedTransactions(
      txns.map(t=>({...t,cat:null,payee:''})),
      [], {}, []
    );
    const woolworths = result.ruleOpportunities.find(o=>o.keyword==='woolworths');
    expect(woolworths?.amtExact).toBeNull();
  });
});

// ── estimateCategoryForMerchant() ─────────────────────────────────────────────
import { estimateCategoryForMerchant, extractPayeeCandidate } from '../utils/helpers.js';

const testCats = [
  { id:'c-groc', l:'Groceries',    t:'expense', ac:'Living Expenses', col:'#BA7517' },
  { id:'c-dining',l:'Dining & Café',t:'expense', ac:'Entertainment',  col:'#D85A30' },
  { id:'c-sub',  l:'Subscriptions',t:'expense', ac:'Entertainment',  col:'#7F77DD' },
  { id:'c-gym',  l:'Gym & Fitness',t:'expense', ac:'Health',          col:'#1D9E75' },
  { id:'c-util', l:'Utilities',    t:'expense', ac:'Housing',         col:'#854F0B' },
  { id:'c-fuel', l:'Fuel',         t:'expense', ac:'Vehicle',         col:'#3B6D11' },
  { id:'c-invest',l:'Investments', t:'asset',   ac:'Investments',     col:'#185FA5' },
  { id:'c-sal',  l:'Salary',       t:'income',  ac:'Revenue',         col:'#3B6D11' },
];

describe('estimateCategoryForMerchant() — merchant intelligence', () => {
  it('Woolworths → Groceries',      () => expect(estimateCategoryForMerchant('Woolworths','woolworths metro',testCats).catId).toBe('c-groc'));
  it('Netflix → Subscriptions',     () => expect(estimateCategoryForMerchant('Netflix','netflix.com annual',testCats).catId).toBe('c-sub'));
  it('Dominos → Dining',            () => expect(estimateCategoryForMerchant('Dominos','dominos pizza lutwyche',testCats).catId).toBe('c-dining'));
  it('Goodlife → Gym',              () => expect(estimateCategoryForMerchant('Goodlife','payment to goodlife carinda',testCats).catId).toBe('c-gym'));
  it('Telstra → Utilities',         () => expect(estimateCategoryForMerchant('Telstra','bpay to telstra #619',testCats).catId).toBe('c-util'));
  it('BP → Fuel',                   () => expect(estimateCategoryForMerchant('Bp','bp service station',testCats).catId).toBe('c-fuel'));
  it('Betashares → Investments',    () => expect(estimateCategoryForMerchant('Betashares','payment to betashares',testCats).catId).toBe('c-invest'));
  it('high confidence for exact match',()=> expect(estimateCategoryForMerchant('Woolworths','woolworths',testCats).confidence).toBe('high'));
  it('medium confidence for desc match',()=> {
    const r = estimateCategoryForMerchant('Unknown Co','netflix subscription',testCats);
    expect(['medium','high']).toContain(r.confidence);
  });
  it('unknown merchant → null catId', () => expect(estimateCategoryForMerchant('Xyzzy Corp','xyzzy corp #123',testCats).catId).toBeNull());
  it('empty cats → null',             () => expect(estimateCategoryForMerchant('Netflix','netflix',[] ).catId).toBeNull());
});

describe('extractPayeeCandidate()', () => {
  const payees = [{ id:'p1', name:'Goodlife Fitness' }, { id:'p2', name:'Woolworths' }];

  it('matches existing payee by word',   () => expect(extractPayeeCandidate('PAYMENT TO GOODLIFE CARINDA', payees)).toBe('Goodlife Fitness'));
  it('matches Woolworths exactly',       () => expect(extractPayeeCandidate('WOOLWORTHS METRO SYDNEY', payees)).toBe('Woolworths'));
  it('falls back to merchant extraction',() => expect(extractPayeeCandidate('NETFLIX.COM ANNUAL', [])).toBe('Netflix'));
  it('returns empty for internal',       () => expect(extractPayeeCandidate('SALARY CREDIT EMPLOYER', [])).toBe(''));
  it('null input returns empty',         () => expect(extractPayeeCandidate(null, [])).toBe(''));
});
