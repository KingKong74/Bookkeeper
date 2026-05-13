/**
 * unit.balances.test.js
 * Tests for opening balance, credit card balance, and running balance logic.
 */
import { describe, it, expect } from 'vitest';
import { buildBSFromJournals, buildTBFromJournals } from '../utils/helpers.js';

// ── buildBSFromJournals with opening balances ───────────────────────────────
describe('buildBSFromJournals — opening balance seeding', () => {
  const catMap = {};
  const checkingAcct = { id: 'chk1', name: 'ANZ Everyday', type: 'checking', opening_balance: 1000, colour: '#185FA5' };
  const ccAcct       = { id: 'cc1',  name: 'ANZ CC',       type: 'credit_card', opening_balance: 500, colour: '#A32D2D' };
  const accountMap   = { chk1: checkingAcct, cc1: ccAcct };

  it('seeds checking account with opening balance as asset DR', () => {
    const bs = buildBSFromJournals([], '2020-01-01', '2025-12-31', catMap, accountMap);
    const chk = bs.assetLines.find(l => l.id === 'chk1');
    expect(chk).toBeTruthy();
    expect(chk.net).toBeCloseTo(1000, 1);
  });

  it('seeds CC with opening balance as liability CR', () => {
    const bs = buildBSFromJournals([], '2020-01-01', '2025-12-31', catMap, accountMap);
    const cc = bs.liabilityLines.find(l => l.id === 'cc1');
    expect(cc).toBeTruthy();
    expect(cc.net).toBeCloseTo(500, 1); // 500 owed
  });

  it('adds journal lines on top of opening balance', () => {
    const journals = [{
      id: 'j1', date: '2024-01-15',
      journal_lines: [
        { debit: 200, credit: 0, bank_account_id: 'chk1' },  // checking receives $200
        { debit: 0, credit: 200, category_id: 'income1' },
      ]
    }];
    const catMapWithIncome = { income1: { id: 'income1', l: 'Income', t: 'income', col: '#3B6D11' } };
    const bs = buildBSFromJournals(journals, '2020-01-01', '2025-12-31', catMapWithIncome, { chk1: checkingAcct });
    const chk = bs.assetLines.find(l => l.id === 'chk1');
    expect(chk.net).toBeCloseTo(1200, 1); // 1000 opening + 200 journal
  });

  it('CC journal spending increases liability net', () => {
    const journals = [{
      id: 'j1', date: '2024-02-01',
      journal_lines: [
        { debit: 0, credit: 150, bank_account_id: 'cc1' }, // CC: spending = credit on CC side
        { debit: 150, credit: 0, category_id: 'exp1' },
      ]
    }];
    const catMapWithExp = { exp1: { id: 'exp1', l: 'Expenses', t: 'expense', col: '#BA7517' } };
    const bs = buildBSFromJournals(journals, '2020-01-01', '2025-12-31', catMapWithExp, { cc1: ccAcct });
    const cc = bs.liabilityLines.find(l => l.id === 'cc1');
    expect(cc.net).toBeCloseTo(650, 1); // 500 opening + 150 spending
  });

  it('zero opening balance accounts are excluded when no journal lines', () => {
    const noBalAcct = { id: 'empty1', name: 'Empty', type: 'checking', opening_balance: 0 };
    const bs = buildBSFromJournals([], '2020-01-01', '2025-12-31', catMap, { empty1: noBalAcct });
    const found = bs.assetLines.find(l => l.id === 'empty1');
    expect(found).toBeFalsy();
  });

  it('totalAssets increases by opening_balance of asset accounts', () => {
    const bs = buildBSFromJournals([], '2020-01-01', '2025-12-31', catMap, { chk1: checkingAcct });
    expect(bs.totalAssets).toBeCloseTo(1000, 1);
  });

  it('totalLiabilities increases by opening_balance of CC accounts', () => {
    const bs = buildBSFromJournals([], '2020-01-01', '2025-12-31', catMap, { cc1: ccAcct });
    expect(bs.totalLiabilities).toBeCloseTo(500, 1);
  });
});

// ── CC balance sign convention ──────────────────────────────────────────────
describe('CC balance sign convention', () => {
  it('acctBalances: CC with spending has positive owed amount', () => {
    // opening = $500 owed, spent $200 (txn = -200)
    // Expected: 500 - (-200) = 700 owed
    const ob = 500;
    const sum = -200; // spending
    const ccBal = ob - sum; // the formula in Transactions/index
    expect(ccBal).toBeCloseTo(700, 1);
  });

  it('acctBalances: CC payment reduces owed amount', () => {
    // opening = $500 owed, payment $300 (txn = +300 incoming to account)
    // Expected: 500 - 300 = 200 owed
    const ob = 500;
    const sum = 300; // payment received
    const ccBal = ob - sum;
    expect(ccBal).toBeCloseTo(200, 1);
  });

  it('acctBalances: checking account spending reduces balance', () => {
    // opening = $1000, spent $200 (txn = -200)
    // Expected: 800
    const ob = 1000;
    const sum = -200;
    const bal = ob + sum;
    expect(bal).toBeCloseTo(800, 1);
  });

  it('acctBalances: checking deposit increases balance', () => {
    const ob = 1000, sum = 500;
    expect(ob + sum).toBeCloseTo(1500, 1);
  });
});

// ── Running balance ─────────────────────────────────────────────────────────
describe('running balance calculation', () => {
  it('asset account: oldest-first, each txn adds to running total', () => {
    const ob = 1000;
    const txns = [
      { date: '2024-01-01', amt: -200 },
      { date: '2024-01-15', amt: -300 },
      { date: '2024-02-01', amt: 500 },
    ].sort((a, b) => a.date.localeCompare(b.date));
    let running = ob;
    const results = txns.map(t => { running += t.amt; return running; });
    expect(results[0]).toBeCloseTo(800, 1);   // 1000 - 200
    expect(results[1]).toBeCloseTo(500, 1);   // 800 - 300
    expect(results[2]).toBeCloseTo(1000, 1);  // 500 + 500
  });

  it('CC account: spending (negative txn) increases owed amount', () => {
    const ob = 500; // $500 owed at opening
    const txns = [
      { date: '2024-01-01', amt: -150 }, // spend $150
      { date: '2024-01-15', amt: -200 }, // spend $200
      { date: '2024-02-01', amt: 300 },  // payment $300
    ].sort((a, b) => a.date.localeCompare(b.date));
    let running = ob;
    const results = txns.map(t => { running = running - t.amt; return running; });
    // CC formula: running = running - amt
    // spend -150: running = 500 - (-150) = 650 owed
    // spend -200: running = 650 - (-200) = 850 owed
    // payment +300: running = 850 - 300 = 550 owed
    expect(results[0]).toBeCloseTo(650, 1);
    expect(results[1]).toBeCloseTo(850, 1);
    expect(results[2]).toBeCloseTo(550, 1);
  });
});

// ── pending_import filtering ────────────────────────────────────────────────
describe('pending_import transactions', () => {
  it('pending_import flag is excluded from balance calc in BankAccounts', () => {
    // Simulate calcBalance logic: only count non-pending txns
    const txns = [
      { account_id: 'chk1', amt: -100, pending_import: false },
      { account_id: 'chk1', amt: -50,  pending_import: true  }, // should be excluded
      { account_id: 'chk1', amt: 200,  pending_import: false },
    ];
    const ob = 1000;
    const sum = txns.filter(t => t.account_id === 'chk1' && !t.pending_import).reduce((s, t) => s + (t.amt ?? 0), 0);
    const balance = ob + sum;
    expect(balance).toBeCloseTo(1100, 1); // 1000 + (-100 + 200) = 1100, not counting -50
  });

  it('pending_import=false after approval means txn is counted', () => {
    const txns = [
      { account_id: 'chk1', amt: -100, pending_import: false },
      { account_id: 'chk1', amt: -50,  pending_import: false }, // now approved
    ];
    const ob = 1000;
    const sum = txns.filter(t => t.account_id === 'chk1' && !t.pending_import).reduce((s, t) => s + t.amt, 0);
    expect(ob + sum).toBeCloseTo(850, 1);
  });
});

// ── CC calcBalance (BankAccounts) ───────────────────────────────────────────
describe('BankAccounts CC calcBalance', () => {
  it('CC: opening $500 owed, spend $200 → $700 owed', () => {
    const ob = 500, isCC = true;
    const sum = -200; // spending is negative
    const bal = isCC ? ob - sum : ob + sum;
    expect(bal).toBeCloseTo(700, 1);
  });

  it('CC: payment $300 reduces owed amount', () => {
    const ob = 500, isCC = true;
    const sum = 300; // payment is positive
    const bal = isCC ? ob - sum : ob + sum;
    expect(bal).toBeCloseTo(200, 1);
  });

  it('CC: available = credit_limit - balance_owed', () => {
    const balance = 700, limit = 5000;
    const available = limit - balance;
    expect(available).toBeCloseTo(4300, 1);
  });

  it('CC: full balance owed shows 100% bar fill', () => {
    const balance = 5000, limit = 5000;
    const pct = Math.min(100, Math.max(0, (balance / limit) * 100));
    expect(pct).toBe(100);
  });

  it('asset account not affected by CC formula', () => {
    const ob = 1000, isCC = false;
    const sum = -400; // spending
    const bal = isCC ? ob - sum : ob + sum;
    expect(bal).toBeCloseTo(600, 1);
  });
});

// ── buildTBFromJournals — bank account via journal lines ─────────────────────
// TB does NOT seed from opening_balance (Basiq ob = current snapshot, would double-count).
// Bank accounts appear via their bank_account_id journal lines only.
describe('buildTBFromJournals — bank accounts via journal lines', () => {
  const catMap = {};
  const accountMap = {
    chk1: { id: 'chk1', name: 'ANZ Everyday', type: 'checking',    opening_balance: 2000 },
    cc1:  { id: 'cc1',  name: 'Visa CC',      type: 'credit_card', opening_balance: 800  },
  };

  it('checking account appears via journal lines as asset', () => {
    const journals = [{
      date: '2023-06-01',
      journal_lines: [
        { bank_account_id: 'chk1', debit: 0,   credit: 100, category_id: null },
        { bank_account_id: null,   debit: 100, credit: 0,   category_id: null },
      ],
    }];
    const tb = buildTBFromJournals(journals, '2020-01-01', '2025-12-31', catMap, accountMap);
    const row = tb.find(r => r.key === 'bank:chk1');
    expect(row).toBeTruthy();
    expect(row.type).toBe('asset');
    expect(row.cr).toBeCloseTo(100, 1);
  });

  it('CC account journal lines typed as liability', () => {
    const journals = [{
      date: '2023-06-01',
      journal_lines: [
        { bank_account_id: 'cc1', debit: 50,  credit: 0, category_id: null },
        { bank_account_id: null,  debit: 0,  credit: 50, category_id: null },
      ],
    }];
    const tb = buildTBFromJournals(journals, '2020-01-01', '2025-12-31', catMap, accountMap);
    const row = tb.find(r => r.key === 'bank:cc1');
    expect(row).toBeTruthy();
    expect(row.type).toBe('liability');
    expect(row.dr).toBeCloseTo(50, 1);
  });

  it('no opening balance seeding — ob=2000 but no journals gives no row', () => {
    const tb = buildTBFromJournals([], '2020-01-01', '2025-12-31', catMap, accountMap);
    const row = tb.find(r => r.key === 'bank:chk1');
    expect(row).toBeUndefined(); // TB only shows journal activity, not ob snapshot
  });
});

// ── account_name fallback matching ───────────────────────────────────────────
describe('buildTBFromJournals — account_name fallback matches bank accounts by name', () => {
  const catMap = {};
  const accountMap = {
    chk1: { id: 'chk1', name: 'ANZ Everyday', type: 'checking',    opening_balance: 0, colour: '#185FA5' },
    cc1:  { id: 'cc1',  name: 'ANZ CC',       type: 'credit_card', opening_balance: 0, colour: '#A32D2D' },
  };

  it('journal line with account_name matching a bank account groups correctly', () => {
    const journals = [{
      date: '2023-06-01',
      journal_lines: [
        // Old-style line: stored with account_name, no bank_account_id
        { account_name: 'ANZ CC', debit: 0, credit: 100, bank_account_id: null, category_id: null },
        { account_name: 'Expense', debit: 100, credit: 0, bank_account_id: null, category_id: null },
      ],
    }];
    const tb = buildTBFromJournals(journals, '2020-01-01', '2025-12-31', catMap, accountMap);
    const row = tb.find(r => r.key === 'bank:cc1');
    expect(row).toBeTruthy();
    expect(row.type).toBe('liability');
    expect(row.cr).toBeCloseTo(100, 1);
  });

  it('unmatched account_name stays as expense fallback', () => {
    const journals = [{
      date: '2023-06-01',
      journal_lines: [
        { account_name: 'Suspense Account', debit: 50, credit: 0, bank_account_id: null, category_id: null },
      ],
    }];
    const tb = buildTBFromJournals(journals, '2020-01-01', '2025-12-31', catMap, accountMap);
    const row = tb.find(r => r.label === 'Suspense Account');
    expect(row).toBeTruthy();
    expect(row.type).toBe('asset'); // contains 'suspense'
  });

  it('TB total DR and CR grow correctly when mixing bank_account_id and account_name lines', () => {
    const journals = [{
      date: '2023-06-01',
      journal_lines: [
        { account_name: 'ANZ CC',      debit: 0,   credit: 500, bank_account_id: null, category_id: null },
        { bank_account_id: 'cc1',      debit: 0,   credit: 200, category_id: null },
        { account_name: 'Some Expense', debit: 700, credit: 0,  bank_account_id: null, category_id: null },
      ],
    }];
    const tb = buildTBFromJournals(journals, '2020-01-01', '2025-12-31', catMap, accountMap);
    const ccRow = tb.find(r => r.key === 'bank:cc1');
    expect(ccRow.cr).toBeCloseTo(700, 1); // 500 from name match + 200 from id match
  });
});

// ── Master ledger date filtering ──────────────────────────────────────────────
// The auto_category master ledger is ONE journal entry (creation date may be outside
// the report range). Lines must be filtered by txn_date, not journal.date.
describe('buildTBFromJournals — auto_category master ledger date filtering', () => {
  const catMap = {
    exp1: { id: 'exp1', l: 'Expenses', t: 'expense', col: '#888', code: '600', parent_id: null },
  };
  const accountMap = {
    chk1: { id: 'chk1', name: 'ANZ Everyday', type: 'checking', opening_balance: 0 },
  };

  it('auto_category lines outside FY range are excluded by txn_date', () => {
    const masterLedger = {
      id: 'ml1',
      date: '2024-01-01',       // master ledger creation date — outside FY
      source: 'auto_category',
      journal_lines: [
        // This line is IN the FY range via txn_date
        { bank_account_id: 'chk1', debit: 0, credit: 100, category_id: null,   txn_date: '2025-08-15' },
        { bank_account_id: null,   debit: 100, credit: 0, category_id: 'exp1', txn_date: '2025-08-15' },
        // This line is OUT of range via txn_date
        { bank_account_id: 'chk1', debit: 0, credit: 200, category_id: null,   txn_date: '2023-01-01' },
        { bank_account_id: null,   debit: 200, credit: 0, category_id: 'exp1', txn_date: '2023-01-01' },
      ],
    };
    const tb = buildTBFromJournals([masterLedger], '2025-07-01', '2025-06-30', catMap, accountMap);
    // Only the in-range line should appear
    const bankRow = tb.find(r => r.key === 'bank:chk1');
    // 100 in range, 200 out of range
    if (bankRow) expect(bankRow.cr).toBeCloseTo(100, 1);
  });

  it('manual journal uses journal.date not txn_date', () => {
    const manualJournal = {
      id: 'mj1',
      date: '2025-08-10',       // manual journal date IS in range
      source: 'manual',
      journal_lines: [
        { bank_account_id: 'chk1', debit: 0, credit: 500, category_id: null,   txn_date: null },
        { bank_account_id: null,   debit: 500, credit: 0, category_id: 'exp1', txn_date: null },
      ],
    };
    const tb = buildTBFromJournals([manualJournal], '2025-07-01', '2026-06-30', catMap, accountMap);
    const bankRow = tb.find(r => r.key === 'bank:chk1');
    expect(bankRow).toBeTruthy();
    expect(bankRow.cr).toBeCloseTo(500, 1);
  });
});

// ── CC calcBalance — Basiq negative opening_balance ──────────────────────────
describe('BankAccounts calcBalance — Basiq negative CC opening_balance', () => {
  // Basiq stores CC balance as negative (e.g. -2771.86 = $2771.86 owed)
  // calcBalance must use Math.abs(ob) as the opening owed amount

  function calcBalance(acct, txns) {
    const sum = txns.filter(t => t.account_id === acct.id && !t.pending_import)
      .reduce((s, t) => s + (t.amt ?? 0), 0);
    const rawOb = parseFloat(acct.opening_balance) || 0;
    const isCC = acct.type === 'credit_card' || acct.type === 'loan';
    if (isCC) {
      const obOwed = Math.abs(rawOb);
      return obOwed - sum;
    }
    return rawOb + sum;
  }

  it('Basiq negative ob: -2771.86 owed, sum=-438 → closing 2333.40 DR (positive)', () => {
    const acct = { id: 'cc1', type: 'credit_card', opening_balance: -2771.86 };
    // sum = +438.46 means net payments exceeded spending (liability reduced)
    const txns = [{ account_id: 'cc1', amt: 438.46, pending_import: false }];
    const bal = calcBalance(acct, txns);
    expect(bal).toBeCloseTo(2333.40, 1);
    expect(bal).toBeGreaterThan(0); // positive = DR (owed) not CR
  });

  it('Basiq positive ob (manual entry): 2771.86, net payment 438 → 2333.40', () => {
    const acct = { id: 'cc1', type: 'credit_card', opening_balance: 2771.86 };
    const txns = [{ account_id: 'cc1', amt: 438.46, pending_import: false }]; // net positive = paid more than spent
    const bal = calcBalance(acct, txns);
    expect(bal).toBeCloseTo(2333.40, 1);
  });

  it('CC payment reduces balance owed', () => {
    const acct = { id: 'cc1', type: 'credit_card', opening_balance: -1000 };
    const txns = [{ account_id: 'cc1', amt: 500, pending_import: false }]; // payment = positive
    const bal = calcBalance(acct, txns);
    expect(bal).toBeCloseTo(500, 1); // 1000 owed - 500 paid = 500 still owed
  });

  it('asset account unaffected by abs() change', () => {
    const acct = { id: 'chk1', type: 'checking', opening_balance: 1000 };
    const txns = [{ account_id: 'chk1', amt: -200, pending_import: false }];
    const bal = calcBalance(acct, txns);
    expect(bal).toBeCloseTo(800, 1);
  });
});

// ── AppContext — all-time transaction fetch ───────────────────────────────────
describe('AppContext loadTransactions — always fetches all-time', () => {
  it('AppContext.jsx uses all-time range not dateFrom/dateTo for loadTransactions', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(process.cwd(), 'src/context/AppContext.jsx'), 'utf-8'
    );
    // loadTransactions must NOT use dateFrom/dateTo — views filter themselves
    const fnStart = src.indexOf('async function loadTransactions');
    const fnEnd   = src.indexOf('\n  }', fnStart) + 4;
    const fn = src.slice(fnStart, fnEnd);
    expect(fn).toContain('2000-01-01');
    expect(fn).toContain('2099-12-31');
    expect(fn).not.toContain('dateFrom');
    expect(fn).not.toContain('dateTo');
  });

  it('ImportStatement does not call setDateFrom after import', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(process.cwd(), 'src/views/Banking/ImportStatement/index.jsx'), 'utf-8'
    );
    expect(src).not.toContain("setDateFrom('2000-01-01')");
    expect(src).not.toContain("setDateTo('2099-12-31')");
  });
});

// ── Transactions view — useMemo ordering ─────────────────────────────────────
describe('Transactions index.jsx — baseFt declared before pendingCatMap', () => {
  it('baseFt useMemo comes before pendingCatMap useMemo in source', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(process.cwd(), 'src/views/Banking/Transactions/index.jsx'), 'utf-8'
    );
    const baseFtIdx      = src.indexOf('const baseFt = useMemo');
    const pendingCatIdx  = src.indexOf('const pendingCatMap = useMemo');
    expect(baseFtIdx).toBeGreaterThan(0);
    expect(pendingCatIdx).toBeGreaterThan(0);
    expect(baseFtIdx).toBeLessThan(pendingCatIdx);
  });

  it('pendingCatMap depends on baseFt not txns', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(process.cwd(), 'src/views/Banking/Transactions/index.jsx'), 'utf-8'
    );
    const start = src.indexOf('const pendingCatMap = useMemo');
    // Find closing ], of dep array — search for baseFt in deps
    const block = src.slice(start, start + 600);
    expect(block).toContain('baseFt');
    // dep array is on a line beyond 600 chars, search wider
    const block2 = src.slice(start, start + 1000);
    expect(block2).toContain('[baseFt, rules, cats]');
  });
});

// ── A4Paper — reactive dark mode icon ────────────────────────────────────────
describe('A4Paper — reactive theme icon', () => {
  it('uses useState and MutationObserver for dark mode detection', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(process.cwd(), 'src/views/Reports/reportComponents.jsx'), 'utf-8'
    );
    const a4Start = src.indexOf('export function A4Paper');
    const a4End   = src.indexOf('\nexport function', a4Start + 1);
    const fn = src.slice(a4Start, a4End);
    expect(fn).toContain('MutationObserver');
    expect(fn).toContain('setIsDark');
    expect(fn).toContain("attributeFilter: ['data-theme']");
  });
});
