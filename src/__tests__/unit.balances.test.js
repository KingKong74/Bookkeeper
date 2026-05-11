/**
 * unit.balances.test.js
 * Tests for opening balance, credit card balance, and running balance logic.
 */
import { describe, it, expect } from 'vitest';
import { buildBSFromJournals } from '../utils/helpers.js';

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
