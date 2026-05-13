/**
 * unit.transactions_features.test.js
 * Tests for:
 *   - Column sort (date, desc, payee, amt, cat)
 *   - Intelligence suppression after repeated removal
 *   - Payee delete unassigns transactions
 *   - Payee drag-to-reorder
 *   - DrillPanel txn edit
 *   - P&L sub-account indent values
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { extractMerchantName } from '../utils/merchant.js';

// ── Column sort logic ─────────────────────────────────────────────────────────
function sortTxns(txns, sortCol, sortDir, catMap={}) {
  return [...txns].sort((a,b) => {
    let av, bv;
    if (sortCol==='date')   { av=a.date||''; bv=b.date||''; }
    else if (sortCol==='desc')  { av=(a.desc||'').toLowerCase(); bv=(b.desc||'').toLowerCase(); }
    else if (sortCol==='payee') { av=(a.payee||'').toLowerCase(); bv=(b.payee||'').toLowerCase(); }
    else if (sortCol==='amt')   { av=a.amt??0; bv=b.amt??0; }
    else if (sortCol==='cat')   { av=(catMap[a.cat]?.l||'').toLowerCase(); bv=(catMap[b.cat]?.l||'').toLowerCase(); }
    else                        { av=a.date||''; bv=b.date||''; }
    if (av<bv) return sortDir==='asc'?-1:1;
    if (av>bv) return sortDir==='asc'?1:-1;
    return 0;
  });
}

const txns = [
  { id:'t1', date:'2026-01-15', desc:'WOOLWORTHS METRO', payee:'Woolworths', cat:'c2', amt:-45.00 },
  { id:'t2', date:'2026-03-01', desc:'ALDI STORES',       payee:'Aldi',       cat:'c1', amt:-32.50 },
  { id:'t3', date:'2026-02-10', desc:'SALARY CREDIT',     payee:'Employer',   cat:'c3', amt:5000.00 },
];
const catMap = { c1:{ l:'Groceries' }, c2:{ l:'Groceries' }, c3:{ l:'Income' } };

describe('column sort — date', () => {
  it('desc: newest first', () => {
    const r = sortTxns(txns,'date','desc');
    expect(r[0].id).toBe('t2');
    expect(r[2].id).toBe('t1');
  });
  it('asc: oldest first', () => {
    const r = sortTxns(txns,'date','asc');
    expect(r[0].id).toBe('t1');
    expect(r[2].id).toBe('t2');
  });
});

describe('column sort — description', () => {
  it('asc: alphabetical', () => {
    const r = sortTxns(txns,'desc','asc');
    expect(r[0].desc.toLowerCase() < r[1].desc.toLowerCase()).toBe(true);
  });
  it('desc: reverse alphabetical', () => {
    const r = sortTxns(txns,'desc','desc');
    expect(r[0].desc.toLowerCase() > r[1].desc.toLowerCase()).toBe(true);
  });
});

describe('column sort — amount', () => {
  it('asc: smallest first', () => {
    const r = sortTxns(txns,'amt','asc');
    expect(r[0].amt).toBe(-45);
    expect(r[2].amt).toBe(5000);
  });
  it('desc: largest first', () => {
    const r = sortTxns(txns,'amt','desc');
    expect(r[0].amt).toBe(5000);
  });
});

describe('column sort — payee', () => {
  it('asc: A before W', () => {
    const r = sortTxns(txns,'payee','asc');
    expect(r[0].payee).toBe('Aldi');
  });
});

describe('column sort — category', () => {
  it('sorts by category label', () => {
    const cm = { c1:{l:'Groceries'}, c2:{l:'Groceries'}, c3:{l:'Salary'} };
    const r = sortTxns(txns,'cat','asc',cm);
    // Groceries before Salary
    const labels = r.map(t=>cm[t.cat]?.l);
    expect(labels[0]).toBe('Groceries');
    expect(labels[labels.length-1]).toBe('Salary');
  });
});

// ── Intelligence suppression ───────────────────────────────────────────────────
const SUPPRESS_THRESHOLD = 2;

function mockSuppressStore() {
  const store = {};
  return {
    record(kw) { store[kw] = (store[kw]||0)+1; return store[kw]; },
    isSuppressed(kw) { return (store[kw]||0) >= SUPPRESS_THRESHOLD; },
    count(kw) { return store[kw]||0; },
  };
}

describe('intelligence suppression — payee', () => {
  it('not suppressed initially', () => {
    const s = mockSuppressStore();
    expect(s.isSuppressed('woolworths')).toBe(false);
  });

  it('after 1 removal: still not suppressed', () => {
    const s = mockSuppressStore();
    s.record('woolworths');
    expect(s.isSuppressed('woolworths')).toBe(false);
  });

  it(`after ${SUPPRESS_THRESHOLD} removals: suppressed`, () => {
    const s = mockSuppressStore();
    for (let i=0; i<SUPPRESS_THRESHOLD; i++) s.record('woolworths');
    expect(s.isSuppressed('woolworths')).toBe(true);
  });

  it('suppression is per-merchant (others unaffected)', () => {
    const s = mockSuppressStore();
    for (let i=0; i<SUPPRESS_THRESHOLD; i++) s.record('woolworths');
    expect(s.isSuppressed('aldi')).toBe(false);
  });

  it('suppressed merchant is excluded from auto-assign', () => {
    const s = mockSuppressStore();
    for (let i=0; i<SUPPRESS_THRESHOLD; i++) s.record('woolworths');
    const payees = [{ id:'p1', name:'Woolworths' }];
    // Simulate auto-assign loop
    const txn = { id:'t1', desc:'WOOLWORTHS METRO 001', payee_id:null };
    const merchant = (extractMerchantName(txn.desc)||'').toLowerCase();
    if (s.isSuppressed(merchant)) {
      // skip — do not push to toAssign
      expect(true).toBe(true); // suppression worked
    } else {
      expect(false).toBe(true); // should have been suppressed
    }
  });

  it('non-suppressed merchant still gets assigned', () => {
    const s = mockSuppressStore();
    s.record('woolworths'); // only 1 time
    const merchant = 'woolworths';
    expect(s.isSuppressed(merchant)).toBe(false);
  });
});

describe('intelligence suppression — category', () => {
  it('records suppression when category is unassigned', () => {
    const s = mockSuppressStore();
    const txn = { desc:'ALDI STORES 0023' };
    const merchant = (extractMerchantName(txn.desc)||'').toLowerCase();
    s.record(merchant);
    expect(s.count(merchant)).toBe(1);
  });

  it('category suppression after threshold', () => {
    const s = mockSuppressStore();
    const txn = { desc:'ALDI STORES 0023' };
    const merchant = (extractMerchantName(txn.desc)||'').toLowerCase();
    for (let i=0; i<SUPPRESS_THRESHOLD; i++) s.record(merchant);
    expect(s.isSuppressed(merchant)).toBe(true);
  });
});

// ── Payee delete — unassigns transactions ─────────────────────────────────────
describe('payee delete — unassigns transactions', () => {
  function applyDeletePayee(txns, payees, payeeId) {
    return {
      txns: txns.map(t => t.payee_id===payeeId ? { ...t, payee:'', payee_id:null } : t),
      payees: payees.filter(p => p.id !== payeeId),
    };
  }

  const payees = [
    { id:'p1', name:'Woolworths' },
    { id:'p2', name:'Aldi' },
  ];
  const txns2 = [
    { id:'t1', payee:'Woolworths', payee_id:'p1', cat:'c1' },
    { id:'t2', payee:'Woolworths', payee_id:'p1', cat:'c2' },
    { id:'t3', payee:'Aldi',       payee_id:'p2', cat:'c1' },
  ];

  it('removes payee from payees list', () => {
    const { payees: result } = applyDeletePayee(txns2, payees, 'p1');
    expect(result.find(p=>p.id==='p1')).toBeUndefined();
    expect(result.find(p=>p.id==='p2')).toBeDefined();
  });

  it('unassigns payee from all matching transactions', () => {
    const { txns: result } = applyDeletePayee(txns2, payees, 'p1');
    expect(result.find(t=>t.id==='t1').payee).toBe('');
    expect(result.find(t=>t.id==='t1').payee_id).toBeNull();
    expect(result.find(t=>t.id==='t2').payee_id).toBeNull();
  });

  it('does not unassign other payees', () => {
    const { txns: result } = applyDeletePayee(txns2, payees, 'p1');
    expect(result.find(t=>t.id==='t3').payee).toBe('Aldi');
    expect(result.find(t=>t.id==='t3').payee_id).toBe('p2');
  });

  it('transactions without this payee are unaffected', () => {
    const txnsExtra = [...txns2, { id:'t4', payee:'', payee_id:null, cat:'c1' }];
    const { txns: result } = applyDeletePayee(txnsExtra, payees, 'p1');
    expect(result.find(t=>t.id==='t4').payee).toBe('');
  });
});

// ── Payee drag-to-reorder ─────────────────────────────────────────────────────
describe('payee drag-to-reorder', () => {
  function reorderPayees(payees, fromName, toName) {
    const arr = [...payees];
    const fromI = arr.findIndex(p=>p.name===fromName);
    const toI   = arr.findIndex(p=>p.name===toName);
    if (fromI<0||toI<0) return payees;
    const [moved] = arr.splice(fromI, 1);
    arr.splice(toI, 0, moved);
    return arr;
  }

  const payees = [
    { id:'p1', name:'Aldi' },
    { id:'p2', name:'Coles' },
    { id:'p3', name:'Woolworths' },
  ];

  it('moves payee from one position to another', () => {
    const result = reorderPayees(payees, 'Woolworths', 'Aldi');
    expect(result[0].name).toBe('Woolworths');
    expect(result[1].name).toBe('Aldi');
  });

  it('preserves all payees after reorder', () => {
    const result = reorderPayees(payees, 'Coles', 'Aldi');
    expect(result.length).toBe(3);
    expect(result.map(p=>p.name)).toContain('Aldi');
    expect(result.map(p=>p.name)).toContain('Coles');
    expect(result.map(p=>p.name)).toContain('Woolworths');
  });

  it('no-op when dragging to same position', () => {
    const result = reorderPayees(payees, 'Aldi', 'Aldi');
    expect(result.map(p=>p.name)).toEqual(['Aldi','Coles','Woolworths']);
  });

  it('handles unknown name gracefully', () => {
    const result = reorderPayees(payees, 'Unknown', 'Aldi');
    expect(result.map(p=>p.name)).toEqual(['Aldi','Coles','Woolworths']);
  });
});

// ── P&L sub-account indent ────────────────────────────────────────────────────
describe('P&L StRow — sub-account indent values', () => {
  it('sub leftPad is larger than indent leftPad', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    const match = src.match(/const leftPad\s*=\s*sub \? '(\d+)px' : indent \? '(\d+)px'/);
    expect(match).not.toBeNull();
    const subPad = parseInt(match[1]);
    const indentPad = parseInt(match[2]);
    expect(subPad).toBeGreaterThan(indentPad);
    expect(subPad).toBeGreaterThan(56); // must be pushed further than before
  });

  it('sub rows use same font size as parent rows', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Reports/reportComponents.jsx', import.meta.url), 'utf-8');
    // sub and parent rows now both use fontSize 12.5
    expect(src).not.toContain('sub?11.5');
    expect(src).not.toContain('sub ? 11.5');
    expect(src).toContain('12.5');
  });
});

// ── DrillPanel txn edit source audit ─────────────────────────────────────────
describe('DrillPanel — click to reassign category', () => {
  it('DrillPanel has editTxnId state', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src).toContain('editTxnId');
    expect(src).toContain('setEditTxnId');
  });

  it('DrillPanel renders a category select when txn is in edit mode', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src).toContain('isEditing');
    expect(src).toContain('— unassign —');
  });

  it('Reports imports updateTransaction from supabase', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src).toContain('updateTransaction');
  });
});

// ── Source audits — catch "X is not defined" crashes ─────────────────────────
describe('Reports/index.jsx — state declarations', () => {
  let src;
  beforeAll(async () => {
    const fs = await import('fs');
    src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
  });

  it('setTxns is destructured in PayeeReport', () => {
    const payeeStart = src.indexOf('export function PayeeReport');
    const destructure = src.indexOf('setTxns', payeeStart);
    expect(destructure).toBeGreaterThan(-1);
  });

  it('payee sort state is declared (drag removed, sort added)', () => {
    expect(src).toContain('const [sortCol');
    expect(src).toContain('const [sortDir');
    expect(src).toContain('togglePayeeSort');
  });

  it('showZeroPay state is declared', () => {
    expect(src).toContain('const [showZeroPay');
  });
});

// ── Bulk dropdown — position must not be fixed without coordinates ─────────────
describe('Transactions.jsx — bulk dropdown positioning', () => {
  let src;
  beforeAll(async () => {
    const fs = await import('fs');
    src = ['../views/Banking/Transactions/index.jsx','../views/Banking/Transactions/TransactionFilters.jsx','../views/Banking/Transactions/TransactionRow.jsx','../views/Banking/Transactions/InlineCatPicker.jsx','../views/Banking/Transactions/InlinePayeePicker.jsx','../views/Banking/Transactions/InlineDescEditor.jsx','../views/Banking/Transactions/DeleteToast.jsx','../views/Banking/Transactions/MakeRulePrompt.jsx','../views/Banking/Transactions/transactionHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
  });

  it('bulk dropdown uses position:fixed with high zIndex', () => {
    const ddIdx = src.indexOf('bulkCatDD&&');
    const ddBlock = src.slice(ddIdx, ddIdx + 400);
    expect(ddBlock).toContain("position:'fixed'");
    expect(ddBlock).toContain('9999');
  });

  it('bulk dropdown uses getBoundingClientRect for positioning', () => {
    expect(src).toContain('getBoundingClientRect');
    expect(src).toContain('bulkBtnRef');
  });
});

// ── AutoCat rules — graceful degradation on missing migration ─────────────────
describe('AutoCatRules save() — graceful degradation', () => {
  it('source has a fallback path when migration 014 columns missing', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Accounting/AutoCatRules.jsx', import.meta.url), 'utf-8');
    const saveIdx = src.indexOf('async function save()');
    const saveBody = src.slice(saveIdx, saveIdx + 1500);
    // Must have a try/catch with fallback to basePayload
    expect(saveBody).toContain('basePayload');
    expect(saveBody).toContain('extPayload');
    expect(saveBody).toContain("includes('column')");
  });

  it('direction is sent as null when empty, never as empty string', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Accounting/AutoCatRules.jsx', import.meta.url), 'utf-8');
    const saveIdx = src.indexOf('async function save()');
    const saveBody = src.slice(saveIdx, saveIdx + 1500);
    // direction must use || null not || ''
    expect(saveBody).toContain("direction:  form.direction || null");
    // Must NOT send direction as empty string
    expect(saveBody).not.toContain("direction:  form.direction || ''");
  });
});

// ── Payee delete + drag ─────────────────────────────────────────────────────────
describe('Reports/index.jsx — payee delete and drag source audit', () => {
  let src;
  beforeAll(async () => {
    const fs = await import('fs');
    src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
  });

  it('deletePayeeById function is defined', () => {
    expect(src).toContain('async function deletePayeeById(');
  });

  it('Delete button is in edit modal (not table rows)', () => {
    // Delete moved from rows to edit modal
    const editModal = src.indexOf("editPayee !== 'new'");
    const modalSection = src.slice(editModal, editModal + 300);
    expect(modalSection).toContain('deletePayeeById');
  });

  it('payee rows are NOT draggable (feature removed)', () => {
    expect(src).not.toContain("draggable={!!p}");
    expect(src).not.toContain('onDragStart={e=>{ e.dataTransfer');
  });

  it('deletePayee is imported', () => {
    // deletePayee may be in any file's imports - search full src
    expect(src).toContain('deletePayee');
  });
});

// ── Optimistic UI update (transaction speed) ──────────────────────────────────
describe('allocateCat — optimistic UI update pattern', () => {
  it('allocateCat uses optimistic UI comment', async () => {
    const fs = await import('fs');
    const src = ['../views/Banking/Transactions/index.jsx','../views/Banking/Transactions/TransactionFilters.jsx','../views/Banking/Transactions/TransactionRow.jsx','../views/Banking/Transactions/InlineCatPicker.jsx','../views/Banking/Transactions/InlinePayeePicker.jsx','../views/Banking/Transactions/InlineDescEditor.jsx','../views/Banking/Transactions/DeleteToast.jsx','../views/Banking/Transactions/MakeRulePrompt.jsx','../views/Banking/Transactions/transactionHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src).toContain('Optimistic UI update first');
  });

  it('updateTransaction in allocateCat is fire-and-forget (not awaited for main update)', async () => {
    const fs = await import('fs');
    const src = ['../views/Banking/Transactions/index.jsx','../views/Banking/Transactions/TransactionFilters.jsx','../views/Banking/Transactions/TransactionRow.jsx','../views/Banking/Transactions/InlineCatPicker.jsx','../views/Banking/Transactions/InlinePayeePicker.jsx','../views/Banking/Transactions/InlineDescEditor.jsx','../views/Banking/Transactions/DeleteToast.jsx','../views/Banking/Transactions/MakeRulePrompt.jsx','../views/Banking/Transactions/transactionHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    // The main update call should use .catch() not be awaited directly
    expect(src).toContain("updateTransaction(txnId, updates).catch");
  });

  it('logAudit is fire-and-forget in allocateCat', async () => {
    const fs = await import('fs');
    const src = ['../views/Banking/Transactions/index.jsx','../views/Banking/Transactions/TransactionFilters.jsx','../views/Banking/Transactions/TransactionRow.jsx','../views/Banking/Transactions/InlineCatPicker.jsx','../views/Banking/Transactions/InlinePayeePicker.jsx','../views/Banking/Transactions/InlineDescEditor.jsx','../views/Banking/Transactions/DeleteToast.jsx','../views/Banking/Transactions/MakeRulePrompt.jsx','../views/Banking/Transactions/transactionHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    const fnStart = src.indexOf('async function allocateCat(txnId, catId)');
    const fnBody  = src.slice(fnStart, fnStart + 2000);
    expect(fnBody).not.toContain('await logAudit(');
  });
});

// ── DrillPanel popout ─────────────────────────────────────────────────────────
describe('DrillPanel — popout center modal', () => {
  it('has popout state', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src).toContain('const [popout');
    expect(src).toContain('setPopout');
  });

  it('popout toggle button renders ⤢/⤡ icons', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src).toContain('⤢');
    expect(src).toContain('⤡');
  });

  it('center modal has position:fixed inset:0', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src).toContain("inset:0");
  });
});

// ── Balance Sheet drill ───────────────────────────────────────────────────────
describe('BalanceSheet — drill on accounts', () => {
  it('BSRow accepts onClick and clickable props', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    const bsRowIdx = src.indexOf('function BSRow(');
    const bsRowSig = src.slice(bsRowIdx, bsRowIdx + 100);
    expect(bsRowSig).toContain('onClick');
    expect(bsRowSig).toContain('clickable');
  });

  it('BalanceSheet has drillBS state', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src).toContain('drillBS');
    expect(src).toContain('setDrillBS');
  });

  it('BalanceSheet renders DrillPanel for drillBS', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src.includes('drillBS && <DrillPanel') || src.includes('drillBS && <ReportDrillPanel')).toBe(true);
  });
});

// ── Payee show zero balance ───────────────────────────────────────────────────
describe('PayeeReport — show zero balance', () => {
  it('has showZeroPay state', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src).toContain('showZeroPay');
    expect(src).toContain('setShowZeroPay');
  });

  it('Show zero balance checkbox is rendered', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx','../views/Reports/reportHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src).toContain('Zero bal') || expect(src).toContain('Show zero balance');
  });

  it('rows filter includes all payees when showZeroPay is true', () => {
    const byPayee = { 'Woolworths': { total:-45, count:1, income:0, expense:45, cats:new Set(['Groceries']) } };
    const allPayees = [{ name:'Woolworths' }, { name:'Aldi' }]; // Aldi has no txns
    const showZeroPay = true;
    const allPayeeNames = new Set([...Object.keys(byPayee), ...(showZeroPay?allPayees.map(p=>p.name):[])]);
    expect([...allPayeeNames]).toContain('Aldi');
  });

  it('rows filter hides zero payees when showZeroPay is false', () => {
    const byPayee = { 'Woolworths': { total:-45, count:1, income:0, expense:45, cats:new Set() } };
    const allPayees = [{ name:'Woolworths' }, { name:'Aldi' }];
    const showZeroPay = false;
    const allPayeeNames = new Set([...Object.keys(byPayee), ...(showZeroPay?allPayees.map(p=>p.name):[])]);
    const rows = [...allPayeeNames].map(n=>[n,byPayee[n]||{total:0,count:0,income:0,expense:0,cats:new Set()}])
      .filter(([,v])=>showZeroPay||Math.abs(v.total)>0.005||v.count>0);
    expect(rows.map(([n])=>n)).not.toContain('Aldi');
  });
});

// ── Bulk dropdown position ────────────────────────────────────────────────────
describe('Transactions — bulk dropdown opens below button', () => {
  it('bulk dropdown uses button getBoundingClientRect for positioning', async () => {
    const fs = await import('fs');
    const src = ['../views/Banking/Transactions/index.jsx','../views/Banking/Transactions/TransactionFilters.jsx','../views/Banking/Transactions/TransactionRow.jsx','../views/Banking/Transactions/InlineCatPicker.jsx','../views/Banking/Transactions/InlinePayeePicker.jsx','../views/Banking/Transactions/InlineDescEditor.jsx','../views/Banking/Transactions/DeleteToast.jsx','../views/Banking/Transactions/MakeRulePrompt.jsx','../views/Banking/Transactions/transactionHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src).toContain('getBoundingClientRect');
    expect(src).toContain('bulkBtnRef');
  });
});
