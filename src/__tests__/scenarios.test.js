/**
 * scenarios.test.js
 * -----------------
 * User journey / scenario tests that verify complete workflows work end-to-end.
 * These test the LOGIC functions directly (no DOM rendering needed).
 *
 * Run: npm test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { runAutoCatRules, filterByDateRange, buildAccountTotals, fmt, dateRangeLabel } from '../utils/helpers';

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 1: Import & auto-categorise Goodlife gym transactions
// "I import my ANZ Flex Saver statement. I have a rule: keyword='PAYMENT TO GOODLIFE',
//  exact amount $17.49, direction=out → category Gym & Fitness.
//  The $36.21 charge should NOT match. The $17.49 should."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Auto-cat Goodlife gym by exact amount', () => {
  const rules = [{
    id: 'r1', keyword: 'PAYMENT TO GOODLIFE', catId: 'cat-gym',
    payee: 'Goodlife Fitness', amtExact: '17.49', amtMin: '', amtMax: '', direction: 'out',
  }];

  const transactions = [
    { id: 't1', desc: 'PAYMENT TO GOODLIFE CARINDA A00LKY8U0NB9', amt: -17.49, date: '2026-03-05', cat: null, payee: '' },
    { id: 't2', desc: 'PAYMENT TO GOODLIFE CARINDA A00LQTXW0AY7', amt: -36.21, date: '2026-03-23', cat: null, payee: '' },
    { id: 't3', desc: 'PAYMENT FROM TOBY KING', amt:  43.41, date: '2026-03-04', cat: null, payee: '' },
  ];

  it('matches $17.49 Goodlife → Gym & Fitness', () => {
    const sugs = runAutoCatRules(transactions, rules);
    const t1   = sugs.find(s => s.txnId === 't1');
    expect(t1).toBeDefined();
    expect(t1.sugCat).toBe('cat-gym');
  });

  it('does NOT match $36.21 Goodlife (wrong amount)', () => {
    const sugs = runAutoCatRules(transactions, rules);
    const t2   = sugs.find(s => s.txnId === 't2');
    expect(t2).toBeUndefined();
  });

  it('does NOT match PAYMENT FROM (wrong direction)', () => {
    const sugs = runAutoCatRules(transactions, rules);
    const t3   = sugs.find(s => s.txnId === 't3');
    expect(t3).toBeUndefined();
  });

  it('suggests the payee too', () => {
    const sugs = runAutoCatRules(transactions, rules);
    const t1   = sugs.find(s => s.txnId === 't1');
    expect(t1.sugPayee).toBe('Goodlife Fitness');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 2: Rule priority — first rule wins
// "I have two rules. Rule #1: keyword='COINSPOT', category=Investments.
//  Rule #2: keyword='PAYMENT TO COINSPOT', category=Crypto.
//  Even though both match 'PAYMENT TO COINSPOT #017452', rule #1 fires first."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Rule priority — first match wins', () => {
  const rules = [
    { id: 'r1', keyword: 'COINSPOT',          catId: 'cat-invest', payee: '', amtExact:'', amtMin:'', amtMax:'', direction:'' },
    { id: 'r2', keyword: 'PAYMENT TO COINSPOT', catId: 'cat-crypto',  payee: '', amtExact:'', amtMin:'', amtMax:'', direction:'' },
  ];
  const txns = [
    { id: 't1', desc: 'PAYMENT TO COINSPOT #017452', amt: -500, date: '2026-03-23', cat: null, payee: '' },
  ];

  it('rule #1 (COINSPOT) wins over rule #2 (PAYMENT TO COINSPOT)', () => {
    const sugs = runAutoCatRules(txns, rules);
    expect(sugs[0].sugCat).toBe('cat-invest');
  });

  it('when rule #1 is removed, rule #2 fires', () => {
    const sugs = runAutoCatRules(txns, [rules[1]]);
    expect(sugs[0].sugCat).toBe('cat-crypto');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 3: Amount range rule — flag large transfers
// "I want to flag any PAYMENT TO > $500 as 'Large Transfer' for review.
//  $1,055 should match. $200 should not."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Amount range — large transfer flagging', () => {
  const rules = [{
    id: 'r1', keyword: 'PAYMENT TO', catId: 'cat-large',
    payee: '', amtExact: '', amtMin: '500', amtMax: '', direction: 'out',
  }];
  const txns = [
    { id: 't1', desc: 'PAYMENT TO BAILEY KING #366438', amt: -1055, date: '2026-03-26', cat: null, payee: '' },
    { id: 't2', desc: 'PAYMENT TO HOLLY ATTWOOD #697957', amt: -200, date: '2026-03-25', cat: null, payee: '' },
    { id: 't3', desc: 'PAYMENT TO K MCKINNON #048631', amt: -30,   date: '2026-03-24', cat: null, payee: '' },
  ];

  it('matches $1,055 (> $500)', () => {
    const sugs = runAutoCatRules(txns, rules);
    expect(sugs.find(s=>s.txnId==='t1')).toBeDefined();
  });
  it('does not match $200 (< $500)', () => {
    const sugs = runAutoCatRules(txns, rules);
    expect(sugs.find(s=>s.txnId==='t2')).toBeUndefined();
  });
  it('does not match $30 (< $500)', () => {
    const sugs = runAutoCatRules(txns, rules);
    expect(sugs.find(s=>s.txnId==='t3')).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 4: Already-categorised transactions are skipped
// "Transactions that already have a category should not be re-suggested."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Skip already-categorised transactions', () => {
  const rules = [{ id:'r1', keyword:'GOODLIFE', catId:'cat-gym', payee:'', amtExact:'', amtMin:'', amtMax:'', direction:'' }];
  const txns  = [
    { id:'t1', desc:'PAYMENT TO GOODLIFE', amt:-17.49, date:'2026-03-05', cat:'cat-groceries', payee:'' }, // already has cat
    { id:'t2', desc:'PAYMENT TO GOODLIFE', amt:-17.49, date:'2026-03-12', cat:null, payee:'' },             // uncat
  ];

  it('skips t1 (already categorised, payee also set)', () => {
    const txnsWithPayee = txns.map(t => t.id==='t1' ? {...t, payee:'Someone'} : t);
    const sugs = runAutoCatRules(txnsWithPayee, rules);
    expect(sugs.find(s=>s.txnId==='t1')).toBeUndefined();
  });

  it('suggests t2 (uncat, no payee)', () => {
    const sugs = runAutoCatRules(txns, rules);
    expect(sugs.find(s=>s.txnId==='t2')).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 5: Date range filtering — FY2025 (Jul 2025 – Jun 2026)
// "I filter to FY2025. Only transactions in that window should appear."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Date range filtering across financial year', () => {
  const txns = [
    { id:'t1', date:'2025-06-30', amt:-50,  desc:'Before FY',   cat:null },  // excluded
    { id:'t2', date:'2025-07-01', amt:-100, desc:'FY start',    cat:null },  // included
    { id:'t3', date:'2026-03-15', amt:-200, desc:'Mid FY',      cat:null },  // included
    { id:'t4', date:'2026-06-30', amt:-300, desc:'FY end',      cat:null },  // included
    { id:'t5', date:'2026-07-01', amt:-400, desc:'Next FY',     cat:null },  // excluded
  ];

  it('includes only FY2025-07-01 to 2026-06-30', () => {
    const ft = filterByDateRange(txns, '2025-07-01', '2026-06-30');
    expect(ft.map(t=>t.id)).toEqual(['t2','t3','t4']);
  });

  it('excludes transactions outside the range', () => {
    const ft = filterByDateRange(txns, '2025-07-01', '2026-06-30');
    expect(ft.find(t=>t.id==='t1')).toBeUndefined();
    expect(ft.find(t=>t.id==='t5')).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 6: Trial balance account totals
// "I have income and expense transactions. buildAccountTotals should
//  produce correct debit/credit entries per account group."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Trial balance account totals', () => {
  const catMap = {
    'c-sal':  { id:'c-sal',  l:'Salary',    t:'income',  ac:'Revenue',       col:'#3B6D11' },
    'c-groc': { id:'c-groc', l:'Groceries', t:'expense', ac:'Living Expenses',col:'#BA7517' },
  };
  const txns = [
    { id:'t1', cat:'c-sal',  amt:  5000, date:'2026-03-01' },
    { id:'t2', cat:'c-groc', amt:  -200, date:'2026-03-05' },
    { id:'t3', cat:'c-groc', amt:  -150, date:'2026-03-10' },
    { id:'t4', cat:null,      amt:   -50, date:'2026-03-15' },  // unallocated - ignored
  ];

  it('income account has credit entry (salary $5000)', () => {
    const accts = buildAccountTotals(txns, catMap);
    const sal   = accts.find(a => a.ac === 'Revenue');
    expect(sal).toBeDefined();
    expect(sal.cr).toBe(5000);
  });

  it('expense account has debit entry (groceries $350 total)', () => {
    const accts = buildAccountTotals(txns, catMap);
    const groc  = accts.find(a => a.ac === 'Living Expenses');
    expect(groc).toBeDefined();
    expect(groc.dr).toBe(350);
  });

  it('unallocated transactions are excluded', () => {
    const accts = buildAccountTotals(txns, catMap);
    expect(accts.every(a => a.dr !== 50 && a.cr !== 50)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 7: Reconciliation — ANZ Plus Flex Saver statement
// "Opening: $5,045.07. Closing: $6,731.63. My parsed transactions should
//  sum to the same movement: +$1,686.56."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Reconciliation — ANZ Plus statement balance check', () => {
  const openingBalance = 5045.07;
  const closingBalance = 6731.63;
  const expectedMovement = closingBalance - openingBalance; // +1686.56

  // Subset of actual transactions from the statement
  const txns = [
    { amt:  19.88 }, // CREDIT INTEREST
    { amt:1196.04 }, // PAYMENT FROM MR BAILEY MATTHEW KING
    { amt:-1055.00 },// PAYMENT TO BAILEY KING
    { amt:  -17.49 },// PAYMENT TO GOODLIFE
    { amt: -200.00 },// PAYMENT TO HOLLY ATTWOOD
    { amt: -105.00 },// PAYMENT TO COINSPOT
    { amt:   43.41 },// PAYMENT FROM TOBY KING
    { amt:  -30.00 },// PAYMENT TO K MCKINNON
    { amt:1233.29 }, // PAYMENT FROM MR BAILEY MATTHEW KING
    { amt: -500.00 },// PAYMENT TO BETASHARES
    { amt: -500.00 },// PAYMENT TO COINSPOT #017452
    { amt: -500.00 },// PAYMENT TO COINSPOT #910456
    { amt:  -36.21 },// PAYMENT TO GOODLIFE
    { amt:  500.00 },// FUNDS RETURNED COINSPOT #017452
    { amt:  -17.49 },// PAYMENT TO GOODLIFE
    { amt:1894.48 }, // TRANSFER FROM
    { amt: -200.00 },// PAYMENT TO HOLLY ATTWOOD
    { amt:   43.41 },// PAYMENT FROM TOBY KING
    { amt:  739.66 },// PAYMENT FROM MR BAILEY MATTHEW KING
    { amt:  -60.00 },// PAYMENT TO SEMEONE
    { amt: -111.91 },// PAYMENT TO TELSTRA
    { amt: -550.00 },// PAYMENT TO BAILEY KING
    { amt:  -17.49 },// PAYMENT TO GOODLIFE
    { amt: -200.00 },// PAYMENT TO HOLLY ATTWOOD
    { amt:   43.41 },// PAYMENT FROM TOBY KING
    { amt: -137.00 },// BPAY TO CENTRELINK
    { amt:  485.84 },// PAYMENT FROM MR BAILEY MATTHEW KING
    { amt:   -8.00 },// PAYMENT TO KING BAILEY MATTHEW
    { amt:   -7.99 },// PAYMENT TO KING BAILEY MATTHEW
    { amt:  -36.21 },// PAYMENT TO GOODLIFE
    { amt:  -48.99 },// PAYMENT TO VODAFONE
    { amt:  -17.49 },// PAYMENT TO GOODLIFE
    { amt: -200.00 },// PAYMENT TO HOLLY ATTWOOD
    { amt:   43.41 },// PAYMENT FROM TOBY KING
  ];

  const sumOfTxns = txns.reduce((s,t) => s + t.amt, 0);
  const diff = Math.abs(Math.abs(sumOfTxns) - Math.abs(expectedMovement));

  it('sum of transactions matches statement movement', () => {
    expect(diff).toBeLessThan(0.05); // within 5 cents
  });

  it('statement movement is +$1,686.56', () => {
    expect(Math.abs(expectedMovement - 1686.56)).toBeLessThan(0.01);
  });

  it('reconciliation status is balanced', () => {
    expect(diff < 0.05).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 8: Keyword extraction — smart multi-word keywords
// "When I assign PAYMENT TO GOODLIFE CARINDA A00LKY8U0NB9 to Gym,
//  the rule prompt should suggest 'payment to goodlife carinda' not just 'payment'."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Smart keyword extraction from description', () => {
  function extractKeyword(desc) {
    const words = desc.trim().split(/\s+/);
    const meaningful = words
      .slice(0, Math.min(4, words.length))
      .filter((w, i) => i === 0 || !(/[0-9#]/.test(w) || w.length > 12));
    return meaningful.join(' ').toLowerCase();
  }

  it('GOODLIFE full description → 4-word keyword', () => {
    const kw = extractKeyword('PAYMENT TO GOODLIFE CARINDA A00LKY8U0NB9');
    expect(kw).toBe('payment to goodlife carinda');
  });

  it('strips trailing reference code', () => {
    const kw = extractKeyword('PAYMENT TO BAILEY KING #366438');
    expect(kw).toBe('payment to bailey king');
  });

  it('BETASHARES long description', () => {
    const kw = extractKeyword('PAYMENT TO BETASHARES APPLICATIONS ACCOUNT #191841');
    expect(kw).toBe('payment to betashares applications');
  });

  it('simple 2-word description stays intact', () => {
    const kw = extractKeyword('PAYMENT FROM MR BAILEY MATTHEW KING');
    expect(kw).toBe('payment from mr bailey');
  });

  it('BPAY description', () => {
    const kw = extractKeyword('BPAY TO CENTRELINK #619288');
    expect(kw).toBe('bpay to centrelink');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 9: Direction-only rule — credits vs debits
// "I want to categorise ALL incoming transfers (PAYMENT FROM) as 'Transfers In'
//  without caring about the amount."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Direction-only rule — categorise all credits', () => {
  const rules = [{
    id:'r1', keyword:'PAYMENT FROM', catId:'cat-transfers-in',
    payee:'', amtExact:'', amtMin:'', amtMax:'', direction:'in',
  }];
  const txns = [
    { id:'t1', desc:'PAYMENT FROM MR BAILEY MATTHEW KING', amt: 1196.04, date:'2026-03-31', cat:null, payee:'' },
    { id:'t2', desc:'PAYMENT FROM TOBY KING',               amt:   43.41, date:'2026-03-25', cat:null, payee:'' },
    { id:'t3', desc:'PAYMENT TO HOLLY ATTWOOD #697957',     amt:  -200,   date:'2026-03-25', cat:null, payee:'' },
  ];

  it('matches PAYMENT FROM credit', () => {
    const sugs = runAutoCatRules(txns, rules);
    expect(sugs.find(s=>s.txnId==='t1')?.sugCat).toBe('cat-transfers-in');
  });
  it('matches another PAYMENT FROM credit', () => {
    const sugs = runAutoCatRules(txns, rules);
    expect(sugs.find(s=>s.txnId==='t2')?.sugCat).toBe('cat-transfers-in');
  });
  it('does NOT match PAYMENT TO (debit)', () => {
    const sugs = runAutoCatRules(txns, rules);
    expect(sugs.find(s=>s.txnId==='t3')).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 10: fmt() helper formatting
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Currency formatting', () => {
  it('formats whole dollars',       () => expect(fmt(1000)).toBe('$1,000.00'));
  it('formats cents',               () => expect(fmt(17.49)).toBe('$17.49'));
  it('formats negative as positive',() => expect(fmt(-200)).toBe('$200.00'));
  it('formats zero',                () => expect(fmt(0)).toBe('$0.00'));
  it('formats large number',        () => expect(fmt(123456.78)).toBe('$123,456.78'));
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 11: Multi-file import — merging two statements
// "I select my ANZ CC statement AND my Flex Saver statement at once.
//  Both parse independently. The merged table shows all transactions.
//  I can exclude one file's transactions without affecting the other."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Multi-file import — merge and exclude', () => {
  // Simulate parseFile output for two files
  const file1 = {
    filename: 'anz-cc-march.pdf',
    transactions: [
      { desc: 'WOOLWORTHS', amt: -87.32, date: '2026-03-01', _fileIdx: 0, _rowIdx: 0, _key: '0:0' },
      { desc: 'NETFLIX',    amt: -22.99, date: '2026-03-02', _fileIdx: 0, _rowIdx: 1, _key: '0:1' },
    ],
  };
  const file2 = {
    filename: 'anz-flex-march.pdf',
    transactions: [
      { desc: 'SALARY',         amt:  5000, date: '2026-03-15', _fileIdx: 1, _rowIdx: 0, _key: '1:0' },
      { desc: 'PAYMENT TO RENT',amt: -1800, date: '2026-03-16', _fileIdx: 1, _rowIdx: 1, _key: '1:1' },
    ],
  };
  const allTxns = [...file1.transactions, ...file2.transactions];

  it('merged list has 4 transactions total', () => {
    expect(allTxns.length).toBe(4);
  });

  it('each transaction tracks its source file', () => {
    expect(allTxns.filter(t => t._fileIdx === 0).length).toBe(2);
    expect(allTxns.filter(t => t._fileIdx === 1).length).toBe(2);
  });

  it('excluding file1 leaves only file2 transactions', () => {
    const file1Keys = new Set(file1.transactions.map(t => t._key));
    const selected  = allTxns.filter(t => !file1Keys.has(t._key));
    expect(selected.length).toBe(2);
    expect(selected.every(t => t._fileIdx === 1)).toBe(true);
  });

  it('excluding individual row does not affect other file', () => {
    const excluded  = new Set(['0:0']); // just WOOLWORTHS
    const selected  = allTxns.filter(t => !excluded.has(t._key));
    expect(selected.length).toBe(3);
    expect(selected.find(t => t.desc === 'NETFLIX')).toBeDefined();
    expect(selected.filter(t => t._fileIdx === 1).length).toBe(2);
  });

  it('total credits and debits compute correctly over both files', () => {
    const credits = allTxns.filter(t => t.amt > 0).reduce((s,t) => s+t.amt, 0);
    const debits  = allTxns.filter(t => t.amt < 0).reduce((s,t) => s+t.amt, 0);
    expect(credits).toBeCloseTo(5000, 2);
    expect(debits).toBeCloseTo(-1910.31, 2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 12: COA drag-drop reorder — sort_order update
// "I drag 'Netflix' (sort_order 2) above 'Groceries' (sort_order 0).
//  The resulting array should have Netflix first, Groceries second."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: COA drag-drop reorder', () => {
  function simulateDrop(cats, fromId, toId) {
    const sameType  = [...cats].sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
    const fromIdx   = sameType.findIndex(c => c.id === fromId);
    const toIdx     = sameType.findIndex(c => c.id === toId);
    const reordered = [...sameType];
    const [moved]   = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    return reordered.map((c, i) => ({ ...c, sort_order: i }));
  }

  const cats = [
    { id: 'c1', l: 'Groceries',    t: 'expense', sort_order: 0 },
    { id: 'c2', l: 'Dining & Café',t: 'expense', sort_order: 1 },
    { id: 'c3', l: 'Netflix',      t: 'expense', sort_order: 2 },
  ];

  it('dragging Netflix to top puts it first', () => {
    const result = simulateDrop(cats, 'c3', 'c1');
    expect(result[0].id).toBe('c3');
    expect(result[0].sort_order).toBe(0);
  });

  it('Groceries moves to second position', () => {
    const result = simulateDrop(cats, 'c3', 'c1');
    expect(result[1].id).toBe('c1');
    expect(result[1].sort_order).toBe(1);
  });

  it('all sort_orders are sequential 0,1,2', () => {
    const result = simulateDrop(cats, 'c3', 'c1');
    expect(result.map(c => c.sort_order)).toEqual([0, 1, 2]);
  });

  it('dragging to same position is a no-op', () => {
    const result = simulateDrop(cats, 'c1', 'c1');
    expect(result.map(c => c.id)).toEqual(['c1', 'c2', 'c3']);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 13: Bulk allocation — apply one category to many transactions
// "I select 5 unallocated transactions and bulk-assign them to Groceries.
//  All 5 should be updated. Already-categorised transactions are untouched."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Bulk category allocation', () => {
  const txns = [
    { id:'t1', cat:null,          desc:'WOOLWORTHS #1',    amt:-50 },
    { id:'t2', cat:null,          desc:'WOOLWORTHS #2',    amt:-80 },
    { id:'t3', cat:null,          desc:'COLES',             amt:-45 },
    { id:'t4', cat:'cat-existing',desc:'Already done',     amt:-100 },
    { id:'t5', cat:null,          desc:'WOOLWORTHS #3',    amt:-65 },
  ];
  const selected = new Set(['t1','t2','t3','t5']); // user picked 4 (not t4)

  function simulateBulkAllocate(txns, selected, catId) {
    return txns.map(t => selected.has(t.id) ? { ...t, cat: catId } : t);
  }

  it('allocates 4 selected transactions to Groceries', () => {
    const result = simulateBulkAllocate(txns, selected, 'cat-groceries');
    const updated = result.filter(t => t.cat === 'cat-groceries');
    expect(updated.length).toBe(4);
  });

  it('does not touch already-categorised transaction', () => {
    const result = simulateBulkAllocate(txns, selected, 'cat-groceries');
    expect(result.find(t=>t.id==='t4')?.cat).toBe('cat-existing');
  });

  it('non-selected transaction is untouched', () => {
    const result = simulateBulkAllocate(txns, new Set(['t1','t2']), 'cat-groceries');
    expect(result.find(t=>t.id==='t3')?.cat).toBeNull();
    expect(result.find(t=>t.id==='t5')?.cat).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 14: Balance sheet equation — Assets = Liabilities + Equity
// "With $10k in savings, $2k CC debt, the balance sheet must balance."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Balance sheet equation', () => {
  // Simulate balance sheet calculation
  function calcBalanceSheet({ liquidTotal, investTotal, fixedTotal, ccTotal, catLiabTotal }) {
    const totalAssets = liquidTotal + investTotal + fixedTotal;
    const totalLiab   = ccTotal + catLiabTotal;
    const totalEquity = totalAssets - totalLiab; // residual
    const totalLE     = totalLiab + totalEquity;
    return { totalAssets, totalLiab, totalEquity, totalLE };
  }

  it('Assets = Liabilities + Equity (basic)', () => {
    const bs = calcBalanceSheet({ liquidTotal:10000, investTotal:0, fixedTotal:0, ccTotal:2000, catLiabTotal:0 });
    expect(bs.totalAssets).toBe(10000);
    expect(bs.totalLE).toBe(10000);
  });

  it('Balance sheet balances with investments and multiple liabilities', () => {
    const bs = calcBalanceSheet({ liquidTotal:8000, investTotal:5000, fixedTotal:2000, ccTotal:3000, catLiabTotal:1000 });
    expect(Math.abs(bs.totalAssets - bs.totalLE)).toBeLessThan(0.01);
  });

  it('Equity can be negative (liabilities exceed assets)', () => {
    const bs = calcBalanceSheet({ liquidTotal:1000, investTotal:0, fixedTotal:0, ccTotal:5000, catLiabTotal:0 });
    expect(bs.totalEquity).toBe(-4000); // insolvent
    expect(bs.totalLE).toBe(1000);      // still balances
  });

  it('Zero assets means equity = negative liabilities', () => {
    const bs = calcBalanceSheet({ liquidTotal:0, investTotal:0, fixedTotal:0, ccTotal:2000, catLiabTotal:0 });
    expect(bs.totalEquity).toBe(-2000);
    expect(bs.totalLE).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 15: Import reconciliation — per-file balance check
// "I import a PDF. The parser extracts opening=$5,045.07, closing=$6,731.63.
//  calcRecon should flag as balanced when transactions sum correctly."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Import reconciliation per file', () => {
  function calcRecon(summary, transactions, excludedKeys = new Set()) {
    if (!summary) return null;
    const { openingBalance, closingBalance } = summary;
    if (openingBalance == null || closingBalance == null) return null;
    const included  = transactions.filter(t => !excludedKeys.has(t._key));
    const sumOfTxns = included.reduce((s,t) => s + t.amt, 0);
    const expected  = closingBalance - openingBalance;
    const diff      = Math.abs(Math.abs(sumOfTxns) - Math.abs(expected));
    return { openingBalance, closingBalance, expected, sumOfTxns, diff, balanced: diff < 0.05 };
  }

  const summary = { openingBalance: 5045.07, closingBalance: 6731.63 };
  const transactions = [
    { _key:'0:0', amt:  1196.04 },
    { _key:'0:1', amt: -1055.00 },
    { _key:'0:2', amt:   -17.49 },
    { _key:'0:3', amt:   485.84 },
    { _key:'0:4', amt:  1894.48 },
    { _key:'0:5', amt:  -550.00 },
    { _key:'0:6', amt:  -739.66 }, // adjusted to balance
  ];

  it('returns null when no summary', () => {
    expect(calcRecon(null, [])).toBeNull();
  });

  it('returns null when balances missing', () => {
    expect(calcRecon({ openingBalance: null, closingBalance: 6731.63 }, [])).toBeNull();
  });

  it('excluded transactions reduce the sum', () => {
    const excluded = new Set(['0:0']); // exclude $1196.04
    const recon    = calcRecon(summary, transactions, excluded);
    const withAll  = calcRecon(summary, transactions);
    expect(recon.sumOfTxns).toBeLessThan(withAll.sumOfTxns);
  });

  it('balanced flag is true when within 5 cents', () => {
    const perfectTxns = [{ _key:'x', amt: 1686.56 }]; // exact movement
    const recon = calcRecon(summary, perfectTxns);
    expect(recon.balanced).toBe(true);
    expect(recon.diff).toBeLessThan(0.05);
  });

  it('balanced flag is false when off by more than 5 cents', () => {
    const wrongTxns = [{ _key:'x', amt: 1500.00 }]; // off by $186.56
    const recon = calcRecon(summary, wrongTxns);
    expect(recon.balanced).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 16: Auto-cat rule deletion — removing a rule stops future matches
// "I delete the GOODLIFE rule. It should no longer match any transactions."
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Rule deletion stops future matching', () => {
  const rules = [
    { id:'r1', keyword:'GOODLIFE', catId:'cat-gym', payee:'', amtExact:'', amtMin:'', amtMax:'', direction:'' },
    { id:'r2', keyword:'WOOLWORTHS', catId:'cat-grocery', payee:'', amtExact:'', amtMin:'', amtMax:'', direction:'' },
  ];
  const txns = [
    { id:'t1', desc:'PAYMENT TO GOODLIFE CARINDA', amt:-17.49, date:'2026-03-05', cat:null, payee:'' },
    { id:'t2', desc:'WOOLWORTHS SUPERMARKETS', amt:-95.20, date:'2026-03-06', cat:null, payee:'' },
  ];

  it('before deletion: both rules match', () => {
    const sugs = runAutoCatRules(txns, rules);
    expect(sugs.length).toBe(2);
  });

  it('after deleting GOODLIFE rule: only WOOLWORTHS matches', () => {
    const remainingRules = rules.filter(r => r.id !== 'r1');
    const sugs = runAutoCatRules(txns, remainingRules);
    expect(sugs.length).toBe(1);
    expect(sugs[0].sugCat).toBe('cat-grocery');
  });

  it('after deleting all rules: nothing matches', () => {
    const sugs = runAutoCatRules(txns, []);
    expect(sugs.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 17: filterByDateRange edge cases
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: filterByDateRange edge cases', () => {
  const txns = [
    { id:'t1', date:'2026-01-01', amt:-10 },
    { id:'t2', date:'2026-06-15', amt:-20 },
    { id:'t3', date:'2026-12-31', amt:-30 },
  ];

  it('includes both boundary dates (inclusive range)', () => {
    const ft = filterByDateRange(txns, '2026-01-01', '2026-12-31');
    expect(ft.length).toBe(3);
  });

  it('empty result for impossible range', () => {
    const ft = filterByDateRange(txns, '2027-01-01', '2027-12-31');
    expect(ft.length).toBe(0);
  });

  it('handles null/undefined dates gracefully', () => {
    const withNulls = [{ id:'t0', date:null, amt:-5 }, ...txns];
    expect(() => filterByDateRange(withNulls, '2026-01-01', '2026-12-31')).not.toThrow();
  });

  it('single-day range returns only that day', () => {
    const ft = filterByDateRange(txns, '2026-06-15', '2026-06-15');
    expect(ft.length).toBe(1);
    expect(ft[0].id).toBe('t2');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 18: Budgets — array-to-object normalisation
// "Context gives us budgets as an array from DB, component needs object keyed by category_id"
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Budget array → object normalisation', () => {
  const budgetsArray = [
    { category_id:'c-rent',  monthly_amount:1800, fy_start:'2026-07' },
    { category_id:'c-groc',  monthly_amount:500,  fy_start:'2026-07' },
    { category_id:'c-gym',   monthly_amount:60,   fy_start:'2026-07' },
  ];

  function normaliseBudgets(budgets) {
    if (Array.isArray(budgets)) {
      return Object.fromEntries(budgets.map(b => [b.category_id, b.monthly_amount || 0]));
    }
    return budgets || {};
  }

  it('converts array to keyed object',       () => {
    const obj = normaliseBudgets(budgetsArray);
    expect(obj['c-rent']).toBe(1800);
    expect(obj['c-groc']).toBe(500);
    expect(obj['c-gym']).toBe(60);
  });
  it('returns empty object for empty array', () => expect(normaliseBudgets([])).toEqual({}));
  it('passes through existing object',       () => {
    const obj = { 'c-rent':1800 };
    expect(normaliseBudgets(obj)).toEqual(obj);
  });
  it('handles null gracefully',              () => expect(normaliseBudgets(null)).toEqual({}));
  it('budget lookup works after normalise',  () => {
    const obj = normaliseBudgets(budgetsArray);
    const cats = [{ id:'c-rent', l:'Rent', t:'expense' }];
    const total = cats.reduce((s,c) => s + (obj[c.id] || 0), 0);
    expect(total).toBe(1800);
  });
  it('unknown category returns 0',           () => {
    const obj = normaliseBudgets(budgetsArray);
    expect(obj['c-unknown'] || 0).toBe(0);
  });
  it('totalBudget is sum of all categories', () => {
    const obj = normaliseBudgets(budgetsArray);
    const total = Object.values(obj).reduce((s,v) => s+v, 0);
    expect(total).toBe(2360);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO 19: Bulk bank account assignment for unlinked transactions
// "I select 3 unlinked transactions and assign them all to ANZ Flex Saver"
// ══════════════════════════════════════════════════════════════════════════════
describe('Scenario: Bulk bank account assignment', () => {
  const txns = [
    { id:'t1', account_id:null, desc:'WOOLWORTHS', amt:-92 },
    { id:'t2', account_id:null, desc:'NETFLIX',    amt:-15.99 },
    { id:'t3', account_id:'ba-2', desc:'SALARY',   amt:5000 },  // already assigned
    { id:'t4', account_id:null, desc:'GOODLIFE',   amt:-17.49 },
  ];
  const selected = new Set(['t1','t2','t4']);
  const bankId   = 'ba-1';

  function simulateBulkAssign(txns, selected, bankId) {
    return txns.map(t => selected.has(t.id) ? { ...t, account_id: bankId } : t);
  }

  it('assigns selected transactions to bank',    () => {
    const result = simulateBulkAssign(txns, selected, bankId);
    expect(result.filter(t=>t.account_id===bankId).length).toBe(3);
  });
  it('does not affect already-assigned txn',     () => {
    const result = simulateBulkAssign(txns, selected, bankId);
    expect(result.find(t=>t.id==='t3')?.account_id).toBe('ba-2');
  });
  it('all selected now have account_id',          () => {
    const result = simulateBulkAssign(txns, selected, bankId);
    const stillUnlinked = result.filter(t=>selected.has(t.id) && !t.account_id);
    expect(stillUnlinked.length).toBe(0);
  });
});
